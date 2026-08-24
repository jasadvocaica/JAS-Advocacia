
-- 1) Coluna de advogado responsável no contrato
ALTER TABLE public.honorarios_contratos
  ADD COLUMN IF NOT EXISTS advogado_responsavel_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contratos_advogado_responsavel
  ON public.honorarios_contratos(advogado_responsavel_id);

-- 2) Função: pode ver financeiro do contrato?
--   - gestor: sempre
--   - controladoria / administrativo: sempre (papéis financeiros)
--   - demais (advogado/estagiário): só se for o advogado_responsavel_id do contrato
CREATE OR REPLACE FUNCTION public.usuario_ve_contrato_financeiro(_user_id uuid, _contrato_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'gestor'::app_role)
    OR public.has_role(_user_id, 'controladoria'::app_role)
    OR public.has_role(_user_id, 'administrativo'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.honorarios_contratos c
      WHERE c.id = _contrato_id
        AND c.advogado_responsavel_id = _user_id
    );
$$;

-- 3) Política de SELECT em contratos
DROP POLICY IF EXISTS "ver contratos" ON public.honorarios_contratos;
CREATE POLICY "ver contratos"
ON public.honorarios_contratos
FOR SELECT
USING (
  public.has_permission(auth.uid(), 'financeiro'::modulo, 'visualizar'::acao_permissao)
  AND (
    public.has_role(auth.uid(), 'gestor'::app_role)
    OR public.has_role(auth.uid(), 'controladoria'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
    OR advogado_responsavel_id = auth.uid()
  )
);

-- 4) Política de SELECT em parcelas (depende do contrato)
DROP POLICY IF EXISTS "ver parcelas" ON public.honorarios_parcelas;
CREATE POLICY "ver parcelas"
ON public.honorarios_parcelas
FOR SELECT
USING (
  public.has_permission(auth.uid(), 'financeiro'::modulo, 'visualizar'::acao_permissao)
  AND public.usuario_ve_contrato_financeiro(auth.uid(), contrato_id)
);

-- 5) Política de SELECT em pagamentos
DROP POLICY IF EXISTS "ver pagamentos" ON public.honorarios_pagamentos;
CREATE POLICY "ver pagamentos"
ON public.honorarios_pagamentos
FOR SELECT
USING (
  public.has_permission(auth.uid(), 'financeiro'::modulo, 'visualizar'::acao_permissao)
  AND public.usuario_ve_contrato_financeiro(auth.uid(), contrato_id)
);

-- 6) Política de SELECT em repasses (mantém visão do parceiro pelo portal)
DROP POLICY IF EXISTS "ver repasses" ON public.honorarios_repasses;
CREATE POLICY "ver repasses"
ON public.honorarios_repasses
FOR SELECT
USING (
  public.has_permission(auth.uid(), 'financeiro'::modulo, 'visualizar'::acao_permissao)
  AND public.usuario_ve_contrato_financeiro(auth.uid(), contrato_id)
);

-- 7) Saídas e suprimentos: só gestor e controladoria (remover advogado/estagiário)
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE tablename = 'financeiro_saidas' AND cmd = 'SELECT'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.financeiro_saidas', p.policyname); END LOOP;

  FOR p IN SELECT policyname FROM pg_policies
           WHERE tablename = 'financeiro_suprimentos' AND cmd = 'SELECT'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.financeiro_suprimentos', p.policyname); END LOOP;
END $$;

CREATE POLICY "ver saidas (gestor/controladoria)"
ON public.financeiro_saidas
FOR SELECT
USING (
  public.has_role(auth.uid(), 'gestor'::app_role)
  OR public.has_role(auth.uid(), 'controladoria'::app_role)
);

CREATE POLICY "ver suprimentos (gestor/controladoria)"
ON public.financeiro_suprimentos
FOR SELECT
USING (
  public.has_role(auth.uid(), 'gestor'::app_role)
  OR public.has_role(auth.uid(), 'controladoria'::app_role)
);
