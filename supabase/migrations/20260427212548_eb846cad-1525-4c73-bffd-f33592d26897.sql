CREATE TABLE public.cliente_portal_andamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  andamento_id UUID NOT NULL REFERENCES public.andamentos(id) ON DELETE CASCADE,
  visivel BOOLEAN NOT NULL DEFAULT true,
  observacao_cliente TEXT,
  liberado_por UUID,
  liberado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, andamento_id)
);

CREATE INDEX idx_portal_and_cliente ON public.cliente_portal_andamentos(cliente_id);
CREATE INDEX idx_portal_and_andamento ON public.cliente_portal_andamentos(andamento_id);

ALTER TABLE public.cliente_portal_andamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "equipe gerencia portal andamentos" ON public.cliente_portal_andamentos
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'clientes'::modulo, 'editar'::acao_permissao))
  WITH CHECK (public.has_permission(auth.uid(), 'clientes'::modulo, 'editar'::acao_permissao));

CREATE POLICY "equipe ve portal andamentos" ON public.cliente_portal_andamentos
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'clientes'::modulo, 'visualizar'::acao_permissao));

CREATE POLICY "cliente ve sua liberacao andamento" ON public.cliente_portal_andamentos
  FOR SELECT TO authenticated
  USING (cliente_id = public.cliente_id_do_usuario(auth.uid()));

CREATE TRIGGER trg_portal_and_updated BEFORE UPDATE ON public.cliente_portal_andamentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.pode_ver_andamento_no_portal(_andamento_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.cliente_portal_andamentos cpa
    JOIN public.andamentos a ON a.id = cpa.andamento_id
    JOIN public.processos p ON p.id = a.processo_id
    WHERE cpa.andamento_id = _andamento_id
      AND cpa.visivel = true
      AND cpa.cliente_id = public.cliente_id_do_usuario(auth.uid())
      AND p.cliente_id = cpa.cliente_id
  )
$$;