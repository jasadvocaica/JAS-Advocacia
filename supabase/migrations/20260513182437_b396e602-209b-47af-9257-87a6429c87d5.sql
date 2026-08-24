ALTER TABLE public.sync_log DROP CONSTRAINT sync_log_status_check;
ALTER TABLE public.sync_log ADD CONSTRAINT sync_log_status_check
  CHECK (status = ANY (ARRAY['sucesso','erro','sem_novidades','captcha_bloqueado','fallback_datajud']));