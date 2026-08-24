-- 1. Funções de vínculo
CREATE OR REPLACE FUNCTION public.usuario_ve_processo(_user_id uuid, _processo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_gestor(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.processos p
      WHERE p.id = _processo_id
        AND p.responsavel_id = _user_id
    )
$$;

CREATE OR REPLACE FUNCTION public.usuario_ve_cliente(_user_id uuid, _cliente_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_gestor(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.processos p
      WHERE p.cliente_id = _cliente_id
        AND p.responsavel_id = _user_id
    )
$$;

-- 2. CLIENTES
DROP POLICY IF EXISTS "ver clientes" ON public.clientes;
CREATE POLICY "ver clientes"
ON public.clientes FOR SELECT
USING (
  has_permission(auth.uid(), 'clientes'::modulo, 'visualizar'::acao_permissao)
  AND public.usuario_ve_cliente(auth.uid(), id)
);

-- 3. PROCESSOS
DROP POLICY IF EXISTS "ver processos" ON public.processos;
CREATE POLICY "ver processos"
ON public.processos FOR SELECT
USING (
  has_permission(auth.uid(), 'processos'::modulo, 'visualizar'::acao_permissao)
  AND (
    public.is_gestor(auth.uid())
    OR responsavel_id = auth.uid()
  )
);

-- 4. ANDAMENTOS
DROP POLICY IF EXISTS "ver andamentos" ON public.andamentos;
CREATE POLICY "ver andamentos"
ON public.andamentos FOR SELECT
USING (
  has_permission(auth.uid(), 'processos'::modulo, 'visualizar'::acao_permissao)
  AND public.usuario_ve_processo(auth.uid(), processo_id)
);

-- 5. DOCUMENTOS
DROP POLICY IF EXISTS "ver documentos" ON public.documentos;
CREATE POLICY "ver documentos"
ON public.documentos FOR SELECT
USING (
  has_permission(auth.uid(), 'documentos'::modulo, 'visualizar'::acao_permissao)
  AND (
    public.is_gestor(auth.uid())
    OR (processo_id IS NOT NULL AND public.usuario_ve_processo(auth.uid(), processo_id))
    OR (cliente_id IS NOT NULL AND public.usuario_ve_cliente(auth.uid(), cliente_id))
  )
);

-- 6. PEÇAS
DROP POLICY IF EXISTS "ver pecas" ON public.doc_pecas;
CREATE POLICY "ver pecas"
ON public.doc_pecas FOR SELECT
USING (
  has_permission(auth.uid(), 'documentos'::modulo, 'visualizar'::acao_permissao)
  AND public.usuario_ve_cliente(auth.uid(), cliente_id)
);

-- 7. CONTROLADORIA — itens
DROP POLICY IF EXISTS "ver itens controladoria" ON public.controladoria_itens;
CREATE POLICY "ver itens controladoria"
ON public.controladoria_itens FOR SELECT
USING (
  has_permission(auth.uid(), 'controladoria'::modulo, 'visualizar'::acao_permissao)
  AND (
    public.is_gestor(auth.uid())
    OR (processo_id IS NOT NULL AND public.usuario_ve_processo(auth.uid(), processo_id))
    OR (cliente_id IS NOT NULL AND public.usuario_ve_cliente(auth.uid(), cliente_id))
    OR EXISTS (
      SELECT 1 FROM public.controladoria_responsaveis cr
      WHERE cr.item_id = controladoria_itens.id AND cr.user_id = auth.uid()
    )
  )
);

-- 8. CLIENTE_CREDENCIAIS
DROP POLICY IF EXISTS "ver credenciais" ON public.cliente_credenciais;
CREATE POLICY "ver credenciais"
ON public.cliente_credenciais FOR SELECT
USING (
  has_permission(auth.uid(), 'clientes'::modulo, 'visualizar'::acao_permissao)
  AND public.usuario_ve_cliente(auth.uid(), cliente_id)
);

-- 9. CLIENTE_INTERACOES
DROP POLICY IF EXISTS "ver interacoes" ON public.cliente_interacoes;
CREATE POLICY "ver interacoes"
ON public.cliente_interacoes FOR SELECT
USING (
  has_permission(auth.uid(), 'clientes'::modulo, 'visualizar'::acao_permissao)
  AND public.usuario_ve_cliente(auth.uid(), cliente_id)
);

-- 10. CLIENTE_BENEFICIOS_INSS
DROP POLICY IF EXISTS "ver beneficios" ON public.cliente_beneficios_inss;
CREATE POLICY "ver beneficios"
ON public.cliente_beneficios_inss FOR SELECT
USING (
  has_permission(auth.uid(), 'clientes'::modulo, 'visualizar'::acao_permissao)
  AND public.usuario_ve_cliente(auth.uid(), cliente_id)
);

-- 11. FINANCEIRO — contratos
DROP POLICY IF EXISTS "ver contratos" ON public.honorarios_contratos;
CREATE POLICY "ver contratos"
ON public.honorarios_contratos FOR SELECT
USING (
  has_permission(auth.uid(), 'financeiro'::modulo, 'visualizar'::acao_permissao)
  AND (
    public.is_gestor(auth.uid())
    OR (cliente_id IS NOT NULL AND public.usuario_ve_cliente(auth.uid(), cliente_id))
    OR (processo_id IS NOT NULL AND public.usuario_ve_processo(auth.uid(), processo_id))
  )
);

-- 12. FINANCEIRO — parcelas (filtra via contrato)
DROP POLICY IF EXISTS "ver parcelas" ON public.honorarios_parcelas;
CREATE POLICY "ver parcelas"
ON public.honorarios_parcelas FOR SELECT
USING (
  has_permission(auth.uid(), 'financeiro'::modulo, 'visualizar'::acao_permissao)
  AND (
    public.is_gestor(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.honorarios_contratos c
      WHERE c.id = honorarios_parcelas.contrato_id
        AND (
          (c.cliente_id IS NOT NULL AND public.usuario_ve_cliente(auth.uid(), c.cliente_id))
          OR (c.processo_id IS NOT NULL AND public.usuario_ve_processo(auth.uid(), c.processo_id))
        )
    )
  )
);

-- 13. FINANCEIRO — pagamentos
DROP POLICY IF EXISTS "ver pagamentos" ON public.honorarios_pagamentos;
CREATE POLICY "ver pagamentos"
ON public.honorarios_pagamentos FOR SELECT
USING (
  has_permission(auth.uid(), 'financeiro'::modulo, 'visualizar'::acao_permissao)
  AND (
    public.is_gestor(auth.uid())
    OR (cliente_id IS NOT NULL AND public.usuario_ve_cliente(auth.uid(), cliente_id))
    OR EXISTS (
      SELECT 1 FROM public.honorarios_contratos c
      WHERE c.id = honorarios_pagamentos.contrato_id
        AND (
          (c.cliente_id IS NOT NULL AND public.usuario_ve_cliente(auth.uid(), c.cliente_id))
          OR (c.processo_id IS NOT NULL AND public.usuario_ve_processo(auth.uid(), c.processo_id))
        )
    )
  )
);