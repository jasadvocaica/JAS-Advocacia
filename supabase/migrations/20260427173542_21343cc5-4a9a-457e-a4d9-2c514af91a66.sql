-- Tabela cliente_atendimentos: registra resumos/atendimentos enviados ao cadastro do cliente
CREATE TABLE public.cliente_atendimentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  origem TEXT NOT NULL DEFAULT 'sistema', -- 'sistema' | 'manual'
  ferramenta TEXT, -- 'analisador_caso' | 'analise_publicacoes_ia' | 'publicacoes_pje' | etc
  titulo TEXT NOT NULL,
  resumo TEXT NOT NULL,
  link TEXT, -- link interno opcional para abrir o registro original
  processo_id UUID REFERENCES public.processos(id) ON DELETE SET NULL,
  metadados JSONB DEFAULT '{}'::jsonb,
  criado_por UUID,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cli_atend_cliente ON public.cliente_atendimentos(cliente_id, criado_em DESC);
CREATE INDEX idx_cli_atend_processo ON public.cliente_atendimentos(processo_id);

ALTER TABLE public.cliente_atendimentos ENABLE ROW LEVEL SECURITY;

-- Quem pode ver clientes pode ver atendimentos
CREATE POLICY "atendimentos_select" ON public.cliente_atendimentos
FOR SELECT TO authenticated
USING (public.is_authenticated_active() AND public.has_permission(auth.uid(), 'clientes'::public.modulo, 'visualizar'::public.acao_permissao));

CREATE POLICY "atendimentos_insert" ON public.cliente_atendimentos
FOR INSERT TO authenticated
WITH CHECK (public.is_authenticated_active() AND public.has_permission(auth.uid(), 'clientes'::public.modulo, 'criar'::public.acao_permissao));

CREATE POLICY "atendimentos_update" ON public.cliente_atendimentos
FOR UPDATE TO authenticated
USING (public.is_authenticated_active() AND public.has_permission(auth.uid(), 'clientes'::public.modulo, 'editar'::public.acao_permissao));

CREATE POLICY "atendimentos_delete" ON public.cliente_atendimentos
FOR DELETE TO authenticated
USING (public.is_authenticated_active() AND public.has_permission(auth.uid(), 'clientes'::public.modulo, 'excluir'::public.acao_permissao));

-- updated_at trigger
CREATE TRIGGER trg_cli_atend_updated
BEFORE UPDATE ON public.cliente_atendimentos
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- audit log
CREATE TRIGGER trg_cli_atend_audit
AFTER INSERT OR UPDATE OR DELETE ON public.cliente_atendimentos
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log('clientes', 'titulo');