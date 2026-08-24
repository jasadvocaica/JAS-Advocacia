-- =========================================================
-- MÓDULO DE FLUXOS AUTOMATIZADOS
-- =========================================================

-- 1. Adicionar colunas em fluxos_templates
ALTER TABLE public.fluxos_templates
  ADD COLUMN IF NOT EXISTS gatilho TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS criado_por UUID,
  ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now();

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_fluxos_templates_updated_at ON public.fluxos_templates;
CREATE TRIGGER trg_fluxos_templates_updated_at
  BEFORE UPDATE ON public.fluxos_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Tabela de etapas do template
CREATE TABLE IF NOT EXISTS public.fluxo_etapas_template (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.fluxos_templates(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  tipo TEXT NOT NULL DEFAULT 'tarefa',
  -- 'prazo_fatal' | 'prazo_processual' | 'tarefa' | 'checklist' | 'comunicacao'
  prazo_dias INTEGER NOT NULL DEFAULT 0,
  prazo_tipo TEXT NOT NULL DEFAULT 'uteis', -- 'uteis' | 'corridos'
  prazo_referencia TEXT NOT NULL DEFAULT 'gatilho', -- 'gatilho' | 'etapa_anterior'
  responsavel_padrao TEXT, -- 'advogado_caso' | 'gestor' | 'estagiario' | null
  checklist_itens JSONB NOT NULL DEFAULT '[]'::jsonb,
  template_texto TEXT,
  obrigatorio BOOLEAN NOT NULL DEFAULT true,
  prioridade public.prioridade NOT NULL DEFAULT 'media',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fluxo_etapas_template_template ON public.fluxo_etapas_template(template_id, ordem);

ALTER TABLE public.fluxo_etapas_template ENABLE ROW LEVEL SECURITY;

CREATE POLICY "todos veem etapas template"
  ON public.fluxo_etapas_template FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "gestor gerencia etapas template"
  ON public.fluxo_etapas_template FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid()))
  WITH CHECK (public.is_gestor(auth.uid()));

-- 3. Tabela de instâncias de fluxo
CREATE TABLE IF NOT EXISTS public.fluxo_instancias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.fluxos_templates(id),
  processo_id UUID REFERENCES public.processos(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
  data_gatilho DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'em_andamento', -- 'em_andamento' | 'concluido' | 'cancelado'
  responsavel_id UUID,
  observacoes TEXT,
  criado_por UUID,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fluxo_instancias_processo ON public.fluxo_instancias(processo_id);
CREATE INDEX IF NOT EXISTS idx_fluxo_instancias_cliente ON public.fluxo_instancias(cliente_id);

DROP TRIGGER IF EXISTS trg_fluxo_instancias_updated_at ON public.fluxo_instancias;
CREATE TRIGGER trg_fluxo_instancias_updated_at
  BEFORE UPDATE ON public.fluxo_instancias
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.fluxo_instancias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ver instancias"
  ON public.fluxo_instancias FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'controladoria'::modulo, 'visualizar'::acao_permissao));

CREATE POLICY "criar instancias"
  ON public.fluxo_instancias FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'controladoria'::modulo, 'criar'::acao_permissao));

CREATE POLICY "editar instancias"
  ON public.fluxo_instancias FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'controladoria'::modulo, 'editar'::acao_permissao));

CREATE POLICY "excluir instancias"
  ON public.fluxo_instancias FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'controladoria'::modulo, 'excluir'::acao_permissao));

-- 4. Tabela de etapas das instâncias
CREATE TABLE IF NOT EXISTS public.fluxo_instancia_etapas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instancia_id UUID NOT NULL REFERENCES public.fluxo_instancias(id) ON DELETE CASCADE,
  etapa_template_id UUID REFERENCES public.fluxo_etapas_template(id) ON DELETE SET NULL,
  item_controladoria_id UUID REFERENCES public.controladoria_itens(id) ON DELETE SET NULL,
  ordem INTEGER NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  tipo TEXT NOT NULL DEFAULT 'tarefa',
  data_vencimento DATE,
  status TEXT NOT NULL DEFAULT 'pendente', -- 'pendente' | 'em_andamento' | 'concluido' | 'cancelado'
  responsavel_id UUID,
  checklist_itens JSONB NOT NULL DEFAULT '[]'::jsonb,
  template_texto TEXT,
  texto_preenchido TEXT,
  obrigatorio BOOLEAN NOT NULL DEFAULT true,
  concluido_em TIMESTAMPTZ,
  concluido_por UUID,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fluxo_inst_etapas_instancia ON public.fluxo_instancia_etapas(instancia_id, ordem);

