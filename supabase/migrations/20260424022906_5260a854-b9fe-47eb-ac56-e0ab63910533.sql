
-- =========================================================================
-- MÓDULO FINANCEIRO COMPLETO (v2 — corrigida)
-- =========================================================================

-- 1) RENOMEAR TABELAS ANTIGAS
ALTER TABLE IF EXISTS public.honorarios RENAME TO honorarios_legado;
ALTER TABLE IF EXISTS public.pagamentos RENAME TO pagamentos_legado;

-- 2) honorarios_contratos
CREATE TABLE public.honorarios_contratos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  processo_id uuid REFERENCES public.processos(id) ON DELETE SET NULL,
  tipo public.tipo_honorario NOT NULL,
  valor_fixo numeric(12,2),
  percentual_exito numeric(5,2),
  base_calculo_exito text CHECK (base_calculo_exito IN ('atrasados','beneficio_mensal','indenizacao','proveito_economico','personalizado')),
  valor_exito_estimado numeric(12,2),
  total_parcelas integer DEFAULT 1,
  dia_vencimento integer CHECK (dia_vencimento BETWEEN 1 AND 28),
  data_inicio_mensalidade date,
  data_fim_mensalidade date,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','quitado','inadimplente','cancelado','suspenso')),
  tem_rateio boolean NOT NULL DEFAULT false,
  parceiro_id uuid REFERENCES public.parceiros(id) ON DELETE SET NULL,
  percentual_parceiro numeric(5,2),
  base_rateio text CHECK (base_rateio IN ('total_recebido','apenas_exito','fixo_por_processo')),
  valor_fixo_parceiro numeric(12,2),
  data_assinatura date,
  observacoes text,
  alta_probabilidade_exito boolean NOT NULL DEFAULT false,
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_contratos_cliente ON public.honorarios_contratos(cliente_id);
CREATE INDEX idx_contratos_processo ON public.honorarios_contratos(processo_id);
CREATE INDEX idx_contratos_status ON public.honorarios_contratos(status);
CREATE INDEX idx_contratos_parceiro ON public.honorarios_contratos(parceiro_id);

-- 3) honorarios_parcelas (sem coluna gerada com CURRENT_DATE)
CREATE TABLE public.honorarios_parcelas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id uuid NOT NULL REFERENCES public.honorarios_contratos(id) ON DELETE CASCADE,
  numero_parcela integer NOT NULL,
  valor numeric(12,2) NOT NULL,
  data_vencimento date NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','pago','atrasado','negociando','cancelado')),
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_parcelas_contrato ON public.honorarios_parcelas(contrato_id);
CREATE INDEX idx_parcelas_vencimento ON public.honorarios_parcelas(data_vencimento);
CREATE INDEX idx_parcelas_status ON public.honorarios_parcelas(status);

-- View com dias_atraso calculado dinamicamente
CREATE OR REPLACE VIEW public.vw_honorarios_parcelas AS
SELECT
  p.*,
  CASE
    WHEN p.status = 'pago' THEN 0
    WHEN p.data_vencimento < CURRENT_DATE THEN (CURRENT_DATE - p.data_vencimento)
    ELSE 0
  END AS dias_atraso
FROM public.honorarios_parcelas p;

-- 4) honorarios_pagamentos
CREATE TABLE public.honorarios_pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id uuid NOT NULL REFERENCES public.honorarios_contratos(id) ON DELETE RESTRICT,
  parcela_id uuid REFERENCES public.honorarios_parcelas(id) ON DELETE SET NULL,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  data_pagamento date NOT NULL,
  valor_recebido numeric(12,2) NOT NULL,
  forma_pagamento text NOT NULL CHECK (forma_pagamento IN ('pix','dinheiro','boleto','cartao_credito','cartao_debito','deposito','ted_doc','outro')),
  comprovante_url text,
  tipo_pagamento text NOT NULL DEFAULT 'regular' CHECK (tipo_pagamento IN ('regular','exito','entrada','acordo')),
  observacao text,
  valor_parceiro numeric(12,2),
  rateio_gerado boolean NOT NULL DEFAULT false,
  registrado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pagamentos_contrato ON public.honorarios_pagamentos(contrato_id);
