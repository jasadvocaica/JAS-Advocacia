-- ============================================================
-- RASCUNHO DE REFERÊNCIA — Agentes de IA sem n8n (fases 0 a 2)
-- Acompanha ESPECIFICACAO-AGENTES-IA.md, versão 2 (seção 6).
-- O Codex deve conferir contra o schema atual antes de aplicar e dividir
-- em migrations com o nome padrão do projeto.
-- Só acrescenta: nada existente é removido ou alterado de forma incompatível.
--
-- ANTES, uma vez só, no SQL Editor (o valor NÃO vai para o git):
--   select vault.create_secret('<mesmo valor do secret AGENTES_TOKEN>', 'agentes_token');
-- ============================================================

-- 1) Catálogo: qual Edge Function executa cada agente (substitui webhook_url do n8n)
alter table public.agentes_ia
  add column if not exists funcao text,
  add column if not exists persona text,
  -- grupos de ferramentas de leitura: clientes, processos, controladoria, diligencias, financeiro
  add column if not exists modulos_leitura text[] not null default '{}',
  add column if not exists acoes_permitidas text[] not null default '{}',
  -- 'sincrono' = disparo espera a resposta (Vanessa); 'assincrono' = entra na fila
  add column if not exists modo_execucao text not null default 'sincrono';

alter table public.agentes_ia drop constraint if exists agentes_ia_modo_execucao_check;
alter table public.agentes_ia add constraint agentes_ia_modo_execucao_check
  check (modo_execucao in ('sincrono', 'assincrono'));
alter table public.agentes_ia drop constraint if exists agentes_ia_funcao_check;
alter table public.agentes_ia add constraint agentes_ia_funcao_check
  check (funcao is null or funcao ~ '^[a-z0-9-]{3,60}$');

-- 2) Execuções: identidade, idempotência, retentativas e destrave
alter table public.agente_execucoes
  add column if not exists executar_como uuid references auth.users(id) on delete set null,
  add column if not exists chave_idempotencia text,
  add column if not exists tentativas integer not null default 0,
  add column if not exists reservada_em timestamptz;

create unique index if not exists agente_execucoes_idempotencia
  on public.agente_execucoes (agente_id, chave_idempotencia)
  where chave_idempotencia is not null;
create index if not exists agente_execucoes_fila
  on public.agente_execucoes (status, iniciado_em)
  where status in ('pendente', 'executando');

