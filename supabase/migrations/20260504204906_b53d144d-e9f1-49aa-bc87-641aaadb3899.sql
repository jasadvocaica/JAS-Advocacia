CREATE TABLE public.triagem_atendimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_atendimento timestamptz NOT NULL DEFAULT now(),
  atendido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  atendente_nome text,
  contato_nome text,
  contato_telefone text,
  contato_email text,
  canal text NOT NULL DEFAULT 'presencial',
  assunto text NOT NULL,
  descricao text,
  proximo_passo text NOT NULL DEFAULT 'pendente',
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  observacoes text,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT triagem_canal_chk CHECK (canal IN ('presencial','telefone','whatsapp','email','outro')),
  CONSTRAINT triagem_proximo_chk CHECK (proximo_passo IN ('pendente','virar_cliente','agendar','descartar','convertido'))
);

CREATE INDEX idx_triagem_data ON public.triagem_atendimentos (data_atendimento DESC);
CREATE INDEX idx_triagem_proximo ON public.triagem_atendimentos (proximo_passo);
CREATE INDEX idx_triagem_atendido_por ON public.triagem_atendimentos (atendido_por);

ALTER TABLE public.triagem_atendimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "triagem_select" ON public.triagem_atendimentos FOR SELECT TO authenticated
USING (is_authenticated_active() AND has_permission(auth.uid(), 'clientes'::modulo, 'visualizar'::acao_permissao));

CREATE POLICY "triagem_insert" ON public.triagem_atendimentos FOR INSERT TO authenticated
WITH CHECK (is_authenticated_active() AND has_permission(auth.uid(), 'clientes'::modulo, 'criar'::acao_permissao));

CREATE POLICY "triagem_update" ON public.triagem_atendimentos FOR UPDATE TO authenticated
USING (is_authenticated_active() AND has_permission(auth.uid(), 'clientes'::modulo, 'editar'::acao_permissao));

CREATE POLICY "triagem_delete" ON public.triagem_atendimentos FOR DELETE TO authenticated
USING (is_authenticated_active() AND has_permission(auth.uid(), 'clientes'::modulo, 'excluir'::acao_permissao));

CREATE TRIGGER trg_triagem_updated BEFORE UPDATE ON public.triagem_atendimentos
FOR EACH ROW EXECUTE FUNCTION set_updated_at();