CREATE INDEX idx_pagamentos_data ON public.honorarios_pagamentos(data_pagamento);
CREATE INDEX idx_pagamentos_cliente ON public.honorarios_pagamentos(cliente_id);

-- 5) honorarios_repasses
CREATE TABLE public.honorarios_repasses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pagamento_id uuid NOT NULL REFERENCES public.honorarios_pagamentos(id) ON DELETE CASCADE,
  contrato_id uuid NOT NULL REFERENCES public.honorarios_contratos(id) ON DELETE CASCADE,
  parceiro_id uuid NOT NULL REFERENCES public.parceiros(id) ON DELETE RESTRICT,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  valor_repasse numeric(12,2) NOT NULL,
  percentual_aplicado numeric(5,2),
  base_calculo text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','enviado','confirmado')),
  data_repasse date,
  forma_repasse text CHECK (forma_repasse IN ('pix','ted_doc','deposito','outro')),
  comprovante_repasse_url text,
  observacao text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_repasses_parceiro ON public.honorarios_repasses(parceiro_id);
CREATE INDEX idx_repasses_status ON public.honorarios_repasses(status);
CREATE INDEX idx_repasses_pagamento ON public.honorarios_repasses(pagamento_id);

-- 6) honorarios_exito
CREATE TABLE public.honorarios_exito (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id uuid NOT NULL REFERENCES public.honorarios_contratos(id) ON DELETE CASCADE,
  processo_id uuid NOT NULL REFERENCES public.processos(id) ON DELETE RESTRICT,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  data_resultado date NOT NULL,
  base_calculo text NOT NULL,
  valor_base numeric(12,2) NOT NULL,
  percentual numeric(5,2) NOT NULL,
  valor_exito numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'a_receber' CHECK (status IN ('a_receber','recebido','negociando','remido')),
  pagamento_id uuid REFERENCES public.honorarios_pagamentos(id) ON DELETE SET NULL,
  observacao text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_exito_contrato ON public.honorarios_exito(contrato_id);
CREATE INDEX idx_exito_processo ON public.honorarios_exito(processo_id);

-- 7) financeiro_configuracoes
CREATE TABLE public.financeiro_configuracoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alerta_d1 boolean NOT NULL DEFAULT true,
  alerta_d5 boolean NOT NULL DEFAULT true,
  alerta_d15 boolean NOT NULL DEFAULT true,
  alerta_d30_tarefa boolean NOT NULL DEFAULT true,
  gerar_mensalidade_dia integer NOT NULL DEFAULT 1 CHECK (gerar_mensalidade_dia BETWEEN 1 AND 28),
  incluir_exito_na_projecao boolean NOT NULL DEFAULT false,
  forma_padrao text NOT NULL DEFAULT 'pix',
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.financeiro_configuracoes DEFAULT VALUES;

-- 8) Triggers de timestamp
CREATE TRIGGER trg_contratos_updated BEFORE UPDATE ON public.honorarios_contratos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_repasses_updated BEFORE UPDATE ON public.honorarios_repasses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- FUNÇÕES DE NEGÓCIO
-- =========================================================================

