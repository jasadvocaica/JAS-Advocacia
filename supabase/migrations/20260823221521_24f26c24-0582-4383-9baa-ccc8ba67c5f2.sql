CREATE OR REPLACE FUNCTION public.iniciar_producao_juridica(
  _atendimento_id UUID,
  _processo_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_at RECORD;
  v_cfg RECORD;
  v_resp UUID;
  v_template RECORD;
  v_instancia_id UUID;
  v_item_id UUID;
  v_area TEXT;
  v_subtipo TEXT;
  v_prev TIMESTAMPTZ;
  v_ctx JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('status', 'sem_sessao', 'criou_fluxo', false);
  END IF;

  SELECT * INTO v_at FROM public.cliente_atendimentos WHERE id = _atendimento_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'ficha_nao_encontrada', 'criou_fluxo', false);
  END IF;

  IF NOT public.has_permission(v_uid, 'controladoria'::modulo, 'criar'::acao_permissao) THEN
    RETURN jsonb_build_object('status', 'sem_permissao', 'criou_fluxo', false);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('producao_juridica:' || _atendimento_id::text, 0));

  SELECT id INTO v_instancia_id
  FROM public.fluxo_instancias
  WHERE origem_tipo = 'atendimento' AND origem_id = _atendimento_id
  LIMIT 1;

  IF v_instancia_id IS NOT NULL THEN
    SELECT id INTO v_item_id
    FROM public.controladoria_itens
    WHERE origem_atendimento_id = _atendimento_id
    ORDER BY criado_em ASC LIMIT 1;
    RETURN jsonb_build_object('status', 'ja_existia', 'criou_fluxo', false,
      'ja_existia', true, 'instancia_id', v_instancia_id, 'item_id', v_item_id);
  END IF;

  v_area := lower(NULLIF(btrim(COALESCE(v_at.area, '')), ''));
  v_subtipo := lower(btrim(COALESCE(v_at.subtipo, '')));

  v_ctx := jsonb_build_object(
    'area', COALESCE(v_area, ''),
    'subtipo', v_subtipo,
    'atendimento_titulo', COALESCE(v_at.titulo, '')
  );

  SELECT * INTO v_cfg
  FROM public.producao_juridica_servicos s
  WHERE s.area_norm = COALESCE(v_area, '')
    AND s.subtipo_norm = v_subtipo
    AND s.ativo = true
  LIMIT 1;

  IF NOT FOUND OR v_cfg.template_id IS NULL THEN
    INSERT INTO public.producao_juridica_pendencias
      (origem_tipo, origem_id, cliente_id, codigo, status, contexto, criado_por)
    VALUES ('atendimento', _atendimento_id, v_at.cliente_id, 'SEM_FLUXO_CONFIGURADO', 'aberta', v_ctx, v_uid)
    ON CONFLICT (origem_tipo, origem_id) DO UPDATE
      SET codigo = EXCLUDED.codigo, status = 'aberta', contexto = EXCLUDED.contexto,
          atualizado_em = now(), resolvido_em = NULL, resolvido_por = NULL;
    RETURN jsonb_build_object('status', 'sem_fluxo_configurado', 'criou_fluxo', false);
  END IF;

  SELECT * INTO v_template FROM public.fluxos_templates WHERE id = v_cfg.template_id;
  IF NOT FOUND OR NOT v_template.ativo THEN
    INSERT INTO public.producao_juridica_pendencias
      (origem_tipo, origem_id, cliente_id, codigo, status, contexto, criado_por)
    VALUES ('atendimento', _atendimento_id, v_at.cliente_id, 'SEM_FLUXO_CONFIGURADO', 'aberta',
            v_ctx || jsonb_build_object('motivo', 'template_inexistente_ou_inativo'), v_uid)
    ON CONFLICT (origem_tipo, origem_id) DO UPDATE
      SET codigo = EXCLUDED.codigo, status = 'aberta', contexto = EXCLUDED.contexto,
          atualizado_em = now(), resolvido_em = NULL, resolvido_por = NULL;
    RETURN jsonb_build_object('status', 'sem_fluxo_configurado', 'criou_fluxo', false);
  END IF;

  -- Responsável: EXCLUSIVAMENTE o explícito da regra de serviço.
  -- Sem fallback para configuracoes_sistema, sem heurística.
  v_resp := v_cfg.responsavel_id;

  IF v_resp IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_resp AND p.ativo = true AND p.tipo_portal = 'interno'
  ) THEN
    INSERT INTO public.producao_juridica_pendencias
      (origem_tipo, origem_id, cliente_id, codigo, status, contexto, criado_por)
    VALUES ('atendimento', _atendimento_id, v_at.cliente_id, 'RESPONSAVEL_NAO_CONFIGURADO', 'aberta',
            v_ctx || jsonb_build_object('servico_id', v_cfg.id), v_uid)
    ON CONFLICT (origem_tipo, origem_id) DO UPDATE
      SET codigo = EXCLUDED.codigo, status = 'aberta', contexto = EXCLUDED.contexto,
          atualizado_em = now(), resolvido_em = NULL, resolvido_por = NULL;
    RETURN jsonb_build_object('status', 'responsavel_nao_configurado', 'criou_fluxo', false);
  END IF;

  v_instancia_id := public.instanciar_fluxo(
    v_cfg.template_id,
    CURRENT_DATE,
    _processo_id,
    v_at.cliente_id,
    v_resp,
    'Origem: ficha de atendimento ' || COALESCE(v_at.titulo, _atendimento_id::text)
  );

  UPDATE public.fluxo_instancias
  SET origem_tipo = 'atendimento', origem_id = _atendimento_id
  WHERE id = v_instancia_id;

  v_prev := (public.adicionar_dias_uteis(CURRENT_DATE, 7)::timestamp AT TIME ZONE 'UTC');

  -- Reutiliza SOMENTE o item gerado por etapa válida do template.
  SELECT e.item_controladoria_id INTO v_item_id
  FROM public.fluxo_instancia_etapas e
  WHERE e.instancia_id = v_instancia_id AND e.item_controladoria_id IS NOT NULL
  ORDER BY e.ordem ASC
  LIMIT 1;

  IF v_item_id IS NULL THEN
    -- Nunca inventar prazo judicial (data_vencimento é NOT NULL).
    -- Registra pendência técnica de configuração do template.
    INSERT INTO public.producao_juridica_pendencias
      (origem_tipo, origem_id, cliente_id, codigo, status, contexto, criado_por)
    VALUES ('atendimento', _atendimento_id, v_at.cliente_id, 'TEMPLATE_SEM_ETAPA_CONTROLADORIA', 'aberta',
            v_ctx || jsonb_build_object('servico_id', v_cfg.id, 'template_id', v_cfg.template_id,
                                        'instancia_id', v_instancia_id), v_uid)
    ON CONFLICT (origem_tipo, origem_id) DO UPDATE
      SET codigo = EXCLUDED.codigo, status = 'aberta', contexto = EXCLUDED.contexto,
          atualizado_em = now(), resolvido_em = NULL, resolvido_por = NULL;
    RETURN jsonb_build_object('status', 'template_sem_providencia', 'criou_fluxo', false,
      'instancia_id', v_instancia_id);
  END IF;

  -- SLA operacional é gravado apenas nos campos de SLA; data_vencimento (prazo
  -- judicial) permanece exatamente como definida pela etapa do template.
  UPDATE public.controladoria_itens
  SET responsavel_id = v_resp,
      executor_id = v_resp,
      etapa_workflow = 'execucao',
      etapa_atualizada_em = now(),
      origem_atendimento_id = _atendimento_id,
      sla_entrada_em = now(),
      sla_previsto_em = v_prev,
      sla_status = 'ativo',
      sla_pausado_em = NULL,
      sla_pausa_motivo = NULL
  WHERE id = v_item_id;

  INSERT INTO public.controladoria_responsaveis (item_id, user_id, papel)
  VALUES (v_item_id, v_resp, 'responsavel_principal')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.controladoria_etapas_historico (item_id, etapa, responsavel_id, iniciada_em, observacao, criado_por)
  VALUES (v_item_id, 'execucao', v_resp, now(), 'Produção jurídica iniciada pela conversão da ficha de atendimento', v_uid);

  UPDATE public.producao_juridica_pendencias
  SET status = 'resolvida', resolvido_em = now(), resolvido_por = v_uid, atualizado_em = now()
  WHERE origem_tipo = 'atendimento' AND origem_id = _atendimento_id AND status = 'aberta';

  INSERT INTO public.logs_atividade (user_id, acao, tabela, registro_id, detalhes)
  VALUES (
    v_uid, 'producao_juridica_iniciada', 'fluxo_instancias', v_instancia_id,
    jsonb_build_object(
      'atendimento_id', _atendimento_id,
      'template_id', v_cfg.template_id,
      'servico_id', v_cfg.id,
      'item_id', v_item_id,
      'responsavel_id', v_resp,
      'sla_previsto_em', v_prev
    )
  );

  RETURN jsonb_build_object(
    'status', 'criado',
    'criou_fluxo', true,
    'ja_existia', false,
    'instancia_id', v_instancia_id,
    'item_id', v_item_id,
    'responsavel_id', v_resp,
    'template_id', v_cfg.template_id,
    'sla_previsto_em', v_prev
  );
END;
$$;

REVOKE ALL ON FUNCTION public.iniciar_producao_juridica(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iniciar_producao_juridica(UUID, UUID) TO authenticated;