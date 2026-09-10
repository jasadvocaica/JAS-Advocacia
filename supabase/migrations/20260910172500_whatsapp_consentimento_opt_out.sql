alter table public.whatsapp_conversas
  add column if not exists opt_out_em timestamptz,
  add column if not exists opt_out_termo text,
  add column if not exists opt_out_mensagem_id uuid references public.whatsapp_mensagens(id) on delete set null;

create index if not exists whatsapp_conversas_opt_out_idx
  on public.whatsapp_conversas(opt_out_em)
  where opt_out_em is not null;

create table if not exists public.whatsapp_consentimento_eventos (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.whatsapp_conversas(id) on delete cascade,
  tipo text not null check (tipo in ('revogado', 'restaurado')),
  origem text not null check (origem in ('mensagem_cliente', 'gestao')),
  termo text,
  mensagem_id uuid references public.whatsapp_mensagens(id) on delete set null,
  realizado_por uuid references auth.users(id) on delete set null,
  ocorrido_em timestamptz not null default now()
);

create index if not exists whatsapp_consentimento_eventos_conversa_idx
  on public.whatsapp_consentimento_eventos(conversa_id, ocorrido_em desc);

alter table public.whatsapp_consentimento_eventos enable row level security;

create policy whatsapp_consentimento_eventos_select
  on public.whatsapp_consentimento_eventos
  for select to authenticated
  using (has_permission((select auth.uid()), 'marketing'::modulo, 'visualizar'::acao_permissao));

create policy whatsapp_consentimento_eventos_insert_gestao
  on public.whatsapp_consentimento_eventos
  for insert to authenticated
  with check (
    has_role((select auth.uid()), 'gestor'::app_role)
    and origem = 'gestao'
    and realizado_por = (select auth.uid())
  );

grant select, insert on public.whatsapp_consentimento_eventos to authenticated;

comment on column public.whatsapp_conversas.opt_out_em is
  'Data em que o contato revogou o consentimento para novas mensagens.';
comment on table public.whatsapp_consentimento_eventos is
  'Trilha imutável de revogação e eventual restauração de consentimento.';
