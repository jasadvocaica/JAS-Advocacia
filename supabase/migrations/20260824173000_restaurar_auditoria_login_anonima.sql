-- Permite que a tela pública de login registre tentativas sem expor o histórico.
-- A política RLS "registra evento login" restringe o papel anon a linhas com user_id nulo.
GRANT INSERT ON TABLE public.auth_login_eventos TO anon;

-- Mantém explicitamente vedadas as demais operações públicas.
REVOKE SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.auth_login_eventos
FROM anon;
