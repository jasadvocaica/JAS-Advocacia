ALTER TABLE public.controladoria_itens
  ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'controladoria';

ALTER TABLE public.controladoria_itens
  DROP CONSTRAINT IF EXISTS controladoria_itens_origem_check;

ALTER TABLE public.controladoria_itens
  ADD CONSTRAINT controladoria_itens_origem_check
  CHECK (origem IN ('controladoria','perfil_cliente','perfil_processo','fluxo_automatico','datajud'));

CREATE INDEX IF NOT EXISTS idx_controladoria_itens_cliente_id
  ON public.controladoria_itens(cliente_id);
CREATE INDEX IF NOT EXISTS idx_controladoria_itens_origem
  ON public.controladoria_itens(origem);
