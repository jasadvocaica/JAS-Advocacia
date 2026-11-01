-- ============================================================
-- RASCUNHO DE REFERÊNCIA — Fase 2: Central de Comandos, atendimento e métricas
-- Acompanha ESPECIFICACAO-AGENTES-IA.md, seções 16 a 18.
-- Aplicar DEPOIS de migration-referencia.sql. Conferir contra o schema atual.
-- Só acrescenta: nada existente é removido nem muda de tipo.
-- ============================================================

-- 1) Vínculo com o atendimento (pessoa que ainda não é cliente)
alter table public.controladoria_itens
  add column if not exists triagem_atendimento_id uuid references public.triagem_atendimentos(id) on delete set null,
  -- o agente que executa (slug de agentes_ia). Responsável continua sendo a pessoa que revisa;
  -- controladoria_responsaveis só aceita usuários reais, então o agente fica aqui.
  add column if not exists agente_executor text;
alter table public.documentos
  add column if not exists triagem_atendimento_id uuid references public.triagem_atendimentos(id) on delete set null,
  add column if not exists rascunho_ia boolean not null default false;   -- análise do agente ainda não revisada
alter table public.agente_execucoes
  add column if not exists triagem_atendimento_id uuid references public.triagem_atendimentos(id) on delete set null,
  add column if not exists pedido_id uuid;   -- FK logo abaixo, depois de criar central_pedidos

create index if not exists controladoria_itens_atendimento on public.controladoria_itens (triagem_atendimento_id) where triagem_atendimento_id is not null;
create index if not exists documentos_atendimento on public.documentos (triagem_atendimento_id) where triagem_atendimento_id is not null;

-- 2) Pedidos da Central de Comandos (é daqui que saem as métricas)
create table if not exists public.central_pedidos (
  id uuid primary key default gen_random_uuid(),
  texto text not null check (length(texto) between 3 and 20000),
  anexos jsonb not null default '[]'::jsonb,            -- [{ path, nome, mime }] no Storage
  urgente boolean not null default false,
  processo_id uuid references public.processos(id) on delete set null,
  cliente_id uuid references public.clientes(id) on delete set null,
  triagem_atendimento_id uuid references public.triagem_atendimentos(id) on delete set null,
  criado_por uuid not null references auth.users(id) default auth.uid(),
  revisor_id uuid references auth.users(id) on delete set null,
  agente_sugerido text,                                  -- slug escolhido pela Manu
  agente_escolhido text,                                 -- slug final (difere se alguém corrigiu)
  corrigido_por uuid references auth.users(id) on delete set null,
  item_id uuid references public.controladoria_itens(id) on delete set null,
  execucao_id uuid references public.agente_execucoes(id) on delete set null,
  status text not null default 'novo' check (status in (
    'novo', 'distribuido', 'em_execucao', 'em_revisao', 'concluido', 'devolvido', 'recusado', 'cancelado')),
  motivo text,
  decisao text check (decisao in ('aprovado', 'recusado')),
  rodadas integer not null default 0,
  criado_em timestamptz not null default now(),
  distribuido_em timestamptz,
  entregue_em timestamptz,
  revisado_em timestamptz,
  atualizado_em timestamptz not null default now(),
  -- todo pedido precisa cair em algum lugar
  constraint central_pedidos_vinculo check (processo_id is not null or cliente_id is not null or triagem_atendimento_id is not null)
);
alter table public.central_pedidos enable row level security;
create trigger set_central_pedidos_updated before update on public.central_pedidos
  for each row execute function public.set_updated_at();
create index if not exists central_pedidos_status on public.central_pedidos (status, criado_em desc);
create index if not exists central_pedidos_criado_por on public.central_pedidos (criado_por, criado_em desc);

alter table public.agente_execucoes drop constraint if exists agente_execucoes_pedido_fk;
alter table public.agente_execucoes add constraint agente_execucoes_pedido_fk
  foreign key (pedido_id) references public.central_pedidos(id) on delete set null;

-- Quem pode pedir cria; quem vê a controladoria acompanha. O resto do ciclo é das Edge Functions.
create policy "pedir aos agentes" on public.central_pedidos for insert to authenticated
  with check (criado_por = auth.uid() and public.has_permission(auth.uid(), 'controladoria', 'criar'));
create policy "ver pedidos" on public.central_pedidos for select to authenticated
  using (criado_por = auth.uid() or revisor_id = auth.uid()
         or public.has_permission(auth.uid(), 'controladoria', 'visualizar'));