ALTER TABLE public.fluxo_instancia_etapas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ver instancia etapas"
  ON public.fluxo_instancia_etapas FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'controladoria'::modulo, 'visualizar'::acao_permissao));

CREATE POLICY "criar instancia etapas"
  ON public.fluxo_instancia_etapas FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'controladoria'::modulo, 'criar'::acao_permissao));

CREATE POLICY "editar instancia etapas"
  ON public.fluxo_instancia_etapas FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'controladoria'::modulo, 'editar'::acao_permissao));

CREATE POLICY "excluir instancia etapas"
  ON public.fluxo_instancia_etapas FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'controladoria'::modulo, 'excluir'::acao_permissao));

-- 5. Função utilitária: adicionar dias corridos
CREATE OR REPLACE FUNCTION public.adicionar_dias_corridos(_data_inicio DATE, _dias INTEGER)
RETURNS DATE
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT (_data_inicio + (_dias || ' days')::interval)::date $$;

-- 6. Função para instanciar um fluxo
CREATE OR REPLACE FUNCTION public.instanciar_fluxo(
  _template_id UUID,
  _data_gatilho DATE DEFAULT CURRENT_DATE,
  _processo_id UUID DEFAULT NULL,
  _cliente_id UUID DEFAULT NULL,
  _responsavel_id UUID DEFAULT NULL,
  _observacoes TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_instancia_id UUID;
  v_user_id UUID := auth.uid();
  v_etapa RECORD;
  v_data_venc DATE;
  v_resp UUID;
  v_cliente_nome TEXT;
  v_processo_numero TEXT;
  v_texto TEXT;
  v_item_id UUID;
  v_tipo_item public.tipo_item_controladoria;
  v_prio public.prioridade;
BEGIN
  IF NOT public.has_permission(v_user_id, 'controladoria'::modulo, 'criar'::acao_permissao) THEN
    RAISE EXCEPTION 'Sem permissão para disparar fluxos';
  END IF;

  -- Buscar dados auxiliares
  IF _cliente_id IS NOT NULL THEN
    SELECT nome INTO v_cliente_nome FROM public.clientes WHERE id = _cliente_id;
  ELSIF _processo_id IS NOT NULL THEN
    SELECT c.nome, p.numero_cnj INTO v_cliente_nome, v_processo_numero
    FROM public.processos p
    JOIN public.clientes c ON c.id = p.cliente_id
    WHERE p.id = _processo_id;
  END IF;

  IF _processo_id IS NOT NULL AND v_processo_numero IS NULL THEN
    SELECT numero_cnj INTO v_processo_numero FROM public.processos WHERE id = _processo_id;
  END IF;

  -- Criar instância
  INSERT INTO public.fluxo_instancias (template_id, processo_id, cliente_id, data_gatilho, responsavel_id, observacoes, criado_por)
  VALUES (_template_id, _processo_id, _cliente_id, _data_gatilho, _responsavel_id, _observacoes, v_user_id)
  RETURNING id INTO v_instancia_id;

  -- Iterar etapas do template
  FOR v_etapa IN
    SELECT * FROM public.fluxo_etapas_template
    WHERE template_id = _template_id
    ORDER BY ordem ASC
  LOOP
    -- Calcular vencimento
    IF v_etapa.prazo_tipo = 'uteis' THEN
      v_data_venc := public.adicionar_dias_uteis(_data_gatilho, v_etapa.prazo_dias);
    ELSE
      v_data_venc := public.adicionar_dias_corridos(_data_gatilho, v_etapa.prazo_dias);
    END IF;

    -- Definir responsável
    v_resp := _responsavel_id;
    IF v_etapa.responsavel_padrao = 'advogado_caso' AND _processo_id IS NOT NULL THEN
      SELECT responsavel_id INTO v_resp FROM public.processos WHERE id = _processo_id;
    END IF;

    -- Substituir variáveis no template_texto
    v_texto := v_etapa.template_texto;
    IF v_texto IS NOT NULL THEN
      v_texto := REPLACE(v_texto, '{{nome_cliente}}', COALESCE(v_cliente_nome, ''));
      v_texto := REPLACE(v_texto, '{{processo_numero}}', COALESCE(v_processo_numero, ''));
    END IF;

    -- Mapear tipo para enum da controladoria (apenas se for prazo/tarefa)
    v_item_id := NULL;
    IF v_etapa.tipo IN ('prazo_fatal','prazo_processual','tarefa') THEN
      v_tipo_item := v_etapa.tipo::public.tipo_item_controladoria;
      v_prio := v_etapa.prioridade;

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
        _cliente_id, _processo_id, v_user_id, 'pendente'
      ) RETURNING id INTO v_item_id;
    END IF;

    -- Criar etapa da instância
    INSERT INTO public.fluxo_instancia_etapas (
      instancia_id, etapa_template_id, item_controladoria_id, ordem, titulo, descricao,
      tipo, data_vencimento, responsavel_id, checklist_itens, template_texto,
      texto_preenchido, obrigatorio
    ) VALUES (
      v_instancia_id, v_etapa.id, v_item_id, v_etapa.ordem, v_etapa.titulo, v_etapa.descricao,
      v_etapa.tipo, v_data_venc, v_resp,
      -- Checklist convertido em [{item, concluido:false}]
      COALESCE((SELECT jsonb_agg(jsonb_build_object('item', val, 'concluido', false))
                FROM jsonb_array_elements_text(v_etapa.checklist_itens) val), '[]'::jsonb),
      v_etapa.template_texto, v_texto, v_etapa.obrigatorio
    );
  END LOOP;

  RETURN v_instancia_id;
