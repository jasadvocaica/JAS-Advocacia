-- ============================================================
-- 1. Templates: icone, cor, uso_count
-- ============================================================
ALTER TABLE public.fluxos_templates
  ADD COLUMN IF NOT EXISTS icone TEXT DEFAULT '📋',
  ADD COLUMN IF NOT EXISTS cor TEXT DEFAULT '#010423',
  ADD COLUMN IF NOT EXISTS uso_count INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- 2. Etapas template: gera_alerta_gestor + tipo 'audiencia' + novas referencias de prazo
-- ============================================================
ALTER TABLE public.fluxo_etapas_template
  ADD COLUMN IF NOT EXISTS gera_alerta_gestor BOOLEAN NOT NULL DEFAULT false;

-- Permite tipo 'audiencia' (CHECK era apenas string livre, sem constraint formal)
-- Permite prazo_referencia: gatilho | etapa_anterior | data_audiencia | data_intimacao
-- (colunas sao TEXT sem CHECK explicito, ja aceitam — apenas garantimos defaults)

-- ============================================================
-- 3. Instancias: snapshot, progresso, datas de fechamento
-- ============================================================
ALTER TABLE public.fluxo_instancias
  ADD COLUMN IF NOT EXISTS template_nome TEXT,
  ADD COLUMN IF NOT EXISTS progresso_pct INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS concluido_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelado_motivo TEXT,
  ADD COLUMN IF NOT EXISTS pausado_em TIMESTAMPTZ;

-- Backfill template_nome em instancias existentes
UPDATE public.fluxo_instancias i
SET template_nome = t.nome
FROM public.fluxos_templates t
WHERE i.template_id = t.id AND i.template_nome IS NULL;

-- ============================================================
-- 4. Etapas de instancia: aceite, comentario, checklist_pct
-- ============================================================
ALTER TABLE public.fluxo_instancia_etapas
  ADD COLUMN IF NOT EXISTS aceito_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS aceito_por UUID,
  ADD COLUMN IF NOT EXISTS data_vencimento_original DATE,
  ADD COLUMN IF NOT EXISTS comentario_conclusao TEXT,
  ADD COLUMN IF NOT EXISTS checklist_pct INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS gera_alerta_gestor BOOLEAN NOT NULL DEFAULT false;

