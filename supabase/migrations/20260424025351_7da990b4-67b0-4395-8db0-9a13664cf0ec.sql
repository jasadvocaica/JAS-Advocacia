DROP POLICY IF EXISTS "sistema insere log parceiro" ON public.parceiro_log_acesso;

CREATE POLICY "sistema insere log parceiro"
  ON public.parceiro_log_acesso FOR INSERT TO authenticated
  WITH CHECK (public.is_authenticated_active());