-- Sem política de UPDATE: a correção da escolha da Manu passa pela função abaixo,
-- que só troca o especialista e só enquanto o trabalho não começou.
create or replace function public.central_corrigir_especialista(p_pedido uuid, p_agente text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido central_pedidos%rowtype;
  v_agente agentes_ia%rowtype;
begin
  select * into v_pedido from central_pedidos where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if not (v_pedido.criado_por = auth.uid() or has_permission(auth.uid(), 'controladoria', 'editar')) then
    raise exception 'Sem permissão para corrigir este pedido';
  end if;
  if v_pedido.status not in ('novo', 'distribuido') then
    raise exception 'O agente já começou; devolva com ajuste na atividade';
  end if;
  select * into v_agente from agentes_ia where slug = p_agente and ativo and slug <> 'coordenar-pedido';
  if not found then raise exception 'Especialista inválido ou desligado'; end if;
  -- a execução ainda na fila passa para o novo especialista
  if v_pedido.execucao_id is not null then
    update agente_execucoes set agente_id = v_agente.id
     where id = v_pedido.execucao_id and status = 'pendente';
    if not found then raise exception 'O agente já começou; devolva com ajuste na atividade'; end if;
  end if;
  update central_pedidos set agente_escolhido = p_agente, corrigido_por = auth.uid() where id = p_pedido;
  if v_pedido.item_id is not null then
    insert into controladoria_comentarios (item_id, user_id, texto)
    values (v_pedido.item_id, auth.uid(), 'Especialista trocado para ' || v_agente.nome);
  end if;
end;
$$;
revoke all on function public.central_corrigir_especialista(uuid, text) from public, anon;
grant execute on function public.central_corrigir_especialista(uuid, text) to authenticated;

-- 3) Conversão: atendimento virou cliente → tudo vai junto
create or replace function public.atendimento_converter_para_cliente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.cliente_id is null or old.cliente_id is not distinct from new.cliente_id then
    return new;
  end if;

  update controladoria_itens set cliente_id = new.cliente_id
   where triagem_atendimento_id = new.id and cliente_id is null;
  update documentos set cliente_id = new.cliente_id
   where triagem_atendimento_id = new.id and cliente_id is null;
  update agente_execucoes set cliente_id = new.cliente_id
   where triagem_atendimento_id = new.id and cliente_id is null;
  update central_pedidos set cliente_id = new.cliente_id
   where triagem_atendimento_id = new.id and cliente_id is null;

  -- histórico do cliente: uma linha por pedido concluído, sem duplicar
  insert into cliente_atendimentos (cliente_id, origem, ferramenta, titulo, resumo, link, processo_id, metadados, criado_por)
  select new.cliente_id, 'sistema', 'agente_ia',
         coalesce(a.nome, 'Agente de IA') || ' · ' || left(p.texto, 80),
         coalesce(e.resumo, 'Análise feita durante o atendimento, antes do contrato.'),
         case when p.item_id is not null then '/controladoria?item=' || p.item_id end,
         p.processo_id,
         jsonb_build_object('pedido_id', p.id, 'triagem_atendimento_id', new.id),
         p.criado_por
    from central_pedidos p
    left join agente_execucoes e on e.id = p.execucao_id
    left join agentes_ia a on a.id = e.agente_id
   where p.triagem_atendimento_id = new.id and p.status = 'concluido'
     and not exists (select 1 from cliente_atendimentos h
                      where h.cliente_id = new.cliente_id and h.metadados->>'pedido_id' = p.id::text);
  return new;
end;
$$;

drop trigger if exists atendimento_converter_para_cliente on public.triagem_atendimentos;
create trigger atendimento_converter_para_cliente
  after update of cliente_id on public.triagem_atendimentos
  for each row execute function public.atendimento_converter_para_cliente();

-- 4) Métricas (respeitam o RLS de quem consulta)
create or replace view public.agentes_metricas_pedidos
with (security_invoker = true) as
select
  p.id,
  date_trunc('week', p.criado_em at time zone 'America/Cuiaba')::date as semana,
  coalesce(p.agente_escolhido, p.agente_sugerido) as agente,
  p.criado_por,
  p.revisor_id,
  p.status,
  p.decisao,
  p.rodadas,
  p.urgente,
  (p.triagem_atendimento_id is not null and p.cliente_id is null) as ainda_atendimento,
  (p.corrigido_por is not null) as manu_corrigida,
  extract(epoch from (p.entregue_em - p.distribuido_em)) / 60 as minutos_agente,
  extract(epoch from (p.revisado_em - p.entregue_em)) / 60 as minutos_revisao,
  extract(epoch from (p.revisado_em - p.criado_em)) / 60 as minutos_total,
  (select coalesce(sum(c.custo_usd), 0) from agente_consumo c
     join agente_execucoes e on e.id = c.execucao_id where e.pedido_id = p.id) as custo_usd
from public.central_pedidos p;

create or replace view public.agentes_metricas_semana
with (security_invoker = true) as
select
  semana,
  agente,
  count(*) as pedidos,
  count(*) filter (where status = 'concluido') as concluidos,
  count(*) filter (where status = 'em_revisao') as esperando_revisao,
  round(100.0 * count(*) filter (where decisao = 'aprovado' and rodadas = 0)
        / nullif(count(*) filter (where decisao is not null), 0), 1) as pct_aprovado_primeira,
  round(100.0 * count(*) filter (where rodadas > 0)
        / nullif(count(*) filter (where decisao is not null), 0), 1) as pct_devolvido,
  round(100.0 * count(*) filter (where not manu_corrigida)
        / nullif(count(*) filter (where status <> 'novo'), 0), 1) as pct_acerto_manu,
  percentile_cont(0.5) within group (order by minutos_agente) as mediana_min_agente,
  percentile_cont(0.5) within group (order by minutos_revisao) as mediana_min_revisao,
  sum(custo_usd) as custo_usd
from public.agentes_metricas_pedidos
group by semana, agente;

-- 5) Catálogo: a Manu coordenadora (sempre ativa quando a Central for ao ar)
insert into public.agentes_ia
  (slug, nome, descricao, area, exige_aprovacao, ativo, ordem, funcao, modo_execucao, modulos_leitura, config)
values
  ('coordenar-pedido', 'Manu — Coordenação da Central',
   'Lê o pedido da Central de Comandos, escolhe o especialista, cria a atividade na Controladoria e distribui.',
   'gestao', false, false, 0, 'coordenar-pedido', 'assincrono', '{processos,clientes,atendimentos}',
   '{"personagem":"Manu","limite_mensal_usd":5}')
on conflict (slug) do nothing;