CREATE OR REPLACE FUNCTION public.gerar_parcelas_contrato(_contrato_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contrato RECORD;
  v_data date;
  v_dia integer;
  v_fim date;
  v_numero integer;
  v_valor_parcela numeric(12,2);
  v_total_centavos bigint;
  v_centavos_parcela bigint;
  v_resto bigint;
  v_count integer := 0;
  v_n integer;
BEGIN
  SELECT * INTO v_contrato FROM public.honorarios_contratos WHERE id = _contrato_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato % não encontrado', _contrato_id;
  END IF;

  IF v_contrato.tipo = 'exito' THEN RETURN 0; END IF;
  IF EXISTS (SELECT 1 FROM public.honorarios_parcelas WHERE contrato_id = _contrato_id) THEN RETURN 0; END IF;

  v_dia := COALESCE(v_contrato.dia_vencimento, EXTRACT(DAY FROM CURRENT_DATE)::int);
  IF v_dia > 28 THEN v_dia := 28; END IF;

  IF v_contrato.tipo = 'mensalidade' THEN
    v_data := COALESCE(v_contrato.data_inicio_mensalidade, CURRENT_DATE);
    v_fim := COALESCE(v_contrato.data_fim_mensalidade, (CURRENT_DATE + INTERVAL '12 months')::date);
    v_numero := 1;

    WHILE v_data <= v_fim LOOP
      INSERT INTO public.honorarios_parcelas (contrato_id, numero_parcela, valor, data_vencimento, status)
      VALUES (
        _contrato_id, v_numero, COALESCE(v_contrato.valor_fixo, 0),
        make_date(EXTRACT(YEAR FROM v_data)::int, EXTRACT(MONTH FROM v_data)::int, v_dia),
        'pendente'
      );
      v_data := (v_data + INTERVAL '1 month')::date;
      v_numero := v_numero + 1;
      v_count := v_count + 1;
    END LOOP;
  ELSE
    v_n := GREATEST(COALESCE(v_contrato.total_parcelas, 1), 1);
    v_total_centavos := (COALESCE(v_contrato.valor_fixo, 0) * 100)::bigint;
    v_centavos_parcela := v_total_centavos / v_n;
    v_resto := v_total_centavos - (v_centavos_parcela * v_n);

    FOR v_numero IN 1..v_n LOOP
      v_valor_parcela := v_centavos_parcela::numeric / 100;
      IF v_numero = v_n THEN
        v_valor_parcela := v_valor_parcela + (v_resto::numeric / 100);
      END IF;

      v_data := (CURRENT_DATE + ((v_numero - 1) || ' months')::interval)::date;
      INSERT INTO public.honorarios_parcelas (contrato_id, numero_parcela, valor, data_vencimento, status)
      VALUES (
        _contrato_id, v_numero, v_valor_parcela,
        make_date(EXTRACT(YEAR FROM v_data)::int, EXTRACT(MONTH FROM v_data)::int, v_dia),
        'pendente'
      );
      v_count := v_count + 1;
    END LOOP;
  END IF;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.processar_pagamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contrato RECORD;
  v_valor_repasse numeric(12,2) := 0;
  v_pendentes integer;
BEGIN
  IF NEW.parcela_id IS NOT NULL THEN
    UPDATE public.honorarios_parcelas SET status = 'pago' WHERE id = NEW.parcela_id;
  END IF;

  SELECT * INTO v_contrato FROM public.honorarios_contratos WHERE id = NEW.contrato_id;

  IF v_contrato.tem_rateio AND v_contrato.parceiro_id IS NOT NULL THEN
    IF v_contrato.base_rateio = 'fixo_por_processo' THEN
      v_valor_repasse := COALESCE(v_contrato.valor_fixo_parceiro, 0);
    ELSIF v_contrato.base_rateio = 'apenas_exito' AND NEW.tipo_pagamento <> 'exito' THEN
      v_valor_repasse := 0;
    ELSE
      v_valor_repasse := NEW.valor_recebido * (COALESCE(v_contrato.percentual_parceiro, 0) / 100);
    END IF;

    IF v_valor_repasse > 0 THEN
      INSERT INTO public.honorarios_repasses (
        pagamento_id, contrato_id, parceiro_id, cliente_id,
        valor_repasse, percentual_aplicado, base_calculo, status
      ) VALUES (
        NEW.id, v_contrato.id, v_contrato.parceiro_id, NEW.cliente_id,
        v_valor_repasse, v_contrato.percentual_parceiro, v_contrato.base_rateio, 'pendente'
      );

      UPDATE public.honorarios_pagamentos
      SET rateio_gerado = true, valor_parceiro = v_valor_repasse
      WHERE id = NEW.id;
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_pendentes FROM public.honorarios_parcelas
   WHERE contrato_id = v_contrato.id AND status IN ('pendente','atrasado','negociando');

  IF v_pendentes = 0 AND v_contrato.tipo IN ('fixo','misto') THEN
    UPDATE public.honorarios_contratos SET status = 'quitado' WHERE id = v_contrato.id;
  END IF;

  IF NEW.tipo_pagamento = 'exito' THEN
    UPDATE public.honorarios_exito
    SET status = 'recebido', pagamento_id = NEW.id
    WHERE contrato_id = NEW.contrato_id AND pagamento_id IS NULL AND status = 'a_receber';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_processar_pagamento
  AFTER INSERT ON public.honorarios_pagamentos
  FOR EACH ROW EXECUTE FUNCTION public.processar_pagamento();

CREATE OR REPLACE FUNCTION public.atualizar_parcelas_atrasadas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  WITH upd AS (
    UPDATE public.honorarios_parcelas
    SET status = 'atrasado'
    WHERE status = 'pendente' AND data_vencimento < CURRENT_DATE
    RETURNING contrato_id
  )
  SELECT COUNT(*) INTO v_count FROM upd;

  UPDATE public.honorarios_contratos c
  SET status = 'inadimplente'
  WHERE status = 'ativo'
    AND EXISTS (SELECT 1 FROM public.honorarios_parcelas p WHERE p.contrato_id = c.id AND p.status = 'atrasado');

  RETURN COALESCE(v_count, 0);
END;
$$;

-- =========================================================================
-- RLS
-- =========================================================================
ALTER TABLE public.honorarios_contratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.honorarios_parcelas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.honorarios_pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.honorarios_repasses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.honorarios_exito ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_configuracoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ver contratos" ON public.honorarios_contratos FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'financeiro'::modulo, 'visualizar'::acao_permissao));
CREATE POLICY "criar contratos" ON public.honorarios_contratos FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'financeiro'::modulo, 'criar'::acao_permissao));
CREATE POLICY "editar contratos" ON public.honorarios_contratos FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'financeiro'::modulo, 'editar'::acao_permissao));
CREATE POLICY "excluir contratos" ON public.honorarios_contratos FOR DELETE TO authenticated
  USING (has_permission(auth.uid(), 'financeiro'::modulo, 'excluir'::acao_permissao));

