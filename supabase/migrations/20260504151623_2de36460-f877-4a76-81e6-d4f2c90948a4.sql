
CREATE OR REPLACE FUNCTION public.trg_ia_analisar_novo_cliente()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://fhbmervgidsixgkjylym.supabase.co/functions/v1/ia-analise-novo-cliente',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZoYm1lcnZnaWRzaXhna2p5bHltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5Njg4NzEsImV4cCI6MjA5MjU0NDg3MX0.tSkxAHgQlvqnw2cUjKR9UFvS8CiLcGc-z7EhatDTOp0',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZoYm1lcnZnaWRzaXhna2p5bHltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5Njg4NzEsImV4cCI6MjA5MjU0NDg3MX0.tSkxAHgQlvqnw2cUjKR9UFvS8CiLcGc-z7EhatDTOp0'
    ),
    body := jsonb_build_object('cliente_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.trg_ia_gerar_peticao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.ia_peticao_pendente IS NULL OR NEW.ia_peticao_pendente = '' THEN RETURN NEW; END IF;
  IF OLD.ia_peticao_pendente IS NOT DISTINCT FROM NEW.ia_peticao_pendente THEN RETURN NEW; END IF;
  PERFORM net.http_post(
    url := 'https://fhbmervgidsixgkjylym.supabase.co/functions/v1/ia-gerar-peticao',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZoYm1lcnZnaWRzaXhna2p5bHltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5Njg4NzEsImV4cCI6MjA5MjU0NDg3MX0.tSkxAHgQlvqnw2cUjKR9UFvS8CiLcGc-z7EhatDTOp0',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZoYm1lcnZnaWRzaXhna2p5bHltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5Njg4NzEsImV4cCI6MjA5MjU0NDg3MX0.tSkxAHgQlvqnw2cUjKR9UFvS8CiLcGc-z7EhatDTOp0'
    ),
    body := jsonb_build_object('processo_id', NEW.id, 'tipo_peticao', NEW.ia_peticao_pendente)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $$;
