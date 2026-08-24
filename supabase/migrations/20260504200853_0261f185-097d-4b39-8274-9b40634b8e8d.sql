DROP POLICY IF EXISTS "excluir pagamentos" ON public.honorarios_pagamentos;

CREATE POLICY "excluir pagamentos" 
ON public.honorarios_pagamentos 
FOR DELETE 
TO authenticated
USING (public.has_permission(auth.uid(), 'financeiro'::public.modulo, 'excluir'::public.acao_permissao));

CREATE OR REPLACE FUNCTION public.reabrir_parcela_ao_excluir_pagamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.parcela_id IS NOT NULL THEN
    UPDATE public.honorarios_parcelas
    SET status = 'pendente', data_pagamento = NULL
    WHERE id = OLD.parcela_id;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_reabrir_parcela_ao_excluir_pagamento ON public.honorarios_pagamentos;
CREATE TRIGGER trg_reabrir_parcela_ao_excluir_pagamento
BEFORE DELETE ON public.honorarios_pagamentos
FOR EACH ROW
EXECUTE FUNCTION public.reabrir_parcela_ao_excluir_pagamento();