-- 3) A fila: reserva até p_limite execuções, no máximo 1 por agente e
--    p_limite no total. Serializada por advisory lock: dois trabalhadores ao
--    mesmo tempo nunca pegam a mesma execução nem passam do limite.
create or replace function public.agentes_reservar(p_limite integer default 3)
returns table (execucao_id uuid, funcao text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_livres integer;
begin
  perform pg_advisory_xact_lock(hashtext('agentes_reservar'));
  select greatest(0, p_limite - count(*))::int into v_livres
    from agente_execucoes where status = 'executando';
  if v_livres = 0 then return; end if;

  return query
  with ordenadas as (
    select e.id, e.iniciado_em,
           row_number() over (partition by e.agente_id order by e.iniciado_em) as n
      from agente_execucoes e
      join agentes_ia a on a.id = e.agente_id
     where e.status = 'pendente' and a.ativo and a.funcao is not null
       and not exists (select 1 from agente_execucoes x
                        where x.agente_id = e.agente_id and x.status = 'executando')
  ), escolhidas as (
    select e.id
      from agente_execucoes e
      join ordenadas o on o.id = e.id
     where o.n = 1
     order by o.iniciado_em
     limit v_livres
       for update of e skip locked
  )
  update agente_execucoes e
     set status = 'executando', reservada_em = now(), tentativas = e.tentativas + 1
    from escolhidas s, agentes_ia a
   where e.id = s.id and a.id = e.agente_id
  returning e.id, a.funcao;
end;
$$;

-- Destrave: o que ficou "executando" há mais de 10 min volta para a fila;
-- depois de 3 tentativas, vira erro.
create or replace function public.agentes_destravar()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  with travadas as (
    update agente_execucoes
       set status = case when tentativas < 3 then 'pendente'::status_execucao else 'erro'::status_execucao end,
           erro = case when tentativas < 3 then erro else 'O agente travou 3 vezes; tente de novo mais tarde.' end,
           finalizado_em = case when tentativas < 3 then null else now() end
     where status = 'executando'
       and reservada_em < now() - interval '10 minutes'
    returning 1
  )
  select count(*) into v_n from travadas;
  return v_n;
end;
$$;

-- Chamada ao agente falhou (rede ou 5xx): volta para a fila, ou erro depois de 3 tentativas.
create or replace function public.agentes_devolver(p_execucao uuid, p_motivo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_status status_execucao;
begin
  update agente_execucoes
     set status = case when tentativas < 3 then 'pendente'::status_execucao else 'erro'::status_execucao end,
         reservada_em = null,
         erro = case when tentativas < 3 then erro else left('Falhou 3 vezes: ' || coalesce(p_motivo, ''), 500) end,
         finalizado_em = case when tentativas < 3 then null else now() end
   where id = p_execucao and status = 'executando'
  returning status into v_status;
  insert into agente_execucao_logs (execucao_id, nivel, mensagem)
  values (p_execucao, 'warn', left('Chamada ao agente falhou: ' || coalesce(p_motivo, ''), 500));
  return v_status::text;
end;
$$;

revoke all on function public.agentes_reservar(integer) from public, anon, authenticated;
revoke all on function public.agentes_destravar() from public, anon, authenticated;
revoke all on function public.agentes_devolver(uuid, text) from public, anon, authenticated;
grant execute on function public.agentes_reservar(integer) to service_role;
grant execute on function public.agentes_destravar() to service_role;
grant execute on function public.agentes_devolver(uuid, text) to service_role;

-- 4) Ações propostas pelos agentes (só executam depois de aprovadas)
create table if not exists public.agente_acoes (
  id uuid primary key default gen_random_uuid(),
  execucao_id uuid not null references public.agente_execucoes(id) on delete cascade,
  ordem integer not null default 0,
  tipo text not null check (tipo in (
    'criar_item_controladoria', 'responder_whatsapp', 'criar_documento_rascunho',
    'registrar_nota_processo', 'agendar_publicacao')),
  payload jsonb not null,
  motivo text,
  status text not null default 'proposta' check (status in (
    'proposta', 'aprovada', 'executando', 'executada', 'rejeitada', 'erro')),
  resultado jsonb,
  erro text,
  aprovada_por uuid references auth.users(id) on delete set null,
  aprovada_em timestamptz,
  executada_em timestamptz,
  criado_em timestamptz not null default now()
);
alter table public.agente_acoes enable row level security;
create index if not exists agente_acoes_execucao on public.agente_acoes (execucao_id, ordem);
create policy "ver acoes de agentes" on public.agente_acoes for select to authenticated
  using (public.has_permission(auth.uid(), 'controladoria', 'visualizar'));
-- sem política de escrita: só Edge Functions (service role) gravam

-- 5) Consumo de IA por execução
create table if not exists public.agente_consumo (
  id bigserial primary key,
  execucao_id uuid references public.agente_execucoes(id) on delete set null,
  agente_id uuid not null references public.agentes_ia(id) on delete restrict,
  modelo text not null,
  tokens_entrada integer not null default 0,
  tokens_saida integer not null default 0,
  custo_usd numeric(10, 5) not null default 0,
  criado_em timestamptz not null default now()
);
alter table public.agente_consumo enable row level security;
create index if not exists agente_consumo_mes on public.agente_consumo (agente_id, criado_em);
create policy "ver consumo de agentes" on public.agente_consumo for select to authenticated
  using (public.has_permission(auth.uid(), 'controladoria', 'visualizar'));

