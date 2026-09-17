-- Garante que o responsável jurídico do cliente seja um perfil interno válido.
-- Não reatribui nem apaga responsáveis históricos.

alter table public.clientes
  drop constraint if exists clientes_advogado_responsavel_id_fkey;

alter table public.clientes
  add constraint clientes_advogado_responsavel_id_fkey
  foreign key (advogado_responsavel_id)
  references public.profiles(id)
  on delete set null;

create or replace function public.validar_responsavel_juridico_cliente()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.advogado_responsavel_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.profiles p
    join public.user_roles ur on ur.user_id = p.id
    where p.id = new.advogado_responsavel_id
      and p.ativo = true
      and ur.role in ('gestor'::public.app_role, 'advogado'::public.app_role)
  ) then
    raise exception 'O responsável jurídico deve ser um gestor ou advogado ativo'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validar_responsavel_juridico_cliente on public.clientes;
create trigger trg_validar_responsavel_juridico_cliente
before insert or update of advogado_responsavel_id
on public.clientes
for each row
execute function public.validar_responsavel_juridico_cliente();

revoke execute on function public.validar_responsavel_juridico_cliente() from public, anon, authenticated;
