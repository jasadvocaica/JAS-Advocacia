create table if not exists public.whatsapp_conversa_followups (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.whatsapp_conversas(id) on delete cascade,
  responsavel_id uuid references auth.users(id) on delete set null,
  descricao text not null check (char_length(btrim(descricao)) between 1 and 500),
  agendado_para timestamptz not null,
  status text not null default 'pendente' check (status in ('pendente','concluido','cancelado')),
  concluido_em timestamptz,
  concluido_por uuid references auth.users(id) on delete set null,
  criado_por uuid not null references auth.users(id) on delete restrict default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint whatsapp_followup_conclusao_coerente check (
    (status = 'concluido' and concluido_em is not null)
    or (status <> 'concluido' and concluido_em is null)
  )
);

create index if not exists whatsapp_conversa_followups_conversa_idx
  on public.whatsapp_conversa_followups(conversa_id, status, agendado_para);
create index if not exists whatsapp_conversa_followups_responsavel_idx
  on public.whatsapp_conversa_followups(responsavel_id, status, agendado_para)
  where responsavel_id is not null;
create index if not exists whatsapp_conversa_followups_criado_por_idx
  on public.whatsapp_conversa_followups(criado_por);
create index if not exists whatsapp_conversa_followups_concluido_por_idx
  on public.whatsapp_conversa_followups(concluido_por)
  where concluido_por is not null;

alter table public.whatsapp_conversa_followups enable row level security;

create policy whatsapp_conversa_followups_select
  on public.whatsapp_conversa_followups for select to authenticated
  using (public.has_permission((select auth.uid()), 'marketing'::modulo, 'visualizar'::acao_permissao));
create policy whatsapp_conversa_followups_insert
  on public.whatsapp_conversa_followups for insert to authenticated
  with check (
    criado_por = (select auth.uid())
    and public.has_permission((select auth.uid()), 'marketing'::modulo, 'criar'::acao_permissao)
  );
create policy whatsapp_conversa_followups_update
  on public.whatsapp_conversa_followups for update to authenticated
  using (public.has_permission((select auth.uid()), 'marketing'::modulo, 'editar'::acao_permissao))
  with check (public.has_permission((select auth.uid()), 'marketing'::modulo, 'editar'::acao_permissao));
create policy whatsapp_conversa_followups_delete
  on public.whatsapp_conversa_followups for delete to authenticated
  using (public.has_role((select auth.uid()), 'gestor'::app_role));

grant select, insert, update, delete on public.whatsapp_conversa_followups to authenticated;

comment on table public.whatsapp_conversa_followups is
  'Próximos contatos internos vinculados a conversas reais; não envia mensagens automaticamente.';