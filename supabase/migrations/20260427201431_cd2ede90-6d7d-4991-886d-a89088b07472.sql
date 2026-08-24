-- 1. Tabela de liberação de processos no portal
CREATE TABLE public.cliente_portal_processos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  processo_id UUID NOT NULL REFERENCES public.processos(id) ON DELETE CASCADE,
  visivel BOOLEAN NOT NULL DEFAULT true,
  mostrar_andamentos BOOLEAN NOT NULL DEFAULT true,
  mostrar_documentos BOOLEAN NOT NULL DEFAULT true,
  liberado_por UUID,
  liberado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, processo_id)
);

CREATE INDEX idx_portal_proc_cliente ON public.cliente_portal_processos(cliente_id);
CREATE INDEX idx_portal_proc_processo ON public.cliente_portal_processos(processo_id);

ALTER TABLE public.cliente_portal_processos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "equipe gerencia portal processos" ON public.cliente_portal_processos
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'processos'::modulo, 'editar'::acao_permissao))
  WITH CHECK (public.has_permission(auth.uid(), 'processos'::modulo, 'editar'::acao_permissao));

CREATE POLICY "equipe ve portal processos" ON public.cliente_portal_processos
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'processos'::modulo, 'visualizar'::acao_permissao));

CREATE POLICY "cliente ve sua liberacao" ON public.cliente_portal_processos
  FOR SELECT TO authenticated
  USING (cliente_id = public.cliente_id_do_usuario(auth.uid()));

CREATE TRIGGER trg_portal_proc_updated BEFORE UPDATE ON public.cliente_portal_processos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Tabela de liberação financeira
CREATE TABLE public.cliente_portal_financeiro (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  contrato_id UUID NOT NULL REFERENCES public.honorarios_contratos(id) ON DELETE CASCADE,
  visivel BOOLEAN NOT NULL DEFAULT true,
  liberado_por UUID,
  liberado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, contrato_id)
);

CREATE INDEX idx_portal_fin_cliente ON public.cliente_portal_financeiro(cliente_id);

ALTER TABLE public.cliente_portal_financeiro ENABLE ROW LEVEL SECURITY;

CREATE POLICY "equipe gerencia portal financeiro" ON public.cliente_portal_financeiro
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'financeiro'::modulo, 'editar'::acao_permissao))
  WITH CHECK (public.has_permission(auth.uid(), 'financeiro'::modulo, 'editar'::acao_permissao));

CREATE POLICY "equipe ve portal financeiro" ON public.cliente_portal_financeiro
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'financeiro'::modulo, 'visualizar'::acao_permissao));

CREATE POLICY "cliente ve sua liberacao fin" ON public.cliente_portal_financeiro
  FOR SELECT TO authenticated
  USING (cliente_id = public.cliente_id_do_usuario(auth.uid()));

CREATE TRIGGER trg_portal_fin_updated BEFORE UPDATE ON public.cliente_portal_financeiro
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Funções auxiliares de visibilidade
CREATE OR REPLACE FUNCTION public.pode_ver_processo_no_portal(_processo_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.processos p
    WHERE p.id = _processo_id
      AND p.cliente_id = public.cliente_id_do_usuario(auth.uid())
      AND COALESCE(
        (SELECT visivel FROM public.cliente_portal_processos cpp
         WHERE cpp.processo_id = _processo_id AND cpp.cliente_id = p.cliente_id LIMIT 1),
        true
      ) = true
  )
$$;

CREATE OR REPLACE FUNCTION public.pode_ver_contrato_no_portal(_contrato_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.honorarios_contratos c
    JOIN public.cliente_usuarios cu ON cu.cliente_id = c.cliente_id
    WHERE c.id = _contrato_id
      AND cu.user_id = auth.uid()
      AND cu.mostrar_financeiro = true
      AND COALESCE(
        (SELECT visivel FROM public.cliente_portal_financeiro cpf
         WHERE cpf.contrato_id = _contrato_id AND cpf.cliente_id = c.cliente_id LIMIT 1),
        true
      ) = true
  )
$$;

-- 4. Políticas para o cliente ver dados liberados
CREATE POLICY "cliente ve andamentos liberados" ON public.andamentos
  FOR SELECT TO authenticated
  USING (public.pode_ver_processo_no_portal(processo_id));

CREATE POLICY "cliente ve contratos liberados" ON public.honorarios_contratos
  FOR SELECT TO authenticated
  USING (public.pode_ver_contrato_no_portal(id));

CREATE POLICY "cliente ve parcelas liberadas" ON public.honorarios_parcelas
  FOR SELECT TO authenticated
  USING (public.pode_ver_contrato_no_portal(contrato_id));

CREATE POLICY "cliente ve pagamentos liberados" ON public.honorarios_pagamentos
  FOR SELECT TO authenticated
  USING (public.pode_ver_contrato_no_portal(contrato_id));

-- 5. Função utilitária: gera "primeironome123#" sem acentos
CREATE OR REPLACE FUNCTION public.gerar_senha_padrao_cliente(_nome TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(
    regexp_replace(
      translate(
        split_part(trim(coalesce(_nome,'')), ' ', 1),
        'áàâãäéèêëíìîïóòôõöúùûüýÿñçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÝŸÑÇ',
        'aaaaaeeeeiiiiooooouuuuyyncAAAAAEEEEIIIIOOOOOUUUUYYNC'
      ),
      '[^a-zA-Z]', '', 'g'
    )
  ) || '123#'
$$;

-- 6. Resolver cliente por CPF (usado pela edge function)
CREATE OR REPLACE FUNCTION public.cliente_id_por_cpf(_cpf TEXT)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.clientes
  WHERE regexp_replace(coalesce(cpf_cnpj,''), '[^0-9]', '', 'g')
      = regexp_replace(coalesce(_cpf,''), '[^0-9]', '', 'g')
    AND ativo = true
  LIMIT 1
$$;