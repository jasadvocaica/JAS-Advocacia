-- Amplia visibilidade de clientes para o parceiro:
-- 1) clientes vinculados a processos do parceiro via processo_parceiros
-- 2) clientes que o parceiro indicou (parceiro_indicacao)
DROP POLICY IF EXISTS "parceiro ve clientes de seus processos" ON public.clientes;

CREATE POLICY "parceiro ve seus clientes"
ON public.clientes FOR SELECT
TO authenticated
USING (
  parceiro_indicacao IS NOT NULL
  AND parceiro_indicacao = public.parceiro_id_do_usuario(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.processo_parceiros pp
    WHERE pp.cliente_id = clientes.id
      AND pp.parceiro_id = public.parceiro_id_do_usuario(auth.uid())
      AND pp.ativo = true
  )
  OR EXISTS (
    SELECT 1
    FROM public.processos p
    WHERE p.cliente_id = clientes.id
      AND p.parceiro_id = public.parceiro_id_do_usuario(auth.uid())
  )
);
