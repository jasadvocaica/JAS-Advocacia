create or replace function public.comercial_converter_conversa_em_lead(p_conversa_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_conversa public.whatsapp_conversas%rowtype;
  v_lead_id uuid;
  v_telefone text;
begin
  if (select auth.uid()) is null then
    raise exception 'Autenticação necessária.';
  end if;

  select *
    into v_conversa
    from public.whatsapp_conversas
   where id = p_conversa_id
   for update;

  if not found then
    raise exception 'Conversa não encontrada ou sem permissão.';
  end if;

  if v_conversa.cliente_id is not null then
    raise exception 'Este contato já está vinculado a um cliente.';
  end if;

  if v_conversa.lead_id is not null then
    return v_conversa.lead_id;
  end if;

  v_telefone := regexp_replace(coalesce(v_conversa.telefone, ''), '\D', '', 'g');
  if v_telefone = '' then
    raise exception 'A conversa não possui telefone válido.';
  end if;

  select id
    into v_lead_id
    from public.mkt_leads
   where whatsapp_normalizado = v_telefone
   order by criado_em desc
   limit 1;

  if v_lead_id is null then
    insert into public.mkt_leads (
      nome,
      whatsapp,
      canal,
      status,
      responsavel_id,
      registrado_por
    )
    values (
      coalesce(nullif(btrim(v_conversa.nome_contato), ''), v_conversa.telefone),
      case when left(v_conversa.telefone, 1) = '+' then v_conversa.telefone else '+' || v_telefone end,
      'whatsapp_direto',
      'novo',
      coalesce(v_conversa.responsavel_id, (select auth.uid())),
      (select auth.uid())
    )
    returning id into v_lead_id;
  end if;

  update public.whatsapp_conversas
     set lead_id = v_lead_id,
         atualizado_em = now()
   where id = p_conversa_id;

  return v_lead_id;
end;
$$;

revoke all on function public.comercial_converter_conversa_em_lead(uuid) from public;
grant execute on function public.comercial_converter_conversa_em_lead(uuid) to authenticated;

comment on function public.comercial_converter_conversa_em_lead(uuid)
is 'Converte atomicamente uma conversa sem cliente em lead do CRM, respeitando RLS do chamador.';
