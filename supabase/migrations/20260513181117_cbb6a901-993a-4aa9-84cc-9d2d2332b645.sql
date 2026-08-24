
ALTER TABLE public.processos
  ADD COLUMN IF NOT EXISTS ultima_atualizacao_andamento timestamptz;

-- Estender check de fonte de andamentos para aceitar scrapers diretos
ALTER TABLE public.andamentos DROP CONSTRAINT IF EXISTS andamentos_fonte_check;
ALTER TABLE public.andamentos ADD CONSTRAINT andamentos_fonte_check
  CHECK (fonte = ANY (ARRAY[
    'manual','cnj','datajud','pje_comunica','documentos','sistema',
    'inss_portal','pdpj_pdf','tjmt_direto','pje_direto'
  ]));

CREATE TABLE IF NOT EXISTS public.sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id uuid REFERENCES public.processos(id) ON DELETE CASCADE,
  tribunal text,
  numero_cnj text,
  fonte text NOT NULL DEFAULT 'datajud',
  executado_em timestamptz NOT NULL DEFAULT now(),
  novos_andamentos integer NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('sucesso','erro','sem_novidades','captcha_bloqueado')),
  erro_mensagem text
);

CREATE INDEX IF NOT EXISTS idx_sync_log_processo ON public.sync_log(processo_id, executado_em DESC);
CREATE INDEX IF NOT EXISTS idx_sync_log_fonte_status ON public.sync_log(fonte, status, executado_em DESC);

ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gestor ve sync_log" ON public.sync_log;
CREATE POLICY "gestor ve sync_log" ON public.sync_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'));

DROP POLICY IF EXISTS "responsavel ve sync_log do processo" ON public.sync_log;
CREATE POLICY "responsavel ve sync_log do processo" ON public.sync_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.processos p
      WHERE p.id = sync_log.processo_id AND p.responsavel_id = auth.uid()
    )
  );
