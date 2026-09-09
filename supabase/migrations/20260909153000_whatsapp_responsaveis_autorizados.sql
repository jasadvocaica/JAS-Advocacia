-- Responsáveis de conversa são definidos por permissão explícita, sem fallback por cargo.
create or replace function public.comercial_responsaveis_autorizados()
returns table (user_id uuid, nome text, ativo boolean, gestor boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
         p.nome,
         p.ativo,
         public.has_role(p.id, 'gestor'::app_role) as gestor
  from public.profiles p
  where public.is_interno_ativo(auth.uid())
    and p.tipo_portal = 'interno'
    and p.ativo = true
    and (
      public.has_role(p.id, 'gestor'::app_role)
      or public.has_permission(p.id, 'marketing'::modulo, 'visualizar'::acao_permissao)
    )
  order by public.has_role(p.id, 'gestor'::app_role), p.nome;
$$;

revoke all on function public.comercial_responsaveis_autorizados() from public;
grant execute on function public.comercial_responsaveis_autorizados() to authenticated;

comment on function public.comercial_responsaveis_autorizados() is
'Lista somente usuários internos ativos explicitamente autorizados a receber atendimentos comerciais.';
