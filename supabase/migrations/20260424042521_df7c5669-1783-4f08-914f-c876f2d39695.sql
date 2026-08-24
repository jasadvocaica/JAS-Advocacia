-- Tabela de mapeamento Item Controladoria ↔ Evento Google Calendar
CREATE TABLE IF NOT EXISTS public.controladoria_google_eventos (
  item_id UUID PRIMARY KEY REFERENCES public.controladoria_itens(id) ON DELETE CASCADE,
  google_event_id TEXT NOT NULL,
  google_calendar_id TEXT NOT NULL DEFAULT 'primary',
  ultimo_sync TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_erro TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ctrl_gcal_event ON public.controladoria_google_eventos(google_event_id);

ALTER TABLE public.controladoria_google_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ver mapping gcal"
  ON public.controladoria_google_eventos
  FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'controladoria'::modulo, 'visualizar'::acao_permissao));

CREATE POLICY "service gerencia mapping gcal"
  ON public.controladoria_google_eventos
  FOR ALL TO authenticated
  USING (is_authenticated_active())
  WITH CHECK (is_authenticated_active());

-- Habilita extensão pg_net (pode já estar habilitada)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Função trigger que dispara sync para a edge function
CREATE OR REPLACE FUNCTION public.notificar_sync_google_calendar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_action TEXT;
  v_item_id UUID;
  v_url TEXT := 'https://fhbmervgidsixgkjylym.supabase.co/functions/v1/controladoria-sync-calendar';
  v_anon TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZoYm1lcnZnaWRzaXhna2p5bHltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5Njg4NzEsImV4cCI6MjA5MjU0NDg3MX0.tSkxAHgQlvqnw2cUjKR9UFvS8CiLcGc-z7EhatDTOp0';
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_item_id := OLD.id;
  ELSIF TG_OP = 'INSERT' THEN
    v_action := 'upsert';
    v_item_id := NEW.id;
  ELSE
    -- Em UPDATE só sincroniza se mudou algo relevante
    IF NEW.titulo IS DISTINCT FROM OLD.titulo
       OR NEW.descricao IS DISTINCT FROM OLD.descricao
       OR NEW.tipo IS DISTINCT FROM OLD.tipo
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.prioridade IS DISTINCT FROM OLD.prioridade
       OR NEW.data_vencimento IS DISTINCT FROM OLD.data_vencimento
       OR NEW.local IS DISTINCT FROM OLD.local
       OR NEW.link_virtual IS DISTINCT FROM OLD.link_virtual
       OR NEW.vara IS DISTINCT FROM OLD.vara
       OR NEW.juiz IS DISTINCT FROM OLD.juiz THEN
      v_action := 'upsert';
      v_item_id := NEW.id;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  PERFORM extensions.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon
    ),
    body := jsonb_build_object('action', v_action, 'item_id', v_item_id)
  );

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  -- Não bloqueia operação no DB se webhook falhar
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_gcal_ins ON public.controladoria_itens;
DROP TRIGGER IF EXISTS trg_sync_gcal_upd ON public.controladoria_itens;
DROP TRIGGER IF EXISTS trg_sync_gcal_del ON public.controladoria_itens;

CREATE TRIGGER trg_sync_gcal_ins
  AFTER INSERT ON public.controladoria_itens
  FOR EACH ROW EXECUTE FUNCTION public.notificar_sync_google_calendar();

CREATE TRIGGER trg_sync_gcal_upd
  AFTER UPDATE ON public.controladoria_itens
  FOR EACH ROW EXECUTE FUNCTION public.notificar_sync_google_calendar();

CREATE TRIGGER trg_sync_gcal_del
  AFTER DELETE ON public.controladoria_itens
  FOR EACH ROW EXECUTE FUNCTION public.notificar_sync_google_calendar();