-- Tabela do cofre de credenciais
CREATE TABLE public.cliente_credenciais (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  sistema TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'governo',
  identificador TEXT,
  senha_cifrada TEXT NOT NULL,
  url TEXT,
  observacoes TEXT,
  ultima_atualizacao_senha DATE,
  validade DATE,
  criado_por UUID,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_credenciais_cliente ON public.cliente_credenciais(cliente_id);

ALTER TABLE public.cliente_credenciais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ver credenciais"
  ON public.cliente_credenciais FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'clientes'::modulo, 'visualizar'::acao_permissao));

CREATE POLICY "criar credenciais"
  ON public.cliente_credenciais FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'clientes'::modulo, 'criar'::acao_permissao));

CREATE POLICY "editar credenciais"
  ON public.cliente_credenciais FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'clientes'::modulo, 'editar'::acao_permissao));

CREATE POLICY "excluir credenciais"
  ON public.cliente_credenciais FOR DELETE TO authenticated
  USING (has_permission(auth.uid(), 'clientes'::modulo, 'excluir'::acao_permissao));

CREATE TRIGGER trg_credenciais_updated_at
  BEFORE UPDATE ON public.cliente_credenciais
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Log de acessos (auditoria)
CREATE TABLE public.cliente_credenciais_acesso_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  credencial_id UUID NOT NULL REFERENCES public.cliente_credenciais(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  acao TEXT NOT NULL DEFAULT 'visualizar',
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_credenciais_log_credencial ON public.cliente_credenciais_acesso_log(credencial_id);
CREATE INDEX idx_credenciais_log_user ON public.cliente_credenciais_acesso_log(user_id);

ALTER TABLE public.cliente_credenciais_acesso_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gestor ve logs credenciais"
  ON public.cliente_credenciais_acesso_log FOR SELECT TO authenticated
  USING (is_gestor(auth.uid()));

CREATE POLICY "service insere log"
  ON public.cliente_credenciais_acesso_log FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);