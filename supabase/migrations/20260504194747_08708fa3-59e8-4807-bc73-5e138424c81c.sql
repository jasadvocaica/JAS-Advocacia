
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DO $$ BEGIN CREATE TYPE public.suprimento_tipo AS ENUM ('produto','equipamento','servico','assinatura','outro'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.suprimento_recorrencia AS ENUM ('unico','mensal','parcelado'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.saida_categoria AS ENUM ('suprimentos','equipamentos','aluguel','servicos','impostos','salarios','marketing','tecnologia','viagem','manutencao','outros'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.saida_status AS ENUM ('pendente','pago','cancelado'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.financeiro_suprimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  tipo public.suprimento_tipo NOT NULL DEFAULT 'produto',
  fornecedor TEXT,
  recorrencia public.suprimento_recorrencia NOT NULL DEFAULT 'unico',
  valor_total NUMERIC(12,2),
  valor_parcela NUMERIC(12,2),
  parcelas_total INTEGER,
  parcelas_pagas INTEGER NOT NULL DEFAULT 0,
  data_inicio DATE,
  data_fim DATE,
  dia_vencimento INTEGER,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

CREATE TABLE IF NOT EXISTS public.financeiro_saidas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao TEXT NOT NULL,
  categoria public.saida_categoria NOT NULL DEFAULT 'outros',
  valor NUMERIC(12,2) NOT NULL,
  data_competencia DATE NOT NULL DEFAULT CURRENT_DATE,
  data_pagamento DATE,
  forma_pagamento TEXT,
  status public.saida_status NOT NULL DEFAULT 'pendente',
  fornecedor TEXT,
  suprimento_id UUID REFERENCES public.financeiro_suprimentos(id) ON DELETE SET NULL,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

CREATE INDEX IF NOT EXISTS idx_saidas_data ON public.financeiro_saidas(data_competencia DESC);
CREATE INDEX IF NOT EXISTS idx_saidas_status ON public.financeiro_saidas(status);
CREATE INDEX IF NOT EXISTS idx_saidas_suprimento ON public.financeiro_saidas(suprimento_id);

ALTER TABLE public.financeiro_suprimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_saidas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Equipe ve suprimentos" ON public.financeiro_suprimentos
FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'gestor'::app_role) OR public.has_role(auth.uid(),'advogado'::app_role) OR
  public.has_role(auth.uid(),'controladoria'::app_role) OR public.has_role(auth.uid(),'estagiario'::app_role)
);
CREATE POLICY "Gestao gerencia suprimentos" ON public.financeiro_suprimentos
FOR ALL TO authenticated USING (
  public.has_role(auth.uid(),'gestor'::app_role) OR public.has_role(auth.uid(),'advogado'::app_role) OR public.has_role(auth.uid(),'controladoria'::app_role)
) WITH CHECK (
  public.has_role(auth.uid(),'gestor'::app_role) OR public.has_role(auth.uid(),'advogado'::app_role) OR public.has_role(auth.uid(),'controladoria'::app_role)
);

CREATE POLICY "Equipe ve saidas" ON public.financeiro_saidas
FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'gestor'::app_role) OR public.has_role(auth.uid(),'advogado'::app_role) OR
  public.has_role(auth.uid(),'controladoria'::app_role) OR public.has_role(auth.uid(),'estagiario'::app_role)
);
CREATE POLICY "Gestao gerencia saidas" ON public.financeiro_saidas
FOR ALL TO authenticated USING (
  public.has_role(auth.uid(),'gestor'::app_role) OR public.has_role(auth.uid(),'advogado'::app_role) OR public.has_role(auth.uid(),'controladoria'::app_role)
) WITH CHECK (
  public.has_role(auth.uid(),'gestor'::app_role) OR public.has_role(auth.uid(),'advogado'::app_role) OR public.has_role(auth.uid(),'controladoria'::app_role)
);

CREATE TRIGGER trg_suprimentos_updated BEFORE UPDATE ON public.financeiro_suprimentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_saidas_updated BEFORE UPDATE ON public.financeiro_saidas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
