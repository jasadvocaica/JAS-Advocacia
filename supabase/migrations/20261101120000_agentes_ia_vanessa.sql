-- Agentes de IA: "contratação", execuções e ações auditáveis.
-- Primeira agente: Vanessa, gestora de prazos. Lê as publicações DJEN já
-- capturadas pelo djen-diario, lança o prazo na Controladoria como NÃO
-- conferido e distribui para a equipe. Migration aditiva.

create table public.agentes_ia (
  codigo text primary key check (codigo ~ '^[a-z_]+$'),
  nome text not null,
  funcao text not null,
  descricao text not null,
  contratado boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  limite_mensal_usd numeric not null default 10 check (limite_mensal_usd between 0 and 500),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.profiles(id) on delete set null
);

insert into public.agentes_ia (codigo, nome, funcao, descricao, config)
values (
  'vanessa_prazos',
  'Vanessa',
  'Gestora de prazos',
  'Todo dia útil, depois da captura do DJEN, lê as publicações novas, identifica a providência e o prazo, lança na Controladoria como prazo não conferido e distribui para quem deve cumprir.',
  jsonb_build_object(
    'antecedencia_interna_dias', 2,
    'confianca_minima', 0.75,
    'limite_itens_abertos', 25,
    'max_publicacoes_por_execucao', 40
  )
);

create table public.agentes_execucoes (
  id uuid primary key default gen_random_uuid(),
  agente text not null references public.agentes_ia(codigo) on delete cascade,
  origem text not null check (origem in ('agendado', 'manual')),
  iniciado_por uuid references public.profiles(id) on delete set null,
  iniciado_em timestamptz not null default now(),
  finalizado_em timestamptz,
  status text not null default 'rodando' check (status in ('rodando', 'concluida', 'falha')),
  lidas integer not null default 0,
  lancadas integer not null default 0,
  triagem integer not null default 0,
  erros integer not null default 0,
  tokens_entrada bigint not null default 0,
  tokens_saida bigint not null default 0,
  custo_estimado_usd numeric not null default 0,
  erro text
);
create index agentes_execucoes_agente_data on public.agentes_execucoes (agente, iniciado_em desc);

create table public.agentes_acoes (
  id uuid primary key default gen_random_uuid(),
  execucao_id uuid not null references public.agentes_execucoes(id) on delete cascade,
  agente text not null references public.agentes_ia(codigo) on delete cascade,
  tipo text not null check (tipo in ('prazo_lancado', 'mantida_triagem', 'erro')),
  publicacao_id uuid references public.pje_publicacoes(id) on delete set null,
  item_triagem_id uuid references public.controladoria_itens(id) on delete set null,
  item_criado_id uuid references public.controladoria_itens(id) on delete set null,
  responsavel_id uuid references public.profiles(id) on delete set null,
  resumo text not null,
  detalhes jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
create index agentes_acoes_execucao on public.agentes_acoes (execucao_id);
create index agentes_acoes_agente_data on public.agentes_acoes (agente, criado_em desc);
-- Cada publicação é tratada uma única vez (erros podem ser repetidos na próxima execução).
create unique index agentes_acoes_publicacao_unica
  on public.agentes_acoes (agente, publicacao_id)
  where tipo in ('prazo_lancado', 'mantida_triagem');

-- A Controladoria passa a aceitar itens criados por agentes.
alter table public.controladoria_itens drop constraint if exists controladoria_itens_origem_check;
alter table public.controladoria_itens add constraint controladoria_itens_origem_check
  check (origem = any (array['controladoria', 'perfil_cliente', 'perfil_processo', 'fluxo_automatico',
                             'datajud', 'dje_ia', 'pje_publicacao', 'bia', 'agente_ia']));

-- Acesso: somente a gestão vê e configura; quem escreve execuções e ações é o backend.
alter table public.agentes_ia enable row level security;
alter table public.agentes_execucoes enable row level security;
alter table public.agentes_acoes enable row level security;

create policy agentes_ia_gestor_ler on public.agentes_ia for select to authenticated
  using (public.is_interno_ativo(auth.uid()) and public.is_gestor(auth.uid()));
create policy agentes_ia_gestor_editar on public.agentes_ia for update to authenticated
  using (public.is_interno_ativo(auth.uid()) and public.is_gestor(auth.uid()))
  with check (public.is_interno_ativo(auth.uid()) and public.is_gestor(auth.uid()));
create policy agentes_execucoes_gestor_ler on public.agentes_execucoes for select to authenticated
  using (public.is_interno_ativo(auth.uid()) and public.is_gestor(auth.uid()));
create policy agentes_acoes_gestor_ler on public.agentes_acoes for select to authenticated
  using (public.is_interno_ativo(auth.uid()) and public.is_gestor(auth.uid()));

revoke all on public.agentes_ia, public.agentes_execucoes, public.agentes_acoes from anon, authenticated;
grant select on public.agentes_ia, public.agentes_execucoes, public.agentes_acoes to authenticated;
grant update (contratado, config, limite_mensal_usd, atualizado_em, atualizado_por) on public.agentes_ia to authenticated;
grant all on public.agentes_ia, public.agentes_execucoes, public.agentes_acoes to service_role;

create or replace function public.agentes_ia_carimbar()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end;
$$;
create trigger trg_agentes_ia_carimbar
before update on public.agentes_ia
for each row execute function public.agentes_ia_carimbar();

-- Segredo do agendamento, no mesmo padrão do djen-diario.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'agentes_cron_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'agentes_cron_secret',
      'Segredo interno para as execuções agendadas dos agentes de IA'
    );
  end if;
end
$$;

create or replace function public.validar_agentes_cron_secret(_secret text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select length(coalesce(_secret, '')) >= 32
    and exists (
      select 1 from vault.decrypted_secrets
      where name = 'agentes_cron_secret' and decrypted_secret = _secret
    );
$$;
revoke all on function public.validar_agentes_cron_secret(text) from public;
grant execute on function public.validar_agentes_cron_secret(text) to service_role;

-- Dias úteis às 07h15 (Cuiabá), 45 min depois do djen-diario (06h30).
do $$
declare _job record;
begin
  for _job in select jobid from cron.job where jobname = 'agente-vanessa-prazos'
  loop
    perform cron.unschedule(_job.jobid);
  end loop;
end
$$;

select cron.schedule(
  'agente-vanessa-prazos',
  '15 11 * * 1-5',
  $job$
    select net.http_post(
      url := 'https://mzwnljgujheumdslkloc.supabase.co/functions/v1/agente-prazos',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-agentes-cron-secret', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'agentes_cron_secret' limit 1
        )
      ),
      body := '{"origem":"agendado"}'::jsonb,
      timeout_milliseconds := 150000
    );
  $job$
);
