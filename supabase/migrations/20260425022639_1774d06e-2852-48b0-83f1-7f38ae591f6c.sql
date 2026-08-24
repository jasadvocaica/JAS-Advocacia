-- ============== CONFIG TRIBUTÁRIA ==============
CREATE TABLE public.financeiro_config_tributaria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  regime TEXT NOT NULL DEFAULT 'simples_nacional',
  anexo TEXT NOT NULL DEFAULT 'IV',
  percentual_marketing_padrao NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  rbt12_manual NUMERIC(14,2),
  observacao TEXT,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_por UUID
);

ALTER TABLE public.financeiro_config_tributaria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestor gerencia config tributária"
  ON public.financeiro_config_tributaria
  FOR ALL
  USING (public.is_gestor(auth.uid()))
  WITH CHECK (public.is_gestor(auth.uid()));

INSERT INTO public.financeiro_config_tributaria (regime, anexo, percentual_marketing_padrao)
VALUES ('simples_nacional', 'IV', 5.00);

-- ============== FECHAMENTO MENSAL ==============
CREATE TABLE public.financeiro_fechamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano INTEGER NOT NULL CHECK (ano BETWEEN 2020 AND 2100),

  -- Receitas
  receita_honorarios_fixo   NUMERIC(14,2) NOT NULL DEFAULT 0,
  receita_honorarios_exito  NUMERIC(14,2) NOT NULL DEFAULT 0,
  receita_consultoria       NUMERIC(14,2) NOT NULL DEFAULT 0,
  receita_outros            NUMERIC(14,2) NOT NULL DEFAULT 0,
  receita_total             NUMERIC(14,2) GENERATED ALWAYS AS (
    COALESCE(receita_honorarios_fixo,0) + COALESCE(receita_honorarios_exito,0)
    + COALESCE(receita_consultoria,0) + COALESCE(receita_outros,0)
  ) STORED,

  -- Repasses parceiros
  repasses_parceiros NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- Simples Nacional
  rbt12              NUMERIC(14,2) NOT NULL DEFAULT 0,
  faixa_simples      INTEGER,
  aliquota_nominal   NUMERIC(6,4),
  aliquota_efetiva   NUMERIC(6,4),
  valor_simples      NUMERIC(14,2) NOT NULL DEFAULT 0,
  detalhamento_tributos JSONB DEFAULT '{}'::jsonb,

  -- Marketing
  percentual_marketing NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  valor_marketing      NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- Pró-labore
  valor_pro_labore NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- Outras despesas
  outras_despesas NUMERIC(14,2) NOT NULL DEFAULT 0,
  detalhe_outras_despesas JSONB DEFAULT '[]'::jsonb,

  -- Resultado
  resultado_liquido NUMERIC(14,2) GENERATED ALWAYS AS (
    COALESCE(receita_honorarios_fixo,0) + COALESCE(receita_honorarios_exito,0)
    + COALESCE(receita_consultoria,0) + COALESCE(receita_outros,0)
    - COALESCE(repasses_parceiros,0)
    - COALESCE(valor_simples,0)
    - COALESCE(valor_marketing,0)
    - COALESCE(valor_pro_labore,0)
    - COALESCE(outras_despesas,0)
  ) STORED,

  status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','fechado','revisao')),
  fechado_em TIMESTAMPTZ,
  fechado_por UUID,
  observacoes TEXT,

  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por UUID,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (mes, ano)
);

CREATE INDEX idx_fechamento_periodo ON public.financeiro_fechamento (ano DESC, mes DESC);

ALTER TABLE public.financeiro_fechamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestor gerencia fechamento"
  ON public.financeiro_fechamento
  FOR ALL
  USING (public.is_gestor(auth.uid()))
  WITH CHECK (public.is_gestor(auth.uid()));

CREATE TRIGGER trg_fechamento_set_updated_at
  BEFORE UPDATE ON public.financeiro_fechamento
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============== MARKETING LANÇAMENTOS ==============
CREATE TABLE public.financeiro_marketing_lancamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano INTEGER NOT NULL,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  descricao TEXT NOT NULL,
  fornecedor TEXT,
  categoria TEXT NOT NULL DEFAULT 'outros',
  valor NUMERIC(14,2) NOT NULL CHECK (valor >= 0),
  comprovante_url TEXT,
  observacao TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por UUID
);

CREATE INDEX idx_marketing_periodo ON public.financeiro_marketing_lancamentos (ano DESC, mes DESC);

ALTER TABLE public.financeiro_marketing_lancamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestor gerencia marketing"
  ON public.financeiro_marketing_lancamentos
  FOR ALL
  USING (public.is_gestor(auth.uid()))
  WITH CHECK (public.is_gestor(auth.uid()));

-- ============== PRÓ-LABORE ==============
CREATE TABLE public.financeiro_pro_labore (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  socio_user_id UUID,
  socio_nome TEXT NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano INTEGER NOT NULL,
  valor NUMERIC(14,2) NOT NULL CHECK (valor >= 0),
  data_pagamento DATE,
  pago BOOLEAN NOT NULL DEFAULT false,
  observacao TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por UUID,
  UNIQUE (socio_nome, mes, ano)
);

CREATE INDEX idx_pro_labore_periodo ON public.financeiro_pro_labore (ano DESC, mes DESC);

ALTER TABLE public.financeiro_pro_labore ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestor gerencia pró-labore"
  ON public.financeiro_pro_labore
  FOR ALL
  USING (public.is_gestor(auth.uid()))
  WITH CHECK (public.is_gestor(auth.uid()));

-- ============== FUNÇÃO RBT12 ==============
CREATE OR REPLACE FUNCTION public.calcular_rbt12(_mes INTEGER, _ano INTEGER)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_data_ref DATE := make_date(_ano, _mes, 1);
  v_data_inicio DATE := (v_data_ref - INTERVAL '12 months')::date;
  v_total NUMERIC(14,2) := 0;
BEGIN
  -- Soma últimos 12 meses já fechados (usa receita_total)
  SELECT COALESCE(SUM(receita_total), 0)
  INTO v_total
  FROM public.financeiro_fechamento
  WHERE make_date(ano, mes, 1) >= v_data_inicio
    AND make_date(ano, mes, 1) < v_data_ref;

  RETURN v_total;
END;
$$;