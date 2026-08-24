-- ============================================================
-- FASE 2A — Produção jurídica a partir da conversão da ficha
-- Migration não destrutiva / backward compatible
-- ============================================================

-- 1. SLA operacional (separado de data_vencimento / prazo judicial)
ALTER TABLE public.controladoria_itens
  ADD COLUMN IF NOT EXISTS sla_entrada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_previsto_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_status TEXT NOT NULL DEFAULT 'nao_aplicavel',
  ADD COLUMN IF NOT EXISTS sla_pausado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_pausa_motivo TEXT,
  ADD COLUMN IF NOT EXISTS sla_minutos_pausados INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS origem_atendimento_id UUID;

CREATE INDEX IF NOT EXISTS idx_controladoria_itens_origem_atendimento
  ON public.controladoria_itens(origem_atendimento_id)
  WHERE origem_atendimento_id IS NOT NULL;

-- 2. Origem da instância de fluxo + idempotência forte
ALTER TABLE public.fluxo_instancias
  ADD COLUMN IF NOT EXISTS origem_tipo TEXT,
  ADD COLUMN IF NOT EXISTS origem_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fluxo_instancias_origem
  ON public.fluxo_instancias(origem_tipo, origem_id)
  WHERE origem_id IS NOT NULL;

-- 3. Configuração explícita e trocável (criada VAZIA de propósito)
INSERT INTO public.configuracoes_sistema (secao, chave, valor, valor_json, descricao, tipo, editavel_por, publica)
VALUES (
  'producao_juridica', 'responsavel_padrao_user_id', NULL, NULL,
  'ID do usuário responsável padrão pela produção jurídica. Precisa ser preenchido para que a conversão da ficha gere fluxo automaticamente.',
  'texto', 'gestor', false
)
ON CONFLICT (secao, chave) DO NOTHING;

INSERT INTO public.configuracoes_sistema (secao, chave, valor, valor_json, descricao, tipo, editavel_por, publica)
VALUES (
  'producao_juridica', 'mapa_servico_template', NULL, '{}'::jsonb,
  'Mapa configurável de tipo de serviço para template de fluxo. Chaves aceitas: "area:subtipo", "area" ou "_default".',
  'json', 'gestor', false
)
ON CONFLICT (secao, chave) DO NOTHING;

-- 4. RPC canônica transacional
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
  v_resp_txt TEXT;
  v_resp UUID;
  v_mapa JSONB;
  v_template_txt TEXT;
  v_template_id UUID;
  v_template RECORD;
  v_instancia_id UUID;
  v_item_id UUID;
  v_area TEXT;
  v_subtipo TEXT;
  v_prev TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida';
  END IF;
  IF NOT public.has_permission(v_uid, 'controladoria'::modulo, 'criar'::acao_permissao) THEN
    RAISE EXCEPTION 'Sem permissão para iniciar a produção jurídica';
  END IF;

  SELECT * INTO v_at FROM public.cliente_atendimentos WHERE id = _atendimento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ficha de atendimento não encontrada';
  END IF;

  -- Serializa por ficha: protege contra concorrência (idempotência forte)
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
    RETURN jsonb_build_object('ja_existia', true, 'instancia_id', v_instancia_id, 'item_id', v_item_id);
  END IF;

  -- Responsável padrão: configuração explícita, sem heurística e sem fallback
  SELECT NULLIF(trim(COALESCE(valor, valor_json #>> '{}')), '')
  INTO v_resp_txt
  FROM public.configuracoes_sistema
  WHERE secao = 'producao_juridica' AND chave = 'responsavel_padrao_user_id';

  IF v_resp_txt IS NULL THEN
    RAISE EXCEPTION 'CONFIG_RESPONSAVEL_AUSENTE: defina o responsável padrão da produção jurídica em Configurações antes de converter a ficha.';
  END IF;

  BEGIN
    v_resp := v_resp_txt::uuid;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'CONFIG_RESPONSAVEL_INVALIDO: o responsável padrão configurado não é um usuário válido.';
  END;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_resp AND p.ativo = true AND p.tipo_portal = 'interno'
  ) THEN
    RAISE EXCEPTION 'CONFIG_RESPONSAVEL_INVALIDO: o responsável padrão configurado não está ativo como usuário interno.';
  END IF;

  -- Template por area+subtipo -> area -> _default
  v_area := lower(NULLIF(trim(COALESCE(v_at.area, '')), ''));
  v_subtipo := lower(NULLIF(trim(COALESCE(v_at.subtipo, '')), ''));

  SELECT COALESCE(valor_json, '{}'::jsonb) INTO v_mapa
  FROM public.configuracoes_sistema
  WHERE secao = 'producao_juridica' AND chave = 'mapa_servico_template';
  v_mapa := COALESCE(v_mapa, '{}'::jsonb);

  v_template_txt := COALESCE(
    CASE WHEN v_area IS NOT NULL AND v_subtipo IS NOT NULL
         THEN v_mapa ->> (v_area || ':' || v_subtipo) END,
    CASE WHEN v_area IS NOT NULL THEN v_mapa ->> v_area END,
    v_mapa ->> '_default'
  );

  IF NULLIF(trim(COALESCE(v_template_txt, '')), '') IS NULL THEN
    RAISE EXCEPTION 'TEMPLATE_AUSENTE: nenhum fluxo configurado para a área "%" (subtipo "%"). Configure o mapa de serviços em Configurações.',
      COALESCE(v_area, 'não informada'), COALESCE(v_subtipo, '-');
  END IF;

  BEGIN
    v_template_id := v_template_txt::uuid;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'TEMPLATE_AUSENTE: o fluxo configurado para esta área é inválido.';
  END;

  SELECT * INTO v_template FROM public.fluxos_templates WHERE id = v_template_id;
  IF NOT FOUND OR NOT v_template.ativo THEN
    RAISE EXCEPTION 'TEMPLATE_AUSENTE: o fluxo configurado para esta área não existe ou está inativo.';
  END IF;

  -- Cria exatamente uma instância reutilizando o motor existente
  v_instancia_id := public.instanciar_fluxo(
    v_template_id,
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

  -- Primeira providência: item já criado pelo template, se houver
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

  INSERT INTO public.logs_atividade (user_id, acao, tabela, registro_id, detalhes)
  VALUES (
    v_uid, 'producao_juridica_iniciada', 'fluxo_instancias', v_instancia_id,
    jsonb_build_object(
      'atendimento_id', _atendimento_id,
      'template_id', v_template_id,
      'item_id', v_item_id,
      'responsavel_id', v_resp,
      'sla_previsto_em', v_prev
    )
  );

  RETURN jsonb_build_object(
    'ja_existia', false,
    'instancia_id', v_instancia_id,
    'item_id', v_item_id,
    'responsavel_id', v_resp,
    'template_id', v_template_id,
    'sla_previsto_em', v_prev
  );
END;
$$;

REVOKE ALL ON FUNCTION public.iniciar_producao_juridica(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iniciar_producao_juridica(UUID, UUID) TO authenticated;