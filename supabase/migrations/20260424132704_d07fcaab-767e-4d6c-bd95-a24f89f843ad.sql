ALTER TABLE public.ui_error_logs
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'ui',
  ADD COLUMN IF NOT EXISTS status_http integer,
  ADD COLUMN IF NOT EXISTS endpoint text;

CREATE INDEX IF NOT EXISTS idx_ui_error_logs_tipo ON public.ui_error_logs(tipo);
CREATE INDEX IF NOT EXISTS idx_ui_error_logs_status_http ON public.ui_error_logs(status_http) WHERE status_http IS NOT NULL;