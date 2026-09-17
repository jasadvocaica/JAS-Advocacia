-- Converte uma ficha em processo ou diligência em uma única transação.
-- O bloqueio da ficha evita conversões concorrentes e registros duplicados.

create or replace function public.converter_ficha_atendimento(
  _atendimento_id uuid,
  _tipo text,
  _processo jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ficha public.cliente_atendimentos%rowtype;
  v_processo_id uuid;
  v_item_id uuid;
  v_titulo text;
  v_descricao text;
  v_payload jsonb;
begin
  if v_uid is null or not public.is_interno_ativo(v_uid) then
    raise exception 'Sessão interna inválida' using errcode = '42501';
  end if;

  if _tipo not in ('processo', 'processo_administrativo', 'diligencia') then
    raise exception 'Tipo de conversão inválido' using errcode = '22023';
  end if;

  select *
    into v_ficha
  from public.cliente_atendimentos
  where id = _atendimento_id
  for update;

  if not found then
    raise exception 'Ficha de atendimento não encontrada' using errcode = 'P0002';
  end if;

  if v_ficha.status = 'convertido' or v_ficha.convertido_em is not null then
    if v_ficha.convertido_tipo = _tipo then
      return jsonb_build_object(
        'status', 'ja_convertida',
        'processo_id', v_ficha.processo_id,
        'item_controladoria_id', v_ficha.item_controladoria_id,
        'convertido_tipo', v_ficha.convertido_tipo
      );
    end if;
    raise exception 'Esta ficha já foi convertida em %', coalesce(v_ficha.convertido_tipo, 'outro registro')
      using errcode = '23505';
  end if;

  v_titulo := coalesce(nullif(btrim(v_ficha.titulo), ''), 'Atendimento');
  v_descricao := concat_ws(
    E'\n\n',
    nullif(btrim(v_ficha.resumo), ''),
    case
      when nullif(btrim(v_ficha.tese_juridica), '') is not null
        then '**Tese:**' || E'\n' || btrim(v_ficha.tese_juridica)
      else null
    end
  );

  if _tipo in ('processo', 'processo_administrativo') then
    if not public.has_permission(v_uid, 'processos'::public.modulo, 'criar'::public.acao_permissao) then
      raise exception 'Sem permissão para criar processos' using errcode = '42501';
    end if;

    v_payload := coalesce(_processo, '{}'::jsonb) || jsonb_build_object(
      'cliente_id', v_ficha.cliente_id,
      'tipo', case when _tipo = 'processo' then 'judicial' else 'administrativo' end,
      'area_direito', coalesce(nullif(_processo->>'area_direito', ''), v_ficha.area),
      'tipo_acao', coalesce(nullif(_processo->>'tipo_acao', ''), v_ficha.subtipo),
      'status', coalesce(nullif(_processo->>'status', ''), 'Em andamento'),
      'observacoes_internas', concat(
        'Originado da ficha de atendimento "', v_titulo, '".',
        case when v_descricao <> '' then E'\n\n' || v_descricao else '' end
      )
    );

    v_processo_id := public.salvar_processo_com_partes(
      null,
      v_payload,
      '[]'::jsonb
    );
  else
    if not public.has_permission(v_uid, 'controladoria'::public.modulo, 'criar'::public.acao_permissao) then
      raise exception 'Sem permissão para criar diligência na Controladoria' using errcode = '42501';
    end if;

    insert into public.controladoria_itens (
      tipo,
      titulo,
      descricao,
      prioridade,
      data_vencimento,
      data_prazo_interno,
      cliente_id,
      origem,
      origem_atendimento_id,
      criado_por
    ) values (
      'diligencia',
      v_titulo,
      coalesce(nullif(v_descricao, ''), v_ficha.informacoes_brutas, ''),
      'media',
      now() + interval '5 days',
      current_date + 5,
      v_ficha.cliente_id,
      'controladoria',
      v_ficha.id,
      v_uid
    )
    returning id into v_item_id;
  end if;

  update public.cliente_atendimentos
  set
    status = 'convertido',
    convertido_em = now(),
    convertido_tipo = _tipo,
    processo_id = coalesce(v_processo_id, processo_id),
    item_controladoria_id = coalesce(v_item_id, item_controladoria_id),
    link = case
      when v_processo_id is not null then '/processos/' || v_processo_id::text
      when v_item_id is not null then '/controladoria'
      else link
    end,
    atualizado_em = now()
  where id = v_ficha.id;

  return jsonb_build_object(
    'status', 'convertido',
    'processo_id', v_processo_id,
    'item_controladoria_id', v_item_id,
    'convertido_tipo', _tipo
  );
end;
$$;

revoke all on function public.converter_ficha_atendimento(uuid, text, jsonb) from public, anon;
grant execute on function public.converter_ficha_atendimento(uuid, text, jsonb) to authenticated;

comment on function public.converter_ficha_atendimento(uuid, text, jsonb) is
  'Converte ficha em processo ou diligência atomicamente, com idempotência e validação de permissões.';
