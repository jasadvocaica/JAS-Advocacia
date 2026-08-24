DROP POLICY IF EXISTS "qualquer um registra evento login" ON public.auth_login_eventos;

CREATE POLICY "registra evento login"
  ON public.auth_login_eventos
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    -- Sem sessão: só pode inserir sem user_id
    (auth.uid() IS NULL AND user_id IS NULL)
    -- Com sessão: user_id deve ser nulo ou igual ao próprio
    OR (auth.uid() IS NOT NULL AND (user_id IS NULL OR user_id = auth.uid()))
  );