-- Backfill data_vencimento_original
UPDATE public.fluxo_instancia_etapas
SET data_vencimento_original = data_vencimento
WHERE data_vencimento_original IS NULL;

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_fluxo_inst_etapas_updated ON public.fluxo_instancia_etapas;
CREATE TRIGGER trg_fluxo_inst_etapas_updated
BEFORE UPDATE ON public.fluxo_instancia_etapas
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 5. Tabela de comentarios das etapas
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fluxo_comentarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  etapa_id UUID NOT NULL REFERENCES public.fluxo_instancia_etapas(id) ON DELETE CASCADE,
  instancia_id UUID NOT NULL REFERENCES public.fluxo_instancias(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  texto TEXT NOT NULL,
  arquivos JSONB NOT NULL DEFAULT '[]'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fluxo_comentarios_etapa ON public.fluxo_comentarios(etapa_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_fluxo_comentarios_instancia ON public.fluxo_comentarios(instancia_id);

ALTER TABLE public.fluxo_comentarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fluxo_comentarios_select" ON public.fluxo_comentarios;
CREATE POLICY "fluxo_comentarios_select"
ON public.fluxo_comentarios FOR SELECT
TO authenticated
USING (public.is_gestor(auth.uid()) OR public.has_permission(auth.uid(), 'controladoria'::modulo, 'visualizar'::acao_permissao));

DROP POLICY IF EXISTS "fluxo_comentarios_insert" ON public.fluxo_comentarios;
CREATE POLICY "fluxo_comentarios_insert"
ON public.fluxo_comentarios FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() AND
  (public.is_gestor(auth.uid()) OR public.has_permission(auth.uid(), 'controladoria'::modulo, 'editar'::acao_permissao))
);

-- comentarios sao imutaveis (nada de update/delete)

-- ============================================================
-- 6. Indexes uteis
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_fluxo_inst_etapas_resp_status
  ON public.fluxo_instancia_etapas(responsavel_id, status);
CREATE INDEX IF NOT EXISTS idx_fluxo_inst_etapas_venc
  ON public.fluxo_instancia_etapas(data_vencimento, status);
CREATE INDEX IF NOT EXISTS idx_fluxo_instancias_status
  ON public.fluxo_instancias(status);

-- ============================================================
-- 7. Funcoes auxiliares
-- ============================================================
CREATE OR REPLACE FUNCTION public.recalcular_progresso_fluxo(_instancia_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total INTEGER;
  v_concl INTEGER;
  v_pct INTEGER;
  v_todas_concluidas BOOLEAN;
BEGIN
  SELECT COUNT(*) FILTER (WHERE obrigatorio),
         COUNT(*) FILTER (WHERE obrigatorio AND status = 'concluido')
  INTO v_total, v_concl
  FROM public.fluxo_instancia_etapas
  WHERE instancia_id = _instancia_id;

  v_pct := CASE WHEN v_total = 0 THEN 0 ELSE ROUND((v_concl::numeric / v_total) * 100)::int END;
  v_todas_concluidas := (v_total > 0 AND v_concl = v_total);

  UPDATE public.fluxo_instancias
  SET progresso_pct = v_pct,
      status = CASE WHEN v_todas_concluidas AND status = 'em_andamento' THEN 'concluido' ELSE status END,
      concluido_em = CASE WHEN v_todas_concluidas AND concluido_em IS NULL THEN now() ELSE concluido_em END
  WHERE id = _instancia_id;

  RETURN v_pct;
END;
$$;

-- Concluir etapa (com regras de checklist + recalculo)
CREATE OR REPLACE FUNCTION public.concluir_etapa_fluxo(
  _etapa_id UUID,
  _comentario TEXT DEFAULT NULL,
  _checklist JSONB DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_etapa RECORD;
  v_uid UUID := auth.uid();
  v_checklist JSONB;
  v_total_check INTEGER;
  v_feitos INTEGER;
  v_pct INTEGER;
  v_todas_marcadas BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida';
  END IF;

  SELECT * INTO v_etapa FROM public.fluxo_instancia_etapas WHERE id = _etapa_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Etapa não encontrada'; END IF;

  IF v_etapa.status = 'concluido' THEN RETURN v_etapa.instancia_id; END IF;

  v_checklist := COALESCE(_checklist, v_etapa.checklist_itens, '[]'::jsonb);

  -- Checklist obrigatorio bloqueia conclusao
  IF v_etapa.tipo = 'checklist' AND v_etapa.obrigatorio AND jsonb_array_length(v_checklist) > 0 THEN
    SELECT COUNT(*), COUNT(*) FILTER (WHERE (item->>'concluido')::boolean)
    INTO v_total_check, v_feitos
    FROM jsonb_array_elements(v_checklist) item;
    v_todas_marcadas := (v_total_check > 0 AND v_feitos = v_total_check);
    IF NOT v_todas_marcadas THEN
      RAISE EXCEPTION 'Complete todos os itens do checklist antes de concluir';
    END IF;
  END IF;

  -- Calcula pct do checklist
  IF jsonb_array_length(v_checklist) > 0 THEN
    SELECT COUNT(*), COUNT(*) FILTER (WHERE (item->>'concluido')::boolean)
    INTO v_total_check, v_feitos
    FROM jsonb_array_elements(v_checklist) item;
    v_pct := ROUND((v_feitos::numeric / NULLIF(v_total_check,0)) * 100)::int;
  ELSE
    v_pct := 100;
  END IF;

  UPDATE public.fluxo_instancia_etapas
  SET status = 'concluido',
      checklist_itens = v_checklist,
      checklist_pct = v_pct,
      concluido_em = now(),
      concluido_por = v_uid,
      comentario_conclusao = _comentario
  WHERE id = _etapa_id;

  -- Sincroniza item da controladoria, se existir
  IF v_etapa.item_controladoria_id IS NOT NULL THEN
    UPDATE public.controladoria_itens
    SET status = 'concluido', concluido_em = now(), concluido_por = v_uid
    WHERE id = v_etapa.item_controladoria_id AND status <> 'concluido';
  END IF;

  -- Insere comentario se houver texto
  IF _comentario IS NOT NULL AND length(trim(_comentario)) > 0 THEN
    INSERT INTO public.fluxo_comentarios (etapa_id, instancia_id, user_id, texto)
    VALUES (_etapa_id, v_etapa.instancia_id, v_uid, _comentario);
  END IF;

  PERFORM public.recalcular_progresso_fluxo(v_etapa.instancia_id);
  RETURN v_etapa.instancia_id;
END;
$$;

-- Pausar / Retomar / Cancelar
CREATE OR REPLACE FUNCTION public.pausar_instancia_fluxo(_instancia_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.fluxo_instancias
  SET status = 'pausado', pausado_em = now()
  WHERE id = _instancia_id AND status = 'em_andamento';
END;$$;

CREATE OR REPLACE FUNCTION public.retomar_instancia_fluxo(_instancia_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.fluxo_instancias
  SET status = 'em_andamento', pausado_em = NULL
  WHERE id = _instancia_id AND status = 'pausado';
END;$$;

CREATE OR REPLACE FUNCTION public.cancelar_instancia_fluxo(_instancia_id UUID, _motivo TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF _motivo IS NULL OR length(trim(_motivo)) = 0 THEN
    RAISE EXCEPTION 'Motivo do cancelamento é obrigatório';
  END IF;
  UPDATE public.fluxo_instancias
  SET status = 'cancelado', cancelado_em = now(), cancelado_motivo = _motivo
  WHERE id = _instancia_id AND status IN ('em_andamento','pausado');

  -- Cancela tambem itens da controladoria pendentes vinculados
  UPDATE public.controladoria_itens ci
  SET status = 'cancelado'
  FROM public.fluxo_instancia_etapas e
  WHERE e.instancia_id = _instancia_id
    AND e.item_controladoria_id = ci.id
    AND ci.status IN ('pendente','em_andamento','aguardando');
END;$$;

-- Job: marca etapas vencidas como atrasadas
CREATE OR REPLACE FUNCTION public.marcar_etapas_fluxo_atrasadas()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_count INTEGER;
BEGIN
  WITH upd AS (
    UPDATE public.fluxo_instancia_etapas
    SET status = 'atrasado'
    WHERE status IN ('pendente','aceito','em_andamento','aguardando')
      AND data_vencimento IS NOT NULL
      AND data_vencimento < CURRENT_DATE
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM upd;
  RETURN COALESCE(v_count, 0);
END;
$$;

-- ============================================================
-- 8. instanciar_fluxo reescrita (suporta prazos negativos, audiencia, gestor/estagiario, snapshot, uso_count)
-- ============================================================
CREATE OR REPLACE FUNCTION public.instanciar_fluxo(
  _template_id UUID,
  _data_gatilho DATE DEFAULT CURRENT_DATE,
  _processo_id UUID DEFAULT NULL,
  _cliente_id UUID DEFAULT NULL,
  _responsavel_id UUID DEFAULT NULL,
  _observacoes TEXT DEFAULT NULL,
  _data_audiencia DATE DEFAULT NULL,
  _data_intimacao DATE DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_instancia_id UUID;
  v_user_id UUID := auth.uid();
  v_template RECORD;
  v_etapa RECORD;
  v_data_base DATE;
  v_data_venc DATE;
  v_resp UUID;
  v_resp_anterior UUID;
  v_data_anterior DATE;
  v_cliente_nome TEXT;
  v_cliente_cpf TEXT;
  v_processo_numero TEXT;
  v_processo_area TEXT;
  v_advogado_nome TEXT;
  v_advogado_oab TEXT;
  v_advogado_id UUID;
  v_gestor_id UUID;
  v_estagiario_id UUID;
  v_texto TEXT;
  v_item_id UUID;
  v_tipo_item public.tipo_item_controladoria;
  v_status_inicial public.status_item;
  v_prio public.prioridade;
BEGIN
  IF NOT public.has_permission(v_user_id, 'controladoria'::modulo, 'criar'::acao_permissao) THEN
    RAISE EXCEPTION 'Sem permissão para disparar fluxos';
  END IF;

  SELECT * INTO v_template FROM public.fluxos_templates WHERE id = _template_id;
  IF NOT FOUND OR NOT v_template.ativo THEN
    RAISE EXCEPTION 'Template não encontrado ou inativo';
  END IF;

  -- Dados auxiliares para variaveis
  IF _cliente_id IS NOT NULL THEN
    SELECT nome, cpf_cnpj INTO v_cliente_nome, v_cliente_cpf FROM public.clientes WHERE id = _cliente_id;
  END IF;
  IF _processo_id IS NOT NULL THEN
    SELECT p.numero_cnj, p.area_direito, p.responsavel_id, c.nome, c.cpf_cnpj
    INTO v_processo_numero, v_processo_area, v_advogado_id, v_cliente_nome, v_cliente_cpf
    FROM public.processos p
    LEFT JOIN public.clientes c ON c.id = p.cliente_id
    WHERE p.id = _processo_id;
  END IF;

  IF v_advogado_id IS NOT NULL THEN
    SELECT pr.nome, em.oab_numero || '/' || em.oab_seccional
    INTO v_advogado_nome, v_advogado_oab
    FROM public.profiles pr
    LEFT JOIN public.equipe_membros em ON em.user_id = pr.id
    WHERE pr.id = v_advogado_id;
  END IF;

  -- Resolve gestor/estagiario default
  SELECT user_id INTO v_gestor_id
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id AND p.ativo = true
  WHERE ur.role = 'gestor' LIMIT 1;

  SELECT em.user_id INTO v_estagiario_id
  FROM public.equipe_membros em
  WHERE em.cargo = 'estagiario' AND em.status = 'ativo'
  LIMIT 1;

  -- Cria instancia (snapshot do nome)
  INSERT INTO public.fluxo_instancias (
    template_id, template_nome, processo_id, cliente_id,
    data_gatilho, responsavel_id, observacoes, criado_por, status, progresso_pct
  ) VALUES (
    _template_id, v_template.nome, _processo_id, _cliente_id,
    _data_gatilho, _responsavel_id, _observacoes, v_user_id, 'em_andamento', 0
  ) RETURNING id INTO v_instancia_id;

  -- Itera etapas
  v_data_anterior := _data_gatilho;
  v_resp_anterior := _responsavel_id;

  FOR v_etapa IN
    SELECT * FROM public.fluxo_etapas_template
    WHERE template_id = _template_id
    ORDER BY ordem ASC
  LOOP
    -- Determina data_base conforme referencia
    v_data_base := _data_gatilho;
    IF v_etapa.prazo_referencia = 'etapa_anterior' THEN
      v_data_base := COALESCE(v_data_anterior, _data_gatilho);
    ELSIF v_etapa.prazo_referencia = 'data_audiencia' THEN
      v_data_base := COALESCE(_data_audiencia, _data_gatilho);
    ELSIF v_etapa.prazo_referencia = 'data_intimacao' THEN
      v_data_base := COALESCE(_data_intimacao, _data_gatilho);
    END IF;

    -- Calcula vencimento (suporta prazo negativo)
    IF v_etapa.prazo_dias IS NULL OR v_etapa.prazo_dias = 0 THEN
      v_data_venc := v_data_base;
    ELSIF v_etapa.prazo_dias < 0 THEN
      v_data_venc := (v_data_base + (v_etapa.prazo_dias || ' days')::interval)::date;
    ELSIF v_etapa.prazo_tipo = 'uteis' THEN
      v_data_venc := public.adicionar_dias_uteis(v_data_base, v_etapa.prazo_dias);
    ELSE
      v_data_venc := public.adicionar_dias_corridos(v_data_base, v_etapa.prazo_dias);
    END IF;

    -- Resolve responsavel
    v_resp := _responsavel_id;
    IF v_etapa.responsavel_padrao = 'advogado_caso' THEN
      v_resp := COALESCE(v_advogado_id, _responsavel_id);
    ELSIF v_etapa.responsavel_padrao = 'gestor' THEN
      v_resp := COALESCE(v_gestor_id, _responsavel_id);
    ELSIF v_etapa.responsavel_padrao = 'estagiario' THEN
      v_resp := COALESCE(v_estagiario_id, _responsavel_id);
    ELSIF v_etapa.responsavel_padrao = 'responsavel_anterior' THEN
      v_resp := COALESCE(v_resp_anterior, _responsavel_id);
    END IF;

    -- Substitui variaveis no template
    v_texto := v_etapa.template_texto;
    IF v_texto IS NOT NULL THEN
      v_texto := REPLACE(v_texto, '{{nome_cliente}}', COALESCE(v_cliente_nome, ''));
      v_texto := REPLACE(v_texto, '{{cpf}}', COALESCE(v_cliente_cpf, ''));
      v_texto := REPLACE(v_texto, '{{numero_cnj}}', COALESCE(v_processo_numero, ''));
      v_texto := REPLACE(v_texto, '{{area_direito}}', COALESCE(v_processo_area, ''));
      v_texto := REPLACE(v_texto, '{{nome_advogado}}', COALESCE(v_advogado_nome, ''));
      v_texto := REPLACE(v_texto, '{{oab}}', COALESCE(v_advogado_oab, ''));
      v_texto := REPLACE(v_texto, '{{data_referencia}}', to_char(_data_gatilho, 'DD/MM/YYYY'));
      v_texto := REPLACE(v_texto, '{{data_hoje}}', to_char(CURRENT_DATE, 'DD/MM/YYYY'));
    END IF;

    -- Mapeia tipo para enum da controladoria (cria item se aplicavel)
    v_item_id := NULL;
    IF v_etapa.tipo IN ('prazo_fatal','prazo_processual','tarefa','audiencia') THEN
      v_tipo_item := v_etapa.tipo::public.tipo_item_controladoria;
      v_prio := v_etapa.prioridade;
      v_status_inicial := CASE
        WHEN v_data_venc IS NOT NULL AND v_data_venc < CURRENT_DATE THEN 'pendente'::public.status_item
        ELSE 'pendente'::public.status_item
      END;

      INSERT INTO public.controladoria_itens (
        titulo, descricao, tipo, prioridade, data_vencimento,
        cliente_id, processo_id, criado_por, status
      ) VALUES (
        v_etapa.titulo,
        COALESCE(v_etapa.descricao, '') ||
          CASE WHEN COALESCE(jsonb_array_length(v_etapa.checklist_itens),0) > 0
               THEN E'\n\nChecklist:\n- ' || array_to_string(ARRAY(SELECT jsonb_array_elements_text(v_etapa.checklist_itens)), E'\n- ')
               ELSE '' END,
        v_tipo_item, v_prio,
        (v_data_venc::timestamp AT TIME ZONE 'UTC'),
        _cliente_id, _processo_id, v_user_id, v_status_inicial
      ) RETURNING id INTO v_item_id;

      -- Adiciona responsavel principal no item da controladoria
      IF v_resp IS NOT NULL THEN
        INSERT INTO public.controladoria_responsaveis (item_id, user_id, papel)
        VALUES (v_item_id, v_resp, 'responsavel_principal');
      END IF;
    END IF;

    -- Cria etapa da instancia
    INSERT INTO public.fluxo_instancia_etapas (
      instancia_id, etapa_template_id, item_controladoria_id, ordem, titulo, descricao,
      tipo, data_vencimento, data_vencimento_original, responsavel_id, checklist_itens,
      template_texto, texto_preenchido, obrigatorio, gera_alerta_gestor,
      status
    ) VALUES (
      v_instancia_id, v_etapa.id, v_item_id, v_etapa.ordem, v_etapa.titulo, v_etapa.descricao,
      v_etapa.tipo, v_data_venc, v_data_venc, v_resp,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('item', val, 'concluido', false))
                FROM jsonb_array_elements_text(v_etapa.checklist_itens) val), '[]'::jsonb),
      v_etapa.template_texto, v_texto, v_etapa.obrigatorio, v_etapa.gera_alerta_gestor,
      CASE WHEN v_data_venc IS NOT NULL AND v_data_venc < CURRENT_DATE
           THEN 'atrasado' ELSE 'pendente' END
    );

    v_data_anterior := COALESCE(v_data_venc, v_data_anterior);
    v_resp_anterior := COALESCE(v_resp, v_resp_anterior);

    -- Notifica responsavel
    IF v_resp IS NOT NULL AND v_resp <> v_user_id THEN
      INSERT INTO public.notificacoes (user_id, tipo, titulo, descricao, link)
      VALUES (
        v_resp, 'tarefa_atribuida',
        'Nova etapa de fluxo: ' || v_etapa.titulo,
        v_template.nome,
        '/fluxos/instancia/' || v_instancia_id::text
      );
    END IF;

    -- Notifica gestor se marcado
    IF v_etapa.gera_alerta_gestor AND v_gestor_id IS NOT NULL AND v_gestor_id <> v_user_id THEN
      INSERT INTO public.notificacoes (user_id, tipo, titulo, descricao, link)
      VALUES (
        v_gestor_id, 'alerta_etapa_fluxo',
        'Etapa crítica criada: ' || v_etapa.titulo,
        v_template.nome,
        '/fluxos/instancia/' || v_instancia_id::text
      );
    END IF;
  END LOOP;

  -- Incrementa contador de uso
  UPDATE public.fluxos_templates
  SET uso_count = uso_count + 1
  WHERE id = _template_id;

  RETURN v_instancia_id;
END;
$$;