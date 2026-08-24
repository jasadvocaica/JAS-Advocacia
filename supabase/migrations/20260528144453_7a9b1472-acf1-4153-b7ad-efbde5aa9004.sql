-- 1. Campos de workflow no item
ALTER TABLE public.controladoria_itens
  ADD COLUMN IF NOT EXISTS etapa_workflow text NOT NULL DEFAULT 'criacao',
  ADD COLUMN IF NOT EXISTS executor_id uuid,
  ADD COLUMN IF NOT EXISTS corretor_id uuid,
  ADD COLUMN IF NOT EXISTS revisor_id uuid,
  ADD COLUMN IF NOT EXISTS protocolador_id uuid,
  ADD COLUMN IF NOT EXISTS etapa_atualizada_em timestamptz NOT NULL DEFAULT now();

-- Constraint de valores válidos
DO $$ BEGIN
  ALTER TABLE public.controladoria_itens
    ADD CONSTRAINT controladoria_itens_etapa_workflow_check
    CHECK (etapa_workflow IN ('criacao','execucao','correcao','revisao','protocolo','finalizado'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_ctr_itens_etapa_workflow ON public.controladoria_itens(etapa_workflow);

-- 2. Histórico
CREATE TABLE IF NOT EXISTS public.controladoria_etapas_historico (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES public.controladoria_itens(id) ON DELETE CASCADE,
  etapa text NOT NULL,
  responsavel_id uuid,
  iniciada_em timestamptz NOT NULL DEFAULT now(),
  finalizada_em timestamptz,
  observacao text,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.controladoria_etapas_historico TO authenticated;
GRANT ALL ON public.controladoria_etapas_historico TO service_role;

ALTER TABLE public.controladoria_etapas_historico ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "ver historico etapas" ON public.controladoria_etapas_historico
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "criar historico etapas" ON public.controladoria_etapas_historico
    FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "atualizar historico etapas" ON public.controladoria_etapas_historico
    FOR UPDATE TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_ctr_hist_item ON public.controladoria_etapas_historico(item_id, iniciada_em DESC);