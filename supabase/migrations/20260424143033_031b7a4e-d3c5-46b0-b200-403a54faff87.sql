-- Trigger para registrar log de cada importação/exportação no user_log_atividade
CREATE OR REPLACE FUNCTION public.trg_log_ie_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_titulo TEXT;
  v_acao TEXT;
BEGIN
  v_titulo := UPPER(LEFT(NEW.tipo, 1)) || SUBSTRING(NEW.tipo FROM 2)
              || ' · ' || NEW.modulo
              || COALESCE(' (' || NEW.subtipo || ')', '');

  IF TG_OP = 'INSERT' THEN
    v_acao := CASE WHEN NEW.tipo = 'importacao' THEN 'iniciou_importacao' ELSE 'iniciou_exportacao' END;
    INSERT INTO public.user_log_atividade (
      user_id, acao, modulo, registro_id, registro_titulo, dados_depois
    ) VALUES (
      COALESCE(NEW.iniciado_por, auth.uid()),
      v_acao,
      'importacao_exportacao',
      NEW.id,
      v_titulo,
      jsonb_build_object(
        'tipo', NEW.tipo,
        'modulo', NEW.modulo,
        'subtipo', NEW.subtipo,
        'status', NEW.status,
        'arquivo_entrada_nome', NEW.arquivo_entrada_nome,
        'filtros', NEW.filtros,
        'iniciado_em', NEW.iniciado_em
      )
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status IN ('concluido','concluido_parcial','erro') THEN
    v_acao := 'finalizou_' || NEW.tipo || '_' || NEW.status;
    INSERT INTO public.user_log_atividade (
      user_id, acao, modulo, registro_id, registro_titulo, dados_antes, dados_depois
    ) VALUES (
      COALESCE(NEW.iniciado_por, auth.uid()),
      v_acao,
      'importacao_exportacao',
      NEW.id,
      v_titulo,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object(
        'status', NEW.status,
        'total_registros', NEW.total_registros,
        'registros_ok', NEW.registros_ok,
        'registros_erro', NEW.registros_erro,
        'arquivo_saida_nome', NEW.arquivo_saida_nome,
        'concluido_em', NEW.concluido_em,
        'mensagem', NEW.mensagem
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ie_jobs_log_insert ON public.ie_jobs;
CREATE TRIGGER trg_ie_jobs_log_insert
AFTER INSERT ON public.ie_jobs
FOR EACH ROW EXECUTE FUNCTION public.trg_log_ie_job();

DROP TRIGGER IF EXISTS trg_ie_jobs_log_update ON public.ie_jobs;
CREATE TRIGGER trg_ie_jobs_log_update
AFTER UPDATE ON public.ie_jobs
FOR EACH ROW EXECUTE FUNCTION public.trg_log_ie_job();