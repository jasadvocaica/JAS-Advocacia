create table if not exists public.mkt_lead_atividades (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.mkt_leads(id) on delete cascade,
  descricao text not null,
  agendado_para timestamptz not null,
  responsavel_id uuid references auth.users(id) on delete set null,
  status text not null default 'pendente'
    check (status in ('pendente', 'concluida', 'cancelada')),
  criado_por uuid not null references auth.users(id) on delete restrict,
  concluido_por uuid references auth.users(id) on delete set null,
  concluido_em timestamptz,
  cancelado_por uuid references auth.users(id) on delete set null,
  cancelado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint mkt_lead_atividades_descricao_check
    check (char_length(btrim(descricao)) between 2 and 500),
  constraint mkt_lead_atividades_conclusao_check
    check (
      (status = 'concluida' and concluido_em is not null)
      or (status <> 'concluida' and concluido_em is null)
    ),
  constraint mkt_lead_atividades_cancelamento_check
    check (
      (status = 'cancelada' and cancelado_em is not null)
      or (status <> 'cancelada' and cancelado_em is null)
    )
);

create index if not exists mkt_lead_atividades_lead_idx
  on public.mkt_lead_atividades(lead_id, agendado_para);
create index if not exists mkt_lead_atividades_pendentes_idx
  on public.mkt_lead_atividades(responsavel_id, agendado_para)
  where status = 'pendente';

alter table public.mkt_lead_atividades enable row level security;

create policy mkt_lead_atividades_select
  on public.mkt_lead_atividades
  for select to authenticated
  using (has_permission((select auth.uid()), 'marketing'::modulo, 'visualizar'::acao_permissao));

create policy mkt_lead_atividades_insert
  on public.mkt_lead_atividades
  for insert to authenticated
  with check (
    has_permission((select auth.uid()), 'marketing'::modulo, 'criar'::acao_permissao)
    and criado_por = (select auth.uid())
  );

create policy mkt_lead_atividades_update
  on public.mkt_lead_atividades
  for update to authenticated
  using (has_permission((select auth.uid()), 'marketing'::modulo, 'editar'::acao_permissao))
  with check (has_permission((select auth.uid()), 'marketing'::modulo, 'editar'::acao_permissao));

grant select, insert, update on public.mkt_lead_atividades to authenticated;

comment on table public.mkt_lead_atividades is
  'Próximas ações comerciais vinculadas a negociações reais, com conclusão e cancelamento auditáveis.';
