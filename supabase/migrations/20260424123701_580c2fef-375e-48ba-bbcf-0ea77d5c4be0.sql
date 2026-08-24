
CREATE TABLE IF NOT EXISTS public.ui_error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rota text NOT NULL,
  modulo text,
  mensagem text NOT NULL,
  stack text,
  component_stack text,
  user_agent text,
  viewport text,
  contexto jsonb DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ui_error_logs_criado_em ON public.ui_error_logs(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_ui_error_logs_modulo ON public.ui_error_logs(modulo);
CREATE INDEX IF NOT EXISTS idx_ui_error_logs_user_id ON public.ui_error_logs(user_id);

ALTER TABLE public.ui_error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestores visualizam logs de UI"
  ON public.ui_error_logs FOR SELECT
  TO authenticated
  USING (public.is_gestor(auth.uid()));

CREATE POLICY "Autenticados registram seus próprios erros"
  ON public.ui_error_logs FOR INSERT
  TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());