END;
$$;

-- 7. Seed: tipos de prazo legais
INSERT INTO public.tipos_prazo (nome, dias, dias_uteis, descricao) VALUES
  ('Apelação', 15, true, 'CPC art. 1003'),
  ('Embargos de Declaração', 5, true, 'CPC art. 1023'),
  ('Contrarrazões de Apelação', 15, true, 'CPC art. 1010'),
  ('Contestação', 15, true, 'CPC art. 335'),
  ('Recurso Ordinário TRF', 15, true, 'CPC art. 1028'),
  ('Recurso Especial', 15, true, 'CPC art. 1029'),
  ('Mandado de Segurança', 120, false, 'Lei 12.016/2009 art. 23'),
  ('Recurso Administrativo INSS', 30, false, 'Dec. 3.048/99 art. 304'),
  ('Ação Judicial BPC/LOAS negado', 15, true, 'Regra geral')
ON CONFLICT DO NOTHING;

-- 8. Seed: 3 templates iniciais
DO $$
DECLARE
  v_t1 UUID;
  v_t2 UUID;
  v_t3 UUID;
BEGIN
  -- Template 1: BPC negado
  INSERT INTO public.fluxos_templates (nome, descricao, gatilho, area, etapas)
  VALUES ('BPC/LOAS negado — ação judicial', 'Fluxo completo para ajuizamento de ação após indeferimento de BPC.', 'bpc_negado', 'previdenciario', '[]'::jsonb)
  RETURNING id INTO v_t1;

  INSERT INTO public.fluxo_etapas_template (template_id, ordem, titulo, tipo, prazo_dias, prazo_tipo, responsavel_padrao, descricao, checklist_itens, prioridade) VALUES
    (v_t1, 1, 'Registrar data da ciência da negativa', 'prazo_fatal', 0, 'corridos', 'advogado_caso', 'Campo obrigatório. Todos os outros prazos são calculados a partir desta data.', '[]', 'urgente'),
    (v_t1, 2, 'Definir tese e tipo de ação', 'tarefa', 5, 'uteis', 'advogado_caso', 'Ação ordinária ou mandado de segurança.',
      '["Verificar se cabível Tema 312 STF","Verificar se cabível Tema 640 STJ","Confirmar renda per capita efetiva","Definir tipo de ação (ordinária ou MS)"]', 'alta'),
    (v_t1, 3, 'Coletar documentos do cliente', 'tarefa', 7, 'uteis', 'estagiario', 'Reunir documentação necessária para a inicial.',
      '["RG e CPF","Comprovante de residência atualizado","Comprovante de renda","Laudo médico atualizado com CID","Extrato do Bolsa Família","Carta de indeferimento do INSS","Procuração atualizada"]', 'alta'),
    (v_t1, 4, 'Elaborar petição inicial', 'tarefa', 12, 'uteis', 'advogado_caso', 'Preencher template com NB, DER, valor da causa e teses.', '[]', 'alta'),
    (v_t1, 5, 'Revisar e assinar petição', 'prazo_fatal', 14, 'uteis', 'advogado_caso', 'Revisão obrigatória antes do protocolo.', '[]', 'urgente'),
    (v_t1, 6, 'Protocolar petição inicial', 'prazo_fatal', 15, 'uteis', 'advogado_caso', 'Prazo fatal. Após protocolo, registrar número do processo.', '[]', 'urgente'),
    (v_t1, 7, 'Monitorar andamentos', 'tarefa', 30, 'corridos', 'estagiario', 'Verificar movimentação processual a cada 15 dias.', '[]', 'media');

  -- Template 2: BPC deferido
  INSERT INTO public.fluxos_templates (nome, descricao, gatilho, area, etapas)
  VALUES ('BPC deferido — pós-concessão', 'Pós-concessão: comunicação, cálculo de honorários e orientações.', 'bpc_deferido', 'previdenciario', '[]'::jsonb)
  RETURNING id INTO v_t2;

  INSERT INTO public.fluxo_etapas_template (template_id, ordem, titulo, tipo, prazo_dias, prazo_tipo, responsavel_padrao, descricao, template_texto, checklist_itens, prioridade) VALUES
    (v_t2, 1, 'Comunicar cliente sobre concessão', 'tarefa', 1, 'corridos', 'advogado_caso', 'Enviar mensagem ao cliente comunicando o deferimento.',
      'Olá, {{nome_cliente}}! Temos uma ótima notícia: seu BPC/LOAS foi concedido pelo INSS. Em breve entraremos em contato com mais detalhes.', '[]', 'alta'),
    (v_t2, 2, 'Verificar DIB, competência e valores', 'tarefa', 3, 'uteis', 'advogado_caso', 'Conferir os dados do benefício concedido.', NULL,
      '["Confirmar DIB","Verificar competências em atraso","Calcular valor dos atrasados","Conferir DER respeitada"]', 'alta'),
    (v_t2, 3, 'Calcular e registrar honorários', 'tarefa', 5, 'uteis', 'advogado_caso', 'Gerar cálculo conforme contrato e registrar no financeiro.', NULL, '[]', 'alta'),
    (v_t2, 4, 'Orientar cliente sobre manutenção', 'tarefa', 10, 'uteis', 'advogado_caso', 'Reforçar regras de manutenção do benefício.', NULL,
      '["Não acumular renda acima de 1/4 do SM per capita","Comunicar mudanças ao INSS","Revisão bienal obrigatória","Não acumular com outro benefício previdenciário"]', 'media'),
    (v_t2, 5, 'Agendar lembrete de revisão bienal', 'tarefa', 720, 'corridos', 'gestor', 'Tarefa futura: contatar cliente 30 dias antes da revisão bienal.', NULL, '[]', 'baixa');

  -- Template 3: Auxílio negado
  INSERT INTO public.fluxos_templates (nome, descricao, gatilho, area, etapas)
  VALUES ('Auxílio por incapacidade negado', 'Análise da negativa e estratégia (recurso CRPS, MS ou ação judicial).', 'auxilio_negado', 'previdenciario', '[]'::jsonb)
  RETURNING id INTO v_t3;

  INSERT INTO public.fluxo_etapas_template (template_id, ordem, titulo, tipo, prazo_dias, prazo_tipo, responsavel_padrao, descricao, checklist_itens, prioridade) VALUES
    (v_t3, 1, 'Registrar data da ciência', 'prazo_fatal', 0, 'corridos', 'advogado_caso', 'Data de referência. Prazo: 30 dias para CRPS ou 120 dias para MS.', '[]', 'urgente'),
    (v_t3, 2, 'Analisar motivação da negativa', 'tarefa', 3, 'uteis', 'advogado_caso', 'Identificar o motivo do indeferimento.',
      '["Alta programada indevida","DCB antecipada","DII sem nexo","Incapacidade não reconhecida","Carência não comprovada","Qualidade de segurado não reconhecida"]', 'alta'),
    (v_t3, 3, 'Definir estratégia (CRPS, MS ou ação)', 'tarefa', 5, 'uteis', 'advogado_caso', 'Decidir entre recurso administrativo, mandado de segurança ou ação judicial.', '[]', 'alta'),
    (v_t3, 4, 'Coletar documentos médicos atualizados', 'tarefa', 10, 'uteis', 'estagiario', 'Reunir laudos e exames recentes.',
      '["Laudo médico atualizado","Exames complementares","Receitas médicas","Atestados anteriores","Carta de indeferimento"]', 'alta'),
    (v_t3, 5, 'Protocolar peça definida', 'prazo_fatal', 25, 'corridos', 'advogado_caso', 'Protocolo dentro do prazo legal apurado.', '[]', 'urgente');
END $$;