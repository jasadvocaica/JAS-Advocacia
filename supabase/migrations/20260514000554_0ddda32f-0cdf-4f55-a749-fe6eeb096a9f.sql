-- Colunas para fluxo de revisão + controle de alerta de atraso
ALTER TABLE public.controladoria_itens
  ADD COLUMN IF NOT EXISTS anotacoes_revisao text,
  ADD COLUMN IF NOT EXISTS comentario_revisao text,
  ADD COLUMN IF NOT EXISTS alerta_atraso_enviado boolean NOT NULL DEFAULT false;

-- Reset do flag de alerta quando data_vencimento muda
CREATE OR REPLACE FUNCTION public.trg_reset_alerta_atraso()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.data_vencimento IS DISTINCT FROM OLD.data_vencimento THEN
    NEW.alerta_atraso_enviado := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reset_alerta_atraso_trigger ON public.controladoria_itens;
CREATE TRIGGER reset_alerta_atraso_trigger
BEFORE UPDATE ON public.controladoria_itens
FOR EACH ROW
EXECUTE FUNCTION public.trg_reset_alerta_atraso();