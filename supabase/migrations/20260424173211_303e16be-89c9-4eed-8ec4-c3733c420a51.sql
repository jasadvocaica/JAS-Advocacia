-- Tabela de auditoria de eventos de autenticação/login
CREATE TABLE IF NOT EXISTS public.auth_login_eventos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NULL,
  email TEXT NULL,
  evento TEXT NOT NULL CHECK (evento IN ('login_sucesso','login_falha','redirect_portal','sem_vinculo','escolha_manual','logout')),
  portal TEXT NULL CHECK (portal IS NULL OR portal IN ('interno','parceiro','cliente','auto')),
  rota_destino TEXT NULL,
  motivo TEXT NULL,
  user_agent TEXT NULL,
  contexto JSONB NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_login_eventos_criado_em ON public.auth_login_eventos (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_auth_login_eventos_user_id ON public.auth_login_eventos (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_login_eventos_evento ON public.auth_login_eventos (evento);
CREATE INDEX IF NOT EXISTS idx_auth_login_eventos_email ON public.auth_login_eventos (lower(email));

ALTER TABLE public.auth_login_eventos ENABLE ROW LEVEL SECURITY;

-- INSERT: qualquer um (anon e authenticated) pode registrar — login pode falhar antes da sessão existir
CREATE POLICY "qualquer um registra evento login"
  ON public.auth_login_eventos
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- SELECT: apenas gestor lê tudo; usuário lê apenas seus próprios eventos
CREATE POLICY "gestor le todos eventos login"
  ON public.auth_login_eventos
  FOR SELECT
  TO authenticated
  USING (is_gestor(auth.uid()));

CREATE POLICY "usuario le proprios eventos login"
  ON public.auth_login_eventos
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Sem UPDATE/DELETE: registros são imutáveis (auditoria)