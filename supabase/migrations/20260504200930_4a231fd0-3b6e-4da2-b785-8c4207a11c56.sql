CREATE OR REPLACE FUNCTION public.reabrir_parcela_ao_excluir_pagamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.parcela_id IS NOT NULL THEN
    UPDATE public.honorarios_parcelas
    SET status = 'pendente'
    WHERE id = OLD.parcela_id;
  END IF;

  RETURN OLD;
END;
$$;