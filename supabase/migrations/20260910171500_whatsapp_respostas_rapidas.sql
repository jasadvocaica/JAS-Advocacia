create table if not exists public.whatsapp_respostas_rapidas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  conteudo text not null,
  ativo boolean not null default true,
  criado_por uuid references auth.users(id) on delete set null,
  atualizado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint whatsapp_respostas_rapidas_titulo_check
    check (char_length(btrim(titulo)) between 2 and 80),
  constraint whatsapp_respostas_rapidas_conteudo_check
    check (char_length(btrim(conteudo)) between 1 and 4096)
);

create index if not exists whatsapp_respostas_rapidas_ativas_titulo_idx
  on public.whatsapp_respostas_rapidas (lower(titulo))
  where ativo;

alter table public.whatsapp_respostas_rapidas enable row level security;

create policy whatsapp_respostas_rapidas_select
  on public.whatsapp_respostas_rapidas
  for select to authenticated
  using (has_permission((select auth.uid()), 'marketing'::modulo, 'visualizar'::acao_permissao));

create policy whatsapp_respostas_rapidas_insert
  on public.whatsapp_respostas_rapidas
  for insert to authenticated
  with check (
    has_role((select auth.uid()), 'gestor'::app_role)
    and criado_por = (select auth.uid())
  );

create policy whatsapp_respostas_rapidas_update
  on public.whatsapp_respostas_rapidas
  for update to authenticated
  using (has_role((select auth.uid()), 'gestor'::app_role))
  with check (has_role((select auth.uid()), 'gestor'::app_role));

create policy whatsapp_respostas_rapidas_delete
  on public.whatsapp_respostas_rapidas
  for delete to authenticated
  using (has_role((select auth.uid()), 'gestor'::app_role));

grant select, insert, update, delete on public.whatsapp_respostas_rapidas to authenticated;

comment on table public.whatsapp_respostas_rapidas is
  'Textos cadastrados pelo escritório para inserção manual no compositor; nunca são enviados automaticamente.';