CREATE POLICY "ver parcelas" ON public.honorarios_parcelas FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'financeiro'::modulo, 'visualizar'::acao_permissao));
CREATE POLICY "criar parcelas" ON public.honorarios_parcelas FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'financeiro'::modulo, 'criar'::acao_permissao));
CREATE POLICY "editar parcelas" ON public.honorarios_parcelas FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'financeiro'::modulo, 'editar'::acao_permissao));
CREATE POLICY "excluir parcelas" ON public.honorarios_parcelas FOR DELETE TO authenticated
  USING (has_permission(auth.uid(), 'financeiro'::modulo, 'excluir'::acao_permissao));

CREATE POLICY "ver pagamentos" ON public.honorarios_pagamentos FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'financeiro'::modulo, 'visualizar'::acao_permissao));
CREATE POLICY "criar pagamentos" ON public.honorarios_pagamentos FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'financeiro'::modulo, 'criar'::acao_permissao));
CREATE POLICY "editar pagamentos" ON public.honorarios_pagamentos FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'financeiro'::modulo, 'editar'::acao_permissao));
CREATE POLICY "excluir pagamentos" ON public.honorarios_pagamentos FOR DELETE TO authenticated
  USING (is_gestor(auth.uid()));

CREATE POLICY "ver repasses" ON public.honorarios_repasses FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'financeiro'::modulo, 'visualizar'::acao_permissao));
CREATE POLICY "criar repasses" ON public.honorarios_repasses FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'financeiro'::modulo, 'criar'::acao_permissao));
CREATE POLICY "editar repasses" ON public.honorarios_repasses FOR UPDATE TO authenticated
  USING (is_gestor(auth.uid()));
