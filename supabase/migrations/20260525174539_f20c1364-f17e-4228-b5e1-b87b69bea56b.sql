
ALTER TYPE public.status_item ADD VALUE IF NOT EXISTS 'aguardando_revisao' BEFORE 'concluido';

ALTER TABLE public.equipe_membros
  ADD COLUMN IF NOT EXISTS pode_concluir_controladoria boolean NOT NULL DEFAULT false;

ALTER TABLE public.controladoria_itens
  ADD COLUMN IF NOT EXISTS tarefa_origem_id uuid REFERENCES public.controladoria_itens(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_controladoria_itens_tarefa_origem ON public.controladoria_itens(tarefa_origem_id);
