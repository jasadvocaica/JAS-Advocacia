-- Endurece alterações de perfil e acesso a credenciais de clientes.

create or replace function public.proteger_campos_sensiveis_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or public.is_gestor(v_uid) then
    return new;
  end if;

  if v_uid = old.id then
    if new.id is distinct from old.id
       or new.email is distinct from old.email
       or new.ativo is distinct from old.ativo
       or new.tipo_portal is distinct from old.tipo_portal
       or new.criado_em is distinct from old.criado_em
       or (
         new.primeiro_acesso is distinct from old.primeiro_acesso
         and not (old.primeiro_acesso = true and new.primeiro_acesso = false)
       )
    then
      raise exception 'Campos de acesso do perfil só podem ser alterados por um gestor'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_proteger_campos_sensiveis_profile on public.profiles;
create trigger trg_proteger_campos_sensiveis_profile
before update on public.profiles
for each row execute function public.proteger_campos_sensiveis_profile();

drop policy if exists "ver credenciais" on public.cliente_credenciais;
drop policy if exists "criar credenciais" on public.cliente_credenciais;
drop policy if exists "editar credenciais" on public.cliente_credenciais;
drop policy if exists "excluir credenciais" on public.cliente_credenciais;

create policy "ver credenciais"
on public.cliente_credenciais for select to authenticated
using (
  public.has_permission(auth.uid(), 'clientes'::public.modulo, 'visualizar'::public.acao_permissao)
  and public.usuario_ve_cliente(auth.uid(), cliente_id)
);

create policy "criar credenciais"
on public.cliente_credenciais for insert to authenticated
with check (
  public.has_permission(auth.uid(), 'clientes'::public.modulo, 'criar'::public.acao_permissao)
  and public.usuario_ve_cliente(auth.uid(), cliente_id)
);

create policy "editar credenciais"
on public.cliente_credenciais for update to authenticated
using (
  public.has_permission(auth.uid(), 'clientes'::public.modulo, 'editar'::public.acao_permissao)
  and public.usuario_ve_cliente(auth.uid(), cliente_id)
)
with check (
  public.has_permission(auth.uid(), 'clientes'::public.modulo, 'editar'::public.acao_permissao)
  and public.usuario_ve_cliente(auth.uid(), cliente_id)
);

create policy "excluir credenciais"
on public.cliente_credenciais for delete to authenticated
using (
  public.has_permission(auth.uid(), 'clientes'::public.modulo, 'excluir'::public.acao_permissao)
  and public.usuario_ve_cliente(auth.uid(), cliente_id)
);

revoke all on function public.proteger_campos_sensiveis_profile() from public;
grant execute on function public.proteger_campos_sensiveis_profile() to authenticated, service_role;
