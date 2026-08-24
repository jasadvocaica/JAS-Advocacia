
CREATE TYPE public.meta_tipo AS ENUM ('faturamento_mensal','contratos_fechados','atendimentos','casos_por_area','personalizada');
CREATE TYPE public.meta_periodo AS ENUM ('mensal','trimestral','anual');
CREATE TYPE public.meta_status AS ENUM ('ativa','pausada','concluida');

CREATE TABLE public.metas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  tipo public.meta_tipo NOT NULL,
  valor_alvo NUMERIC NOT NULL CHECK (valor_alvo >= 0),
  periodo public.meta_periodo NOT NULL,
  responsavel TEXT NOT NULL,
  status public.meta_status NOT NULL DEFAULT 'ativa',
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  descricao TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.progresso_metas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meta_id UUID NOT NULL REFERENCES public.metas(id) ON DELETE CASCADE,
  valor_lancado NUMERIC NOT NULL,
  observacao TEXT,
  data_lancamento DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_progresso_metas_meta_id ON public.progresso_metas(meta_id);
CREATE INDEX idx_metas_status ON public.metas(status);

ALTER TABLE public.metas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progresso_metas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Equipe interna pode ver metas"
ON public.metas FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'gestor'::app_role)
  OR public.has_role(auth.uid(),'advogado'::app_role)
  OR public.has_role(auth.uid(),'controladoria'::app_role)
  OR public.has_role(auth.uid(),'administrativo'::app_role)
  OR public.has_role(auth.uid(),'estagiario'::app_role)
);

CREATE POLICY "Equipe pode criar metas"
ON public.metas FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(),'gestor'::app_role)
  OR public.has_role(auth.uid(),'advogado'::app_role)
  OR public.has_role(auth.uid(),'controladoria'::app_role)
);

CREATE POLICY "Equipe pode editar metas"
ON public.metas FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(),'gestor'::app_role)
  OR public.has_role(auth.uid(),'advogado'::app_role)
  OR public.has_role(auth.uid(),'controladoria'::app_role)
);

CREATE POLICY "Equipe pode excluir metas"
ON public.metas FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(),'gestor'::app_role)
  OR public.has_role(auth.uid(),'advogado'::app_role)
  OR public.has_role(auth.uid(),'controladoria'::app_role)
);

CREATE POLICY "Equipe interna pode ver progresso"
ON public.progresso_metas FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'gestor'::app_role)
  OR public.has_role(auth.uid(),'advogado'::app_role)
  OR public.has_role(auth.uid(),'controladoria'::app_role)
  OR public.has_role(auth.uid(),'administrativo'::app_role)
  OR public.has_role(auth.uid(),'estagiario'::app_role)
);

CREATE POLICY "Equipe pode lançar progresso"
ON public.progresso_metas FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(),'gestor'::app_role)
  OR public.has_role(auth.uid(),'advogado'::app_role)
  OR public.has_role(auth.uid(),'controladoria'::app_role)
  OR public.has_role(auth.uid(),'administrativo'::app_role)
);

CREATE POLICY "Gestor pode excluir progresso"
ON public.progresso_metas FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(),'gestor'::app_role)
  OR public.has_role(auth.uid(),'controladoria'::app_role)
);

CREATE TRIGGER trg_metas_updated_at
BEFORE UPDATE ON public.metas
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
