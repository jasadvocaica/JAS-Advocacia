CREATE OR REPLACE FUNCTION public.set_checklist_atualizado()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.atualizado_em = now(); RETURN NEW; END; $$;

CREATE TABLE public.checklist_diligencias (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  processo_id uuid NOT NULL REFERENCES public.processos(id) ON DELETE CASCADE,
  ordem integer NOT NULL DEFAULT 0,
  titulo text NOT NULL,
  descricao text,
  categoria text NOT NULL DEFAULT 'diligencia',
  prazo_dias integer,
  prazo_tipo text DEFAULT 'dias_uteis',
  data_sugerida date,
  base_legal text,
  prioridade text NOT NULL DEFAULT 'media',
  status text NOT NULL DEFAULT 'pendente',
  origem text NOT NULL DEFAULT 'ia',
  item_controladoria_id uuid REFERENCES public.controladoria_itens(id) ON DELETE SET NULL,
  observacoes text,
  concluido_em timestamptz,
  concluido_por uuid,
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_diligencia_status CHECK (status IN ('pendente','em_andamento','concluido','dispensado')),
  CONSTRAINT chk_diligencia_prio CHECK (prioridade IN ('urgente','alta','media','baixa')),
  CONSTRAINT chk_diligencia_categoria CHECK (categoria IN ('diligencia','documento','peticao','prazo','audiencia','contato','administrativo','outro'))
);

CREATE INDEX idx_checklist_proc ON public.checklist_diligencias(processo_id, ordem);
CREATE INDEX idx_checklist_status ON public.checklist_diligencias(status);

ALTER TABLE public.checklist_diligencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem checklist" ON public.checklist_diligencias FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados criam checklist" ON public.checklist_diligencias FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Autenticados atualizam checklist" ON public.checklist_diligencias FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Autenticados removem checklist" ON public.checklist_diligencias FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_checklist_updated BEFORE UPDATE ON public.checklist_diligencias
  FOR EACH ROW EXECUTE FUNCTION public.set_checklist_atualizado();