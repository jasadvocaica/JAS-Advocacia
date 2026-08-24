-- 1. Marcador de exigência de revisão (backward compatible)
ALTER TABLE public.controladoria_itens
  ADD COLUMN IF NOT EXISTS exige_revisao boolean NOT NULL DEFAULT true;

-- 2. Função canônica de transição de etapa do workflow
CREATE OR REPLACE FUNCTION public.controladoria_transicionar_etapa(
  _item_id uuid,
  _nova_etapa text,
  _responsavel_id uuid DEFAULT NULL,
  _observacao text DEFAULT NULL
)
RETURNS public.controladoria_itens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _item public.controladoria_itens;
  _atual text;
  _permitido boolean := false;
  _agora timestamptz := now();
  _resp uuid;
  _resp_col text;
  _novo_status text;
  _aberto uuid;
  _label text;
  _obs text := nullif(btrim(coalesce(_observacao, '')), '');
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT * INTO _item FROM public.controladoria_itens WHERE id = _item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item não encontrado';
  END IF;

  -- Autorização: gestor, permissão de edição ou participante do fluxo
  IF NOT (
    public.is_gestor(_uid)
    OR public.has_permission(_uid, 'controladoria'::modulo, 'editar'::acao_permissao)
    OR _uid IN (_item.responsavel_id, _item.executor_id, _item.corretor_id, _item.revisor_id, _item.protocolador_id, _item.criado_por)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para movimentar esta tarefa';
  END IF;

  _atual := coalesce(_item.etapa_workflow, 'criacao');

  IF _nova_etapa = _atual THEN
    RAISE EXCEPTION 'A tarefa já está na etapa %', _atual;
  END IF;

  -- Máquina de estados canônica (POP 01)
  _permitido := CASE
    WHEN _atual = 'criacao'   AND _nova_etapa = 'execucao'  THEN true
    WHEN _atual = 'execucao'  AND _nova_etapa = 'revisao'   THEN true
    WHEN _atual = 'execucao'  AND _nova_etapa = 'protocolo' THEN NOT _item.exige_revisao
    WHEN _atual = 'revisao'   AND _nova_etapa = 'correcao'  THEN true
    WHEN _atual = 'revisao'   AND _nova_etapa = 'protocolo' THEN true
    WHEN _atual = 'correcao'  AND _nova_etapa = 'revisao'   THEN true
    WHEN _atual = 'protocolo' AND _nova_etapa = 'finalizado' THEN true
    ELSE false
  END;

  IF NOT _permitido THEN
    RAISE EXCEPTION 'Transição inválida: % → %', _atual, _nova_etapa;
  END IF;

  -- Devolução para correção exige observação
  IF _nova_etapa = 'correcao' AND _obs IS NULL THEN
    RAISE EXCEPTION 'Informe o que deve ser corrigido';
  END IF;

  _label := CASE _nova_etapa
    WHEN 'execucao' THEN 'Execução'
    WHEN 'revisao' THEN 'Revisão'
    WHEN 'correcao' THEN 'Correção'
    WHEN 'protocolo' THEN 'Protocolo'
    WHEN 'finalizado' THEN 'Finalizado'
    ELSE _nova_etapa
  END;

  _resp_col := CASE _nova_etapa
    WHEN 'execucao' THEN 'executor_id'
    WHEN 'revisao' THEN 'revisor_id'
    WHEN 'correcao' THEN 'corretor_id'
    WHEN 'protocolo' THEN 'protocolador_id'
    ELSE NULL
  END;

  IF _resp_col IS NOT NULL THEN
    _resp := coalesce(
      _responsavel_id,
      CASE _nova_etapa
        WHEN 'correcao' THEN _item.executor_id
        WHEN 'revisao' THEN _item.revisor_id
        WHEN 'protocolo' THEN _item.protocolador_id
        ELSE NULL
      END
    );
    IF _resp IS NULL THEN
      RAISE EXCEPTION 'Selecione o responsável pela etapa %', _label;
    END IF;
  END IF;

  _novo_status := CASE WHEN _nova_etapa = 'finalizado' THEN 'concluido' ELSE 'pendente' END;

  -- Fecha o registro aberto da etapa atual
  SELECT id INTO _aberto
  FROM public.controladoria_etapas_historico
  WHERE item_id = _item_id AND etapa = _atual AND finalizada_em IS NULL
  ORDER BY iniciada_em DESC LIMIT 1;

  IF _aberto IS NOT NULL THEN
    UPDATE public.controladoria_etapas_historico
      SET finalizada_em = _agora, observacao = coalesce(_obs, observacao)
      WHERE id = _aberto;
  ELSE
    INSERT INTO public.controladoria_etapas_historico
      (item_id, etapa, responsavel_id, iniciada_em, finalizada_em, observacao, criado_por)
    VALUES (_item_id, _atual, _item.responsavel_id, coalesce(_item.etapa_atualizada_em, _item.criado_em, _agora), _agora, _obs, _uid);
  END IF;

  -- Registra a aprovação quando libera para protocolo vindo da revisão
  IF _atual = 'revisao' AND _nova_etapa = 'protocolo' THEN
    INSERT INTO public.controladoria_etapas_historico
      (item_id, etapa, responsavel_id, iniciada_em, finalizada_em, observacao, criado_por)
    VALUES (_item_id, 'aprovacao', _uid, _agora, _agora, coalesce(_obs, 'Aprovado para protocolo'), _uid);
  END IF;

  -- Atualiza o item
  UPDATE public.controladoria_itens SET
    etapa_workflow = _nova_etapa,
    etapa_atualizada_em = _agora,
    status = _novo_status::status_item,
    coluna_kanban = CASE WHEN _nova_etapa = 'finalizado' THEN 'concluido' ELSE _nova_etapa END,
    responsavel_id = coalesce(_resp, responsavel_id),
    executor_id = CASE WHEN _nova_etapa = 'execucao' THEN _resp ELSE executor_id END,
    revisor_id = CASE WHEN _nova_etapa = 'revisao' THEN _resp ELSE revisor_id END,
    corretor_id = CASE WHEN _nova_etapa = 'correcao' THEN _resp ELSE corretor_id END,
    protocolador_id = CASE WHEN _nova_etapa = 'protocolo' THEN _resp ELSE protocolador_id END,
    concluido_em = CASE WHEN _nova_etapa = 'finalizado' THEN _agora ELSE concluido_em END,
    concluido_por = CASE WHEN _nova_etapa = 'finalizado' THEN _uid ELSE concluido_por END
  WHERE id = _item_id
  RETURNING * INTO _item;

  -- Abre o registro da nova etapa
  IF _nova_etapa <> 'finalizado' THEN
    INSERT INTO public.controladoria_etapas_historico
      (item_id, etapa, responsavel_id, iniciada_em, criado_por)
    VALUES (_item_id, _nova_etapa, _resp, _agora, _uid);
  END IF;

  -- Comentário automático no chat da tarefa
  INSERT INTO public.controladoria_comentarios (item_id, processo_id, user_id, texto)
  VALUES (
    _item_id,
    _item.processo_id,
    _uid,
    '➡️ **' || _label || '**' || CASE WHEN _obs IS NOT NULL THEN ' — ' || _obs ELSE '' END
  );

  -- Notifica o responsável da nova etapa
  IF _resp IS NOT NULL AND _resp <> _uid THEN
    INSERT INTO public.notificacoes (user_id, titulo, descricao, tipo, item_id, link)
    VALUES (
      _resp,
      'Nova etapa: ' || _label,
      coalesce(_obs, _item.titulo),
      'controladoria',
      _item_id,
      '/controladoria?item=' || _item_id::text
    );
  END IF;

  RETURN _item;
END;
$$;

REVOKE ALL ON FUNCTION public.controladoria_transicionar_etapa(uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.controladoria_transicionar_etapa(uuid, text, uuid, text) TO authenticated;