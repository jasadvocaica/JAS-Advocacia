-- ============================================================
-- Fase 2A (continuação) — configuração relacional de serviço
-- e registro persistente de pendências. Não destrutivo.
-- ============================================================

-- 1. Configuração de serviço (área + subtipo -> template + responsável)
CREATE TABLE IF NOT EXISTS public.producao_juridica_servicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area TEXT NOT NULL,
  subtipo TEXT,
  area_norm TEXT GENERATED ALWAYS AS (lower(btrim(area))) STORED,
  subtipo_norm TEXT GENERATED ALWAYS AS (lower(btrim(COALESCE(subtipo, '')))) STORED,
  template_id UUID REFERENCES public.fluxos_templates(id) ON DELETE RESTRICT,
  responsavel_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  metadados JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_prod_jur_servicos_area_subtipo
  ON public.producao_juridica_servicos(area_norm, subtipo_norm);

GRANT SELECT ON public.producao_juridica_servicos TO authenticated;
GRANT ALL ON public.producao_juridica_servicos TO service_role;
ALTER TABLE public.producao_juridica_servicos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Internos leem configuracao de servico" ON public.producao_juridica_servicos;
CREATE POLICY "Internos leem configuracao de servico"
  ON public.producao_juridica_servicos FOR SELECT TO authenticated
  USING (public.is_interno_ativo(auth.uid()));

DROP POLICY IF EXISTS "Gestores mantem configuracao de servico" ON public.producao_juridica_servicos;
CREATE POLICY "Gestores mantem configuracao de servico"
  ON public.producao_juridica_servicos FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid()))
  WITH CHECK (public.is_gestor(auth.uid()));

DROP TRIGGER IF EXISTS trg_prod_jur_servicos_updated ON public.producao_juridica_servicos;
CREATE TRIGGER trg_prod_jur_servicos_updated
  BEFORE UPDATE ON public.producao_juridica_servicos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Pendências de configuração por origem (ficha/conversão)
CREATE TABLE IF NOT EXISTS public.producao_juridica_pendencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origem_tipo TEXT NOT NULL DEFAULT 'atendimento',
  origem_id UUID NOT NULL,
  cliente_id UUID,
  codigo TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberta',
  contexto JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_por UUID,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolvido_em TIMESTAMPTZ,
  resolvido_por UUID
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_prod_jur_pendencias_origem
  ON public.producao_juridica_pendencias(origem_tipo, origem_id);

GRANT SELECT, UPDATE ON public.producao_juridica_pendencias TO authenticated;
GRANT ALL ON public.producao_juridica_pendencias TO service_role;
ALTER TABLE public.producao_juridica_pendencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gestores leem pendencias de producao" ON public.producao_juridica_pendencias;
CREATE POLICY "Gestores leem pendencias de producao"
  ON public.producao_juridica_pendencias FOR SELECT TO authenticated
  USING (public.is_gestor(auth.uid()));

DROP POLICY IF EXISTS "Gestores atualizam pendencias de producao" ON public.producao_juridica_pendencias;
CREATE POLICY "Gestores atualizam pendencias de producao"
  ON public.producao_juridica_pendencias FOR UPDATE TO authenticated
  USING (public.is_gestor(auth.uid()))
  WITH CHECK (public.is_gestor(auth.uid()));

-- 3. RPC canônica: não bloqueia a conversão; registra pendência quando incompleto
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
  v_resp_txt TEXT;
  v_resp UUID;
  v_template RECORD;
  v_instancia_id UUID;
  v_item_id UUID;
  v_area TEXT;
  v_subtipo TEXT;
  v_prev TIMESTAMPTZ;

  PROCEDURE_CONTEXT JSONB;
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

  -- Serializa por ficha: idempotência forte sob concorrência
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

  PROCEDURE_CONTEXT := jsonb_build_object(
    'area', COALESCE(v_area, ''),
    'subtipo', v_subtipo,
    'atendimento_titulo', COALESCE(v_at.titulo, '')
  );

  -- Associação EXATA area+subtipo, ativa e completa. Sem inferência, sem fallback.
  SELECT * INTO v_cfg
  FROM public.producao_juridica_servicos s
  WHERE s.area_norm = COALESCE(v_area, '')
    AND s.subtipo_norm = v_subtipo
    AND s.ativo = true
  LIMIT 1;

  IF NOT FOUND OR v_cfg.template_id IS NULL THEN
    INSERT INTO public.producao_juridica_pendencias
      (origem_tipo, origem_id, cliente_id, codigo, status, contexto, criado_por)
    VALUES ('atendimento', _atendimento_id, v_at.cliente_id, 'SEM_FLUXO_CONFIGURADO', 'aberta',
            PROCEDURE_CONTEXT, v_uid)
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
            PROCEDURE_CONTEXT || jsonb_build_object('motivo', 'template_inexistente_ou_inativo'), v_uid)
    ON CONFLICT (origem_tipo, origem_id) DO UPDATE
      SET codigo = EXCLUDED.codigo, status = 'aberta', contexto = EXCLUDED.contexto,
          atualizado_em = now(), resolvido_em = NULL, resolvido_por = NULL;
    RETURN jsonb_build_object('status', 'sem_fluxo_configurado', 'criou_fluxo', false);
  END IF;

  -- Responsável: explícito da regra; se ausente, configuração global. Sem heurística.
  v_resp := v_cfg.responsavel_id;

  IF v_resp IS NULL THEN
    SELECT NULLIF(btrim(COALESCE(valor, valor_json #>> '{}')), '')
    INTO v_resp_txt
    FROM public.configuracoes_sistema
    WHERE secao = 'producao_juridica' AND chave = 'responsavel_padrao_user_id';

    IF v_resp_txt IS NOT NULL THEN
      BEGIN
        v_resp := v_resp_txt::uuid;
      EXCEPTION WHEN others THEN
        v_resp := NULL;
      END;
    END IF;
  END IF;

  IF v_resp IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_resp AND p.ativo = true AND p.tipo_portal = 'interno'
  ) THEN
    INSERT INTO public.producao_juridica_pendencias
      (origem_tipo, origem_id, cliente_id, codigo, status, contexto, criado_por)
    VALUES ('atendimento', _atendimento_id, v_at.cliente_id, 'RESPONSAVEL_NAO_CONFIGURADO', 'aberta',
            PROCEDURE_CONTEXT || jsonb_build_object('servico_id', v_cfg.id), v_uid)
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

  SELECT e.item_controladoria_id INTO v_item_id
  FROM public.fluxo_instancia_etapas e
  WHERE e.instancia_id = v_instancia_id AND e.item_controladoria_id IS NOT NULL
  ORDER BY e.ordem ASC
  LIMIT 1;

  IF v_item_id IS NULL THEN
    INSERT INTO public.controladoria_itens (
      titulo, descricao, tipo, prioridade, data_vencimento,
      cliente_id, processo_id, criado_por, status, origem
    ) VALUES (
      'Produção jurídica — ' || COALESCE(v_at.titulo, 'Atendimento'),
      COALESCE(v_at.resumo, v_at.resumo_ia, ''),
      'tarefa'::public.tipo_item_controladoria,
      'media'::public.prioridade,
      v_prev,
      v_at.cliente_id, _processo_id, v_uid, 'pendente'::public.status_item, 'controladoria'
    ) RETURNING id INTO v_item_id;
  END IF;

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