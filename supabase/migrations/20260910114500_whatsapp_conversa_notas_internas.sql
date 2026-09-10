create table if not exists public.whatsapp_conversa_notas (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.whatsapp_conversas(id) on delete cascade,
  conteudo text not null check (char_length(btrim(conteudo)) between 1 and 4000),
  criado_por uuid not null references auth.users(id) on delete restrict default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists whatsapp_conversa_notas_conversa_idx
  on public.whatsapp_conversa_notas (conversa_id, criado_em desc);

alter table public.whatsapp_conversa_notas enable row level security;

create policy whatsapp_conversa_notas_select
  on public.whatsapp_conversa_notas
  for select to authenticated
  using (public.has_permission((select auth.uid()), 'marketing'::modulo, 'visualizar'::acao_permissao));

create policy whatsapp_conversa_notas_insert
  on public.whatsapp_conversa_notas
  for insert to authenticated
  with check (
    criado_por = (select auth.uid())
    and public.has_permission((select auth.uid()), 'marketing'::modulo, 'criar'::acao_permissao)
  );

create policy whatsapp_conversa_notas_update
  on public.whatsapp_conversa_notas
  for update to authenticated
  using (
    criado_por = (select auth.uid())
    or public.has_role((select auth.uid()), 'gestor'::app_role)
  )
  with check (
    criado_por = (select auth.uid())
    or public.has_role((select auth.uid()), 'gestor'::app_role)
  );

create policy whatsapp_conversa_notas_delete
  on public.whatsapp_conversa_notas
  for delete to authenticated
  using (
    criado_por = (select auth.uid())
    or public.has_role((select auth.uid()), 'gestor'::app_role)
  );

grant select, insert, update, delete on public.whatsapp_conversa_notas to authenticated;

comment on table public.whatsapp_conversa_notas is
  'Notas internas da equipe, nunca enviadas ao provedor WhatsApp.';