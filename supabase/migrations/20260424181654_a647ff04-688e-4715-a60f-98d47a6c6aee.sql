DROP VIEW IF EXISTS public.gp_banco_horas_saldo;

CREATE VIEW public.gp_banco_horas_saldo
WITH (security_invoker = true) AS
SELECT
  membro_id,
  COALESCE(SUM(horas), 0)::numeric(7,2) AS saldo_total,
  COALESCE(SUM(CASE WHEN horas > 0 THEN horas ELSE 0 END), 0)::numeric(7,2) AS total_creditos,
  COALESCE(SUM(CASE WHEN horas < 0 THEN ABS(horas) ELSE 0 END), 0)::numeric(7,2) AS total_debitos
FROM public.gp_banco_horas
GROUP BY membro_id;