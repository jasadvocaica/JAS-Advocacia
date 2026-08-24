CREATE TABLE public.equipe_horas_complementares (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  membro_id UUID NOT NULL REFERENCES public.equipe_membros(id) ON DELETE CASCADE,
  mes INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano INT NOT NULL,
  data DATE NOT NULL,
  descricao TEXT NOT NULL,
  horas NUMERIC(6,2) NOT NULL CHECK (horas > 0),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_hc_membro_periodo ON public.equipe_horas_complementares (membro_id, ano, mes);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipe_horas_complementares TO authenticated;
GRANT ALL ON public.equipe_horas_complementares TO service_role;

ALTER TABLE public.equipe_horas_complementares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gestor_hc_total" ON public.equipe_horas_complementares
  FOR ALL TO authenticated
  USING (is_gestor(auth.uid()))
  WITH CHECK (is_gestor(auth.uid()));

CREATE POLICY "membro_ve_proprias_hc" ON public.equipe_horas_complementares
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.equipe_membros m
    WHERE m.id = equipe_horas_complementares.membro_id
      AND m.user_id = auth.uid()
  ));