
DROP VIEW IF EXISTS public.vw_honorarios_parcelas;
CREATE VIEW public.vw_honorarios_parcelas
WITH (security_invoker = true)
AS
SELECT
  p.*,
  CASE
    WHEN p.status = 'pago' THEN 0
    WHEN p.data_vencimento < CURRENT_DATE THEN (CURRENT_DATE - p.data_vencimento)
    ELSE 0
  END AS dias_atraso
FROM public.honorarios_parcelas p;