-- 6) Gatilhos (agenda e eventos), editáveis pelo sistema
create table if not exists public.agente_gatilhos (
  id uuid primary key default gen_random_uuid(),
  agente_id uuid not null references public.agentes_ia(id) on delete cascade,
  nome text not null,
  tipo text not null check (tipo in ('agenda', 'evento')),
  dias_semana smallint[] not null default '{1,2,3,4,5}',   -- 0 = domingo
  hora time,                                               -- fuso America/Cuiaba
  evento text,                                             -- ex.: 'whatsapp.lead_novo'
  entrada jsonb not null default '{}'::jsonb,
  executar_como uuid references auth.users(id) on delete set null,
  ativo boolean not null default true,
  ultima_execucao date,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.agente_gatilhos enable row level security;
create trigger set_agente_gatilhos_updated before update on public.agente_gatilhos
  for each row execute function public.set_updated_at();
create policy "ver gatilhos" on public.agente_gatilhos for select to authenticated
  using (public.has_permission(auth.uid(), 'controladoria', 'visualizar'));
create policy "gerir gatilhos" on public.agente_gatilhos for all to authenticated
  using (public.has_permission(auth.uid(), 'controladoria', 'editar'))
  with check (public.has_permission(auth.uid(), 'controladoria', 'editar'));

-- 7) Canais: vínculo do Telegram com o usuário do sistema
create table if not exists public.agente_canais (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  canal text not null check (canal in ('telegram')),
  identificador text,                 -- chat_id, preenchido no /vincular
  codigo_vinculo text,                -- 6 dígitos, guardar só o hash
  codigo_expira_em timestamptz,
  vinculado_em timestamptz,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (canal, identificador)
);
alter table public.agente_canais enable row level security;
create policy "meus canais" on public.agente_canais for select to authenticated
  using (usuario_id = auth.uid());

-- 8) Catálogo: os 3 que já existem
update public.agentes_ia set
  funcao = 'agente-prazos', modo_execucao = 'sincrono',
  config = config || '{"personagem": "Vanessa"}'::jsonb
where slug = 'monitor-prazos';

update public.agentes_ia set
  funcao = 'agente-executar', modo_execucao = 'assincrono', exige_aprovacao = false,
  modulos_leitura = '{controladoria,processos}',
  config = config || '{"personagem": "Manu", "limite_mensal_usd": 5}'::jsonb
where slug = 'relatorio-diario';

update public.agentes_ia set
  funcao = 'agente-executar', modo_execucao = 'assincrono', exige_aprovacao = true,
  modulos_leitura = '{processos,clientes}',
  acoes_permitidas = '{criar_documento_rascunho}',
  config = config || '{"personagem": "Helena", "limite_mensal_usd": 5}'::jsonb
where slug = 'minuta-pecas';

-- Os novos entram desligados (ativo = false) até cada fase ser testada.
-- Os 4 de marketing estão em agentes-marketing/migration-marketing.sql.
insert into public.agentes_ia
  (slug, nome, descricao, area, exige_aprovacao, ativo, ordem, funcao, modo_execucao, modulos_leitura, acoes_permitidas, config)
