-- Salva item da Controladoria e todos os responsáveis na mesma transação.
-- Nenhum responsável é inferido por nome, cargo ou ordem de cadastro.

create or replace function public.salvar_item_controladoria(
  _item_id uuid,
  _item jsonb,
  _corresponsaveis uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_responsavel_id uuid := nullif(_item->>'responsavel_id', '')::uuid;
  v_acao public.acao_permissao := case when _item_id is null then 'criar' else 'editar' end;
  v_corresponsaveis uuid[] := coalesce(_corresponsaveis, '{}'::uuid[]);
begin
  if v_uid is null or not public.is_interno_ativo(v_uid) then
    raise exception 'Sessão interna inválida' using errcode = '42501';
  end if;
  if not public.has_permission(v_uid, 'controladoria'::public.modulo, v_acao) then
    raise exception 'Sem permissão para salvar itens da Controladoria' using errcode = '42501';
  end if;
  if nullif(btrim(_item->>'titulo'), '') is null then
    raise exception 'Informe um título' using errcode = '23502';
  end if;
  if nullif(_item->>'data_vencimento', '') is null then
    raise exception 'Informe a data de vencimento' using errcode = '23502';
  end if;
  if nullif(_item->>'cliente_id', '') is null
     and nullif(_item->>'processo_id', '') is null then
    raise exception 'Vincule o item a um cliente ou processo' using errcode = '23502';
  end if;
  if v_responsavel_id is null then
    raise exception 'Selecione explicitamente o responsável' using errcode = '23502';
  end if;
  if not public.is_interno_ativo(v_responsavel_id) then
    raise exception 'O responsável selecionado não é um usuário interno ativo' using errcode = '23514';
  end if;
  if exists (
    select 1
    from unnest(v_corresponsaveis) as u(id)
    where u.id is null or not public.is_interno_ativo(u.id)
  ) then
    raise exception 'Há colaborador inativo ou inválido na lista de responsáveis' using errcode = '23514';
  end if;

  if _item_id is null then
    insert into public.controladoria_itens (
      titulo, descricao, tipo, status, prioridade,
      cliente_id, processo_id, responsavel_id, tipo_prazo_id,
      data_intimacao, data_vencimento, data_prazo_judicial, data_prazo_interno,
      antecedencia_interna_dias, prazo_conferido,
      vara, juiz, local, link_virtual, visivel_parceiro,
      o_que_levar, orientacoes, origem, criado_por
    ) values (
      btrim(_item->>'titulo'),
      nullif(btrim(_item->>'descricao'), ''),
      (_item->>'tipo')::public.tipo_item_controladoria,
      coalesce(nullif(_item->>'status', ''), 'pendente')::public.status_item,
      coalesce(nullif(_item->>'prioridade', ''), 'media')::public.prioridade,
      nullif(_item->>'cliente_id', '')::uuid,
      nullif(_item->>'processo_id', '')::uuid,
      v_responsavel_id,
      nullif(_item->>'tipo_prazo_id', '')::uuid,
      nullif(_item->>'data_intimacao', '')::date,
      (_item->>'data_vencimento')::timestamptz,
      nullif(_item->>'data_prazo_judicial', '')::date,
      nullif(_item->>'data_prazo_interno', '')::date,
      coalesce(nullif(_item->>'antecedencia_interna_dias', '')::smallint, 2),
      coalesce(nullif(_item->>'prazo_conferido', '')::boolean, false),
      nullif(btrim(_item->>'vara'), ''),
      nullif(btrim(_item->>'juiz'), ''),
      nullif(btrim(_item->>'local'), ''),
      nullif(btrim(_item->>'link_virtual'), ''),
      coalesce(nullif(_item->>'visivel_parceiro', '')::boolean, false),
      nullif(btrim(_item->>'o_que_levar'), ''),
      nullif(btrim(_item->>'orientacoes'), ''),
      coalesce(nullif(_item->>'origem', ''), 'controladoria'),
      v_uid
    )
    returning id into v_id;
  else
    update public.controladoria_itens set
      titulo = btrim(_item->>'titulo'),
      descricao = nullif(btrim(_item->>'descricao'), ''),
      tipo = (_item->>'tipo')::public.tipo_item_controladoria,
      status = coalesce(nullif(_item->>'status', ''), status::text)::public.status_item,
      prioridade = coalesce(nullif(_item->>'prioridade', ''), prioridade::text)::public.prioridade,
      cliente_id = nullif(_item->>'cliente_id', '')::uuid,
      processo_id = nullif(_item->>'processo_id', '')::uuid,
      responsavel_id = v_responsavel_id,
      tipo_prazo_id = nullif(_item->>'tipo_prazo_id', '')::uuid,
      data_intimacao = nullif(_item->>'data_intimacao', '')::date,
      data_vencimento = (_item->>'data_vencimento')::timestamptz,
      data_prazo_judicial = nullif(_item->>'data_prazo_judicial', '')::date,
      data_prazo_interno = nullif(_item->>'data_prazo_interno', '')::date,
      antecedencia_interna_dias = coalesce(nullif(_item->>'antecedencia_interna_dias', '')::smallint, 2),
      prazo_conferido = coalesce(nullif(_item->>'prazo_conferido', '')::boolean, false),
      vara = nullif(btrim(_item->>'vara'), ''),
      juiz = nullif(btrim(_item->>'juiz'), ''),
      local = nullif(btrim(_item->>'local'), ''),
      link_virtual = nullif(btrim(_item->>'link_virtual'), ''),
      visivel_parceiro = coalesce(nullif(_item->>'visivel_parceiro', '')::boolean, false),
      o_que_levar = nullif(btrim(_item->>'o_que_levar'), ''),
      orientacoes = nullif(btrim(_item->>'orientacoes'), ''),
      origem = coalesce(nullif(_item->>'origem', ''), origem)
    where id = _item_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Item da Controladoria não encontrado' using errcode = 'P0002';
    end if;
  end if;

  delete from public.controladoria_responsaveis
  where item_id = v_id;

  insert into public.controladoria_responsaveis (item_id, user_id, papel)
  values (v_id, v_responsavel_id, 'principal');

  insert into public.controladoria_responsaveis (item_id, user_id, papel)
  select v_id, u.id, 'apoio'::public.papel_responsavel
  from (
    select distinct id
    from unnest(v_corresponsaveis) as x(id)
    where id is not null and id <> v_responsavel_id
  ) as u
  on conflict (item_id, user_id) do update set papel = excluded.papel;

  return v_id;
end;
$$;

revoke all on function public.salvar_item_controladoria(uuid, jsonb, uuid[]) from public, anon;
grant execute on function public.salvar_item_controladoria(uuid, jsonb, uuid[]) to authenticated;

comment on function public.salvar_item_controladoria(uuid, jsonb, uuid[]) is
  'Salva item e responsáveis atomicamente; exige responsável explícito, interno e ativo.';