CREATE POLICY "excluir repasses" ON public.honorarios_repasses FOR DELETE TO authenticated
  USING (is_gestor(auth.uid()));

CREATE POLICY "ver exito" ON public.honorarios_exito FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'financeiro'::modulo, 'visualizar'::acao_permissao));
CREATE POLICY "criar exito" ON public.honorarios_exito FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'financeiro'::modulo, 'criar'::acao_permissao));
CREATE POLICY "editar exito" ON public.honorarios_exito FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'financeiro'::modulo, 'editar'::acao_permissao));
CREATE POLICY "excluir exito" ON public.honorarios_exito FOR DELETE TO authenticated
  USING (is_gestor(auth.uid()));

CREATE POLICY "ver config financeiro" ON public.financeiro_configuracoes FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'financeiro'::modulo, 'visualizar'::acao_permissao));
CREATE POLICY "gestor edita config financeiro" ON public.financeiro_configuracoes FOR UPDATE TO authenticated
  USING (is_gestor(auth.uid()));

-- =========================================================================
-- MIGRAÇÃO DE DADOS LEGADOS
-- =========================================================================
DO $$
DECLARE
  v_h RECORD;
  v_p RECORD;
  v_parcela_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='honorarios_legado') THEN
    RETURN;
  END IF;

  FOR v_h IN SELECT * FROM public.honorarios_legado LOOP
    INSERT INTO public.honorarios_contratos (
      id, cliente_id, processo_id, tipo, valor_fixo, percentual_exito,
      total_parcelas, dia_vencimento, status,
      tem_rateio, parceiro_id, percentual_parceiro,
      observacoes, criado_em
    )
    VALUES (
      v_h.id, v_h.cliente_id, v_h.processo_id, v_h.tipo,
      COALESCE(v_h.valor_fixo, v_h.valor_mensalidade),
      v_h.percentual_exito,
      COALESCE(v_h.parcelas, 1),
      28,
      CASE
        WHEN v_h.status = 'em_dia' THEN 'ativo'
        WHEN v_h.status IN ('quitado','cancelado') THEN v_h.status
        ELSE 'ativo'
      END,
      v_h.parceiro_id IS NOT NULL,
      v_h.parceiro_id,
      v_h.percentual_parceiro,
      v_h.observacoes,
      v_h.criado_em
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  FOR v_p IN SELECT * FROM public.pagamentos_legado LOOP
    INSERT INTO public.honorarios_parcelas (contrato_id, numero_parcela, valor, data_vencimento, status, criado_em)
    VALUES (
      v_p.honorario_id,
      COALESCE((SELECT MAX(numero_parcela) + 1 FROM public.honorarios_parcelas WHERE contrato_id = v_p.honorario_id), 1),
      v_p.valor,
      COALESCE(v_p.data_vencimento, v_p.data_pagamento, v_p.criado_em::date),
      CASE WHEN v_p.status = 'pago' THEN 'pago' WHEN v_p.status = 'cancelado' THEN 'cancelado' ELSE 'pendente' END,
      v_p.criado_em
    )
    RETURNING id INTO v_parcela_id;

    IF v_p.status = 'pago' AND v_p.data_pagamento IS NOT NULL THEN
      INSERT INTO public.honorarios_pagamentos (
        contrato_id, parcela_id, cliente_id, data_pagamento, valor_recebido,
        forma_pagamento, comprovante_url, tipo_pagamento, observacao, criado_em
      )
      SELECT
        v_p.honorario_id, v_parcela_id, c.cliente_id,
        v_p.data_pagamento, v_p.valor,
        COALESCE(v_p.forma_pagamento, 'outro'),
        v_p.comprovante_url, 'regular', v_p.observacoes, v_p.criado_em
      FROM public.honorarios_contratos c WHERE c.id = v_p.honorario_id;
    END IF;
  END LOOP;
END $$;