values
  ('triagem-clientes', 'Beatriz — Triagem', 'Triagem de cliente novo, roteiro de perguntas e lista de documentos.', 'atendimento', true, false, 4, 'agente-executar', 'assincrono', '{clientes}', '{criar_item_controladoria}', '{"personagem":"Beatriz","limite_mensal_usd":5}'),
  ('processos-andamentos', 'Gustavo — Processos', 'Resume andamentos, aponta processos parados e organiza pendências.', 'processual', true, false, 5, 'agente-executar', 'assincrono', '{processos,controladoria}', '{registrar_nota_processo,criar_item_controladoria}', '{"personagem":"Gustavo","limite_mensal_usd":5}'),
  ('previdenciario', 'Rafael — Previdenciário', 'CNIS, requisitos de benefício, BPC/LOAS.', 'processual', true, false, 6, 'agente-executar', 'assincrono', '{processos,clientes}', '{criar_documento_rascunho}', '{"personagem":"Rafael","limite_mensal_usd":5}'),
  ('propostas-contratos', 'Thiago — Propostas', 'Proposta de serviços e contrato de honorários.', 'comercial', true, false, 7, 'agente-executar', 'assincrono', '{clientes}', '{criar_documento_rascunho}', '{"personagem":"Thiago","limite_mensal_usd":5}'),
  ('leads-whatsapp', 'Mariana — Leads', 'Resposta a leads que chegam pelo WhatsApp.', 'comercial', true, false, 8, 'agente-executar', 'assincrono', '{clientes}', '{responder_whatsapp}', '{"personagem":"Mariana","limite_mensal_usd":5}'),
  ('financeiro', 'Fernando — Financeiro', 'Parcelas em aberto, recibos e lembretes de cobrança.', 'gestao', true, false, 9, 'agente-executar', 'assincrono', '{financeiro}', '{responder_whatsapp}', '{"personagem":"Fernando","limite_mensal_usd":5}'),
  ('diligencias-forum', 'Gabriel — Diligências', 'Roteiro e checklist de diligências em fórum e cartório.', 'processual', true, false, 10, 'agente-executar', 'assincrono', '{diligencias,controladoria}', '{criar_item_controladoria}', '{"personagem":"Gabriel","limite_mensal_usd":5}'),
  ('inss-administrativo', 'Renata — INSS administrativo', 'Analisa indeferimento, exigência e andamento de pedido no INSS; aponta prazo de recurso e o que falta provar.', 'processual', true, false, 11, 'agente-executar', 'assincrono', '{processos,clientes,atendimentos}', '{criar_item_controladoria,criar_documento_rascunho}', '{"personagem":"Renata","limite_mensal_usd":5}')
on conflict (slug) do nothing;

-- 9) Gatilhos iniciais (preencher executar_como com o id do usuário técnico "Agentes")
insert into public.agente_gatilhos (agente_id, nome, tipo, dias_semana, hora, entrada)
select id, 'Vanessa · dias úteis', 'agenda', '{1,2,3,4,5}', '07:15', '{"origem": "agenda"}'::jsonb
from public.agentes_ia where slug = 'monitor-prazos'
and not exists (select 1 from public.agente_gatilhos g where g.agente_id = public.agentes_ia.id);

insert into public.agente_gatilhos (agente_id, nome, tipo, dias_semana, hora, entrada)
select id, 'Briefing do dia', 'agenda', '{1,2,3,4,5}', '07:00',
       '{"texto": "Monte o briefing do dia para a Dra. Juliana: prazos atrasados, de hoje e dos próximos 3 dias, audiências e 3 prioridades. Curto, para ler no celular."}'::jsonb
from public.agentes_ia where slug = 'relatorio-diario'
and not exists (select 1 from public.agente_gatilhos g where g.agente_id = public.agentes_ia.id);

-- 10) O relógio: substitui o n8n. Mesmo padrão de datajud-diario (pg_net + Vault).
select cron.unschedule(jobname) from cron.job where jobname in ('agentes-trabalhador', 'agentes-agendador');

select cron.schedule('agentes-trabalhador', '* * * * *', $job$
  select net.http_post(
    url := 'https://mzwnljgujheumdslkloc.supabase.co/functions/v1/agentes-trabalhador',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-agentes-token', (select decrypted_secret from vault.decrypted_secrets where name = 'agentes_token' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$job$);

select cron.schedule('agentes-agendador', '*/5 * * * *', $job$
  select net.http_post(
    url := 'https://mzwnljgujheumdslkloc.supabase.co/functions/v1/agentes-agendador',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-agentes-token', (select decrypted_secret from vault.decrypted_secrets where name = 'agentes_token' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$job$);
