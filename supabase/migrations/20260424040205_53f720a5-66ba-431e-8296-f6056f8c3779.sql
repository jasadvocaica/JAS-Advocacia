
DROP POLICY IF EXISTS "sistema cria notificacoes" ON public.notificacoes;
CREATE POLICY "criar notificacoes"
  ON public.notificacoes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_gestor(auth.uid()));

DROP POLICY IF EXISTS "sistema insere log" ON public.user_log_atividade;
CREATE POLICY "inserir log proprio"
  ON public.user_log_atividade FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
