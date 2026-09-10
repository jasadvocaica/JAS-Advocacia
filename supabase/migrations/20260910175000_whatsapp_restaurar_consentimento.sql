create or replace function public.whatsapp_restaurar_consentimento(_conversa_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario_id uuid := auth.uid();
  conversa_atual public.whatsapp_conversas%rowtype;
  bloqueio public.whatsapp_contatos_bloqueados%rowtype;
  agora timestamptz := now();
begin
  if usuario_id is null or not public.has_role(usuario_id, 'gestor'::public.app_role) then
    raise exception 'Somente gestores podem restaurar o consentimento.';
  end if;

  select * into conversa_atual
  from public.whatsapp_conversas
  where id = _conversa_id;

  if not found then
    raise exception 'Conversa não encontrada.';
  end if;

  select * into bloqueio
  from public.whatsapp_contatos_bloqueados
  where telefone_normalizado = conversa_atual.telefone_normalizado
    and restaurado_em is null
  for update;

  if not found then
    raise exception 'Este contato não possui descadastro ativo.';
  end if;

  update public.whatsapp_contatos_bloqueados
  set restaurado_em = agora,
      restaurado_por = usuario_id,
      atualizado_em = agora
  where telefone_normalizado = conversa_atual.telefone_normalizado;

  update public.whatsapp_conversas
  set opt_out_em = null,
      opt_out_termo = null,
      opt_out_mensagem_id = null,
      atualizado_em = agora
  where telefone_normalizado = conversa_atual.telefone_normalizado;

  insert into public.whatsapp_consentimento_eventos (
    conversa_id, tipo, origem, termo, realizado_por, ocorrido_em
  ) values (
    conversa_atual.id, 'restaurado', 'gestao', bloqueio.termo, usuario_id, agora
  );
end;
$$;

revoke all on function public.whatsapp_restaurar_consentimento(uuid) from public, anon;
grant execute on function public.whatsapp_restaurar_consentimento(uuid) to authenticated;

comment on function public.whatsapp_restaurar_consentimento(uuid) is
  'Restaura consentimento por telefone de forma atômica e registra a decisão da gestão.';
