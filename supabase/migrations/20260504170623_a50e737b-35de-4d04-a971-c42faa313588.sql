CREATE OR REPLACE FUNCTION public.trg_validar_processo_atendimento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente uuid;
BEGIN
  IF NEW.processo_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT cliente_id INTO v_cliente FROM public.processos WHERE id = NEW.processo_id;
  IF v_cliente IS NULL THEN
    RAISE EXCEPTION 'Processo % não encontrado', NEW.processo_id;
  END IF;
  IF v_cliente <> NEW.cliente_id THEN
    RAISE EXCEPTION 'O processo selecionado pertence a outro cliente. Vincule um processo do mesmo cliente do atendimento.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cli_atend_valida_processo ON public.cliente_atendimentos;
CREATE TRIGGER trg_cli_atend_valida_processo
BEFORE INSERT OR UPDATE OF cliente_id, processo_id ON public.cliente_atendimentos
FOR EACH ROW EXECUTE FUNCTION public.trg_validar_processo_atendimento();