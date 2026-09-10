create or replace function public.whatsapp_assumir_conversa(_conversa_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario_id uuid := auth.uid();
  alteradas integer;
begin
  if usuario_id is null
    or not public.has_permission(usuario_id, 'marketing'::public.modulo, 'editar'::public.acao_permissao)
  then
    raise exception 'Usuário sem permissão para assumir atendimentos.';
  end if;

  update public.whatsapp_conversas
  set responsavel_id = usuario_id,
      status = case when status = 'aguardando_escritorio' then 'aberta' else status end,
      atualizado_em = now()
  where id = _conversa_id
    and status <> 'encerrada'
    and (responsavel_id is null or responsavel_id = usuario_id);

  get diagnostics alteradas = row_count;
  return alteradas = 1;
end;
$$;

revoke all on function public.whatsapp_assumir_conversa(uuid) from public, anon;
grant execute on function public.whatsapp_assumir_conversa(uuid) to authenticated;

comment on function public.whatsapp_assumir_conversa(uuid) is
  'Permite que uma única pessoa assuma atomicamente uma conversa não atribuída.';
