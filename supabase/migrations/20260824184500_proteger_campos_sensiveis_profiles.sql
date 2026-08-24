-- Impede que o navegador altere campos administrativos do perfil sem autorização.
create or replace function public.trg_proteger_campos_sensiveis_profile()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  ator uuid := auth.uid();
begin
  -- Operações internas do Supabase e da função administrativa.
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;

  if ator is null then
    raise exception 'Sessão autenticada obrigatória';
  end if;

  -- Gestores ativos continuam sujeitos ao RLS e às proteções do último gestor.
  if public.is_gestor(ator) then
    return new;
  end if;

  if ator = old.id then
    if new.id is distinct from old.id
       or new.email is distinct from old.email
       or new.ativo is distinct from old.ativo
       or new.primeiro_acesso is distinct from old.primeiro_acesso
       or new.tipo_portal is distinct from old.tipo_portal
       or new.criado_em is distinct from old.criado_em then
      raise exception 'Campos administrativos do próprio perfil não podem ser alterados';
    end if;
    return new;
  end if;

  -- Delegação de Equipe/Editar permite apenas ativar ou inativar outra conta.
  if public.has_permission(ator, 'equipe'::public.modulo, 'editar'::public.acao_permissao) then
    if new.id is distinct from old.id
       or new.nome is distinct from old.nome
       or new.email is distinct from old.email
       or new.telefone is distinct from old.telefone
       or new.oab is distinct from old.oab
       or new.avatar_url is distinct from old.avatar_url
       or new.primeiro_acesso is distinct from old.primeiro_acesso
       or new.tipo_portal is distinct from old.tipo_portal
       or new.criado_em is distinct from old.criado_em then
      raise exception 'A permissão delegada permite apenas ativar ou inativar usuários';
    end if;
    return new;
  end if;

  raise exception 'Sem permissão para alterar este perfil';
end;
$$;

revoke all on function public.trg_proteger_campos_sensiveis_profile() from public, anon, authenticated;

drop trigger if exists proteger_campos_sensiveis_profile on public.profiles;
create trigger proteger_campos_sensiveis_profile
before update on public.profiles
for each row execute function public.trg_proteger_campos_sensiveis_profile();
