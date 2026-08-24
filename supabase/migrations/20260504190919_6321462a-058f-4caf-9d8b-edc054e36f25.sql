
-- Função auxiliar: parceiro do usuário vê o processo (principal OU vinculado)
CREATE OR REPLACE FUNCTION public.parceiro_ve_processo(_user_id uuid, _processo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.processos p
    WHERE p.id = _processo_id
      AND p.parceiro_id IS NOT NULL
      AND p.parceiro_id = public.parceiro_id_do_usuario(_user_id)
  ) OR EXISTS (
    SELECT 1 FROM public.processo_parceiros pp
    WHERE pp.processo_id = _processo_id
      AND pp.parceiro_id = public.parceiro_id_do_usuario(_user_id)
      AND pp.ativo = true
  )
$$;

-- ============ ATENDIMENTOS: restringir só aos vinculados a processos do parceiro ============
DROP POLICY IF EXISTS "parceiro ve fichas dos seus clientes" ON public.cliente_atendimentos;

CREATE POLICY "parceiro ve fichas vinculadas aos seus processos"
ON public.cliente_atendimentos
FOR SELECT
USING (
  processo_id IS NOT NULL
  AND public.parceiro_ve_processo(auth.uid(), processo_id)
);

-- ============ ANDAMENTOS: incluir processo_parceiros ============
DROP POLICY IF EXISTS "parceiro ve andamentos de seus processos" ON public.andamentos;

CREATE POLICY "parceiro ve andamentos de seus processos"
ON public.andamentos
FOR SELECT
USING (public.parceiro_ve_processo(auth.uid(), processo_id));

-- ============ DOCUMENTOS: incluir processo_parceiros ============
DROP POLICY IF EXISTS "parceiro ve docs compartilhados de seus processos" ON public.documentos;

CREATE POLICY "parceiro ve docs compartilhados de seus processos"
ON public.documentos
FOR SELECT
USING (
  compartilhar_com_parceiro = true
  AND processo_id IS NOT NULL
  AND public.parceiro_ve_processo(auth.uid(), processo_id)
);

-- ============ CONTROLADORIA_ITENS: incluir processo_parceiros ============
DROP POLICY IF EXISTS "parceiro ve itens visiveis de seus processos" ON public.controladoria_itens;
DROP POLICY IF EXISTS "parceiro conclui tarefa propria" ON public.controladoria_itens;

CREATE POLICY "parceiro ve itens visiveis de seus processos"
ON public.controladoria_itens
FOR SELECT
USING (
  visivel_parceiro = true
  AND processo_id IS NOT NULL
  AND public.parceiro_ve_processo(auth.uid(), processo_id)
);

CREATE POLICY "parceiro conclui tarefa propria"
ON public.controladoria_itens
FOR UPDATE
USING (
  visivel_parceiro = true
  AND processo_id IS NOT NULL
  AND public.parceiro_ve_processo(auth.uid(), processo_id)
  AND EXISTS (
    SELECT 1 FROM public.controladoria_responsaveis cr
    WHERE cr.item_id = controladoria_itens.id AND cr.user_id = auth.uid()
  )
);

-- ============ FLUXOS: bloquear acesso de parceiros (interno do escritório) ============
DROP POLICY IF EXISTS "todos veem fluxos" ON public.fluxos_templates;

CREATE POLICY "interno ve fluxos"
ON public.fluxos_templates
FOR SELECT
USING (public.has_permission(auth.uid(), 'controladoria'::modulo, 'visualizar'::acao_permissao));

-- ============ GOOGLE CALENDAR mapping: já protegido por has_permission, garantir ============
-- (sem alteração — já exige permissão de controladoria)
