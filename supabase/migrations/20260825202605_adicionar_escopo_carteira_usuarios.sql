-- Escopo de carteira por usuário e vínculos nominais de clientes.
create table if not exists public.user_access_scopes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  clientes_scope text not null default 'todos' check (clientes_scope in ('todos','vinculados')),
  processos_scope text not null default 'todos' check (processos_scope in ('todos','vinculados')),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id)
);
create table if not exists public.user_client_links (
  user_id uuid not null references auth.users(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  primary key (user_id, cliente_id)
);
alter table public.user_access_scopes enable row level security;
alter table public.user_client_links enable row level security;
grant select, insert, update, delete on public.user_access_scopes, public.user_client_links to authenticated;
revoke all on public.user_access_scopes, public.user_client_links from anon;
create policy "gestor gerencia escopo de usuarios" on public.user_access_scopes for all to authenticated using (public.is_gestor((select auth.uid()))) with check (public.is_gestor((select auth.uid())));
create policy "usuario ve proprio escopo" on public.user_access_scopes for select to authenticated using (user_id=(select auth.uid()));
create policy "gestor gerencia vinculos de clientes" on public.user_client_links for all to authenticated using (public.is_gestor((select auth.uid()))) with check (public.is_gestor((select auth.uid())));
create policy "usuario ve proprios vinculos" on public.user_client_links for select to authenticated using (user_id=(select auth.uid()));
insert into public.user_access_scopes (user_id,clientes_scope,processos_scope)
select id,'todos','todos' from public.profiles where coalesce(tipo_portal,'interno')='interno'
on conflict (user_id) do nothing;

create or replace function public.usuario_ve_cliente(_user_id uuid,_cliente_id uuid)
returns boolean language sql stable security definer set search_path='public' as $$
 select public.is_gestor(_user_id)
 or exists(select 1 from public.user_access_scopes s where s.user_id=_user_id and s.clientes_scope='todos')
 or exists(select 1 from public.user_client_links l where l.user_id=_user_id and l.cliente_id=_cliente_id)
 or exists(select 1 from public.processos p where p.cliente_id=_cliente_id and p.responsavel_id=_user_id)
$$;
create or replace function public.usuario_ve_processo(_user_id uuid,_processo_id uuid)
returns boolean language sql stable security definer set search_path='public' as $$
 select public.is_gestor(_user_id)
 or exists(select 1 from public.user_access_scopes s where s.user_id=_user_id and s.processos_scope='todos')
 or exists(select 1 from public.processos p where p.id=_processo_id and (p.responsavel_id=_user_id or exists(select 1 from public.user_client_links l where l.user_id=_user_id and l.cliente_id=p.cliente_id)))
$$;
revoke all on function public.usuario_ve_cliente(uuid,uuid), public.usuario_ve_processo(uuid,uuid) from public, anon;
grant execute on function public.usuario_ve_cliente(uuid,uuid), public.usuario_ve_processo(uuid,uuid) to authenticated, service_role;
drop policy if exists "ver processos" on public.processos;
create policy "ver processos" on public.processos for select to authenticated using (public.has_permission((select auth.uid()),'processos','visualizar') and public.usuario_ve_processo((select auth.uid()),id));
drop policy if exists "editar clientes" on public.clientes;
create policy "editar clientes" on public.clientes for update to authenticated using (public.has_permission((select auth.uid()),'clientes','editar') and public.usuario_ve_cliente((select auth.uid()),id)) with check (public.has_permission((select auth.uid()),'clientes','editar') and public.usuario_ve_cliente((select auth.uid()),id));
drop policy if exists "editar processos" on public.processos;
create policy "editar processos" on public.processos for update to authenticated using (public.has_permission((select auth.uid()),'processos','editar') and public.usuario_ve_processo((select auth.uid()),id)) with check (public.has_permission((select auth.uid()),'processos','editar') and public.usuario_ve_processo((select auth.uid()),id));
