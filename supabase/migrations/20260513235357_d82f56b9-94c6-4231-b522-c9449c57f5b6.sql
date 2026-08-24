
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

INSERT INTO public.configuracoes_sistema (secao, chave, valor, tipo, editavel_por, publica, descricao) VALUES
  ('email', 'remetente_nome', 'LegisFlow — JAS Advocacia', 'texto', 'gestor', false, 'Nome exibido no remetente dos emails'),
  ('email', 'remetente_endereco', 'onboarding@resend.dev', 'texto', 'gestor', false, 'Endereço de email remetente'),
  ('email', 'ativo', 'false', 'booleano', 'gestor', false, 'Se o envio de emails está ativo')
ON CONFLICT (secao, chave) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destinatario text NOT NULL,
  assunto text NOT NULL,
  evento text,
  status text NOT NULL DEFAULT 'enviado',
  resend_id text,
  erro text,
  enviado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_log_enviado_em ON public.email_log (enviado_em DESC);

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gestor ve email_log"
  ON public.email_log FOR SELECT
  TO authenticated
  USING (public.is_gestor(auth.uid()));
