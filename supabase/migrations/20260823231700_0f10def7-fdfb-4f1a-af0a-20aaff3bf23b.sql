
-- 1) Configuração canônica do revisor (sem valor: nada de atribuição silenciosa)
INSERT INTO public.configuracoes_sistema (secao, chave, valor, tipo, descricao, editavel_por, publica)
VALUES ('producao_juridica', 'revisor_padrao_user_id', NULL, 'texto',
        'Usuário revisor padrão da produção jurídica. Enquanto vazio, o painel exibe "Revisor não configurado" e não atribui ninguém automaticamente.',
        'gestor', false)
ON CONFLICT DO NOTHING;

-- 2) Revisor configurado (leitura segura, sem expor demais configurações)
CREATE OR REPLACE FUNCTION public.producao_revisor_padrao()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _rev uuid;
  _nome text;
BEGIN
  IF _uid IS NULL OR NOT public.is_interno_ativo(_uid) THEN
    RETURN jsonb_build_object('configurado', false, 'user_id', NULL, 'nome', NULL, 'ativo', false);
  END IF;

  SELECT nullif(btrim(coalesce(valor, '')), '')::uuid INTO _rev
  FROM public.configuracoes_sistema
  WHERE secao = 'producao_juridica' AND chave = 'revisor_padrao_user_id';

  IF _rev IS NULL THEN
    RETURN jsonb_build_object('configurado', false, 'user_id', NULL, 'nome', NULL, 'ativo', false);
  END IF;

  SELECT nome INTO _nome FROM public.profiles WHERE id = _rev;

  RETURN jsonb_build_object(
    'configurado', true,
    'user_id', _rev,
    'nome', _nome,
    'ativo', public.is_interno_ativo(_rev)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.producao_revisor_padrao() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.producao_revisor_padrao() TO authenticated;

-- 3) Aguardar documentos: pausa o SLA operacional, nunca o prazo judicial
CREATE OR REPLACE FUNCTION public.producao_aguardar_documentos(_item_id uuid, _motivo text)
RETURNS public.controladoria_itens
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _item public.controladoria_itens;
  _obs text := nullif(btrim(coalesce(_motivo, '')), '');
  _agora timestamptz := now();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF _obs IS NULL THEN
    RAISE EXCEPTION 'Informe o que está sendo aguardado do cliente';
  END IF;

  SELECT * INTO _item FROM public.controladoria_itens WHERE id = _item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item não encontrado';
  END IF;

  IF NOT (
    public.is_gestor(_uid)
    OR public.has_permission(_uid, 'controladoria'::modulo, 'editar'::acao_permissao)
    OR _uid IN (_item.responsavel_id, _item.executor_id, _item.corretor_id, _item.revisor_id, _item.protocolador_id, _item.criado_por)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para movimentar esta tarefa';
  END IF;

  IF coalesce(_item.etapa_workflow, 'criacao') NOT IN ('execucao', 'correcao') THEN
    RAISE EXCEPTION 'Só é possível aguardar documentos durante a produção';
  END IF;
  IF _item.sla_pausado_em IS NOT NULL THEN
    RETURN _item; -- idempotente
  END IF;

  UPDATE public.controladoria_itens SET
    status = 'aguardando'::status_item,
    sla_pausado_em = _agora,
    sla_pausa_motivo = _obs,
    atualizado_em = _agora
  WHERE id = _item_id
  RETURNING * INTO _item;

  INSERT INTO public.controladoria_etapas_historico
    (item_id, etapa, responsavel_id, iniciada_em, finalizada_em, observacao, criado_por)
  VALUES (_item_id, 'aguardando_documentos', _uid, _agora, NULL, _obs, _uid);

  INSERT INTO public.controladoria_comentarios (item_id, user_id, mensagem)
  VALUES (_item_id, _uid, 'Aguardando documentos do cliente: ' || _obs);

  RETURN _item;
END;
$$;

REVOKE ALL ON FUNCTION public.producao_aguardar_documentos(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.producao_aguardar_documentos(uuid, text) TO authenticated;

-- 4) Retomar produção: fecha a pausa preservando o tempo aguardado
CREATE OR REPLACE FUNCTION public.producao_retomar_producao(_item_id uuid, _observacao text, _documento_recebido text)
RETURNS public.controladoria_itens
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _item public.controladoria_itens;
  _obs text := nullif(btrim(coalesce(_observacao, '')), '');
  _doc text := nullif(btrim(coalesce(_documento_recebido, '')), '');
  _agora timestamptz := now();
  _min integer := 0;
  _aberto uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT * INTO _item FROM public.controladoria_itens WHERE id = _item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item não encontrado';
  END IF;

  IF NOT (
    public.is_gestor(_uid)
    OR public.has_permission(_uid, 'controladoria'::modulo, 'editar'::acao_permissao)
    OR _uid IN (_item.responsavel_id, _item.executor_id, _item.corretor_id, _item.revisor_id, _item.protocolador_id, _item.criado_por)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para movimentar esta tarefa';
  END IF;

  IF _item.sla_pausado_em IS NULL THEN
    RETURN _item; -- idempotente
  END IF;

  _min := greatest(0, (EXTRACT(EPOCH FROM (_agora - _item.sla_pausado_em)) / 60)::integer);

  UPDATE public.controladoria_itens SET
    status = 'em_andamento'::status_item,
    sla_pausado_em = NULL,
    sla_pausa_motivo = NULL,
    sla_minutos_pausados = coalesce(sla_minutos_pausados, 0) + _min,
    documentos_recebidos = CASE
      WHEN _doc IS NULL THEN documentos_recebidos
      ELSE btrim(coalesce(documentos_recebidos || E'\n', '') || _doc)
    END,
    atualizado_em = _agora
  WHERE id = _item_id
  RETURNING * INTO _item;

  SELECT id INTO _aberto
  FROM public.controladoria_etapas_historico
  WHERE item_id = _item_id AND etapa = 'aguardando_documentos' AND finalizada_em IS NULL
  ORDER BY iniciada_em DESC LIMIT 1;

  IF _aberto IS NOT NULL THEN
    UPDATE public.controladoria_etapas_historico
      SET finalizada_em = _agora,
          observacao = btrim(coalesce(observacao || ' | ', '') || coalesce(_obs, 'Produção retomada'))
      WHERE id = _aberto;
  ELSE
    INSERT INTO public.controladoria_etapas_historico
      (item_id, etapa, responsavel_id, iniciada_em, finalizada_em, observacao, criado_por)
    VALUES (_item_id, 'aguardando_documentos', _uid, _item.sla_pausado_em, _agora, coalesce(_obs, 'Produção retomada'), _uid);
  END IF;

  INSERT INTO public.controladoria_comentarios (item_id, user_id, mensagem)
  VALUES (_item_id, _uid,
    'Produção retomada'
    || CASE WHEN _doc IS NOT NULL THEN ' — documento recebido: ' || _doc ELSE '' END
    || CASE WHEN _obs IS NOT NULL THEN ' — ' || _obs ELSE '' END);

  RETURN _item;
END;
$$;

REVOKE ALL ON FUNCTION public.producao_retomar_producao(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.producao_retomar_producao(uuid, text, text) TO authenticated;
