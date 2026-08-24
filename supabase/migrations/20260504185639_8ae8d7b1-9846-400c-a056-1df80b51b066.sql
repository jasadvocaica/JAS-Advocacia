
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS autoriza_parceiro_ver_whatsapp boolean NOT NULL DEFAULT false;

CREATE POLICY "parceiro ve fichas dos seus clientes"
ON public.cliente_atendimentos
FOR SELECT
USING (
  cliente_id IN (
    SELECT c.id FROM public.clientes c
    WHERE c.parceiro_indicacao IS NOT NULL
      AND c.parceiro_indicacao = parceiro_id_do_usuario(auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.processo_parceiros pp
    WHERE pp.cliente_id = cliente_atendimentos.cliente_id
      AND pp.parceiro_id = parceiro_id_do_usuario(auth.uid())
      AND pp.ativo = true
  )
  OR EXISTS (
    SELECT 1 FROM public.processos p
    WHERE p.cliente_id = cliente_atendimentos.cliente_id
      AND p.parceiro_id = parceiro_id_do_usuario(auth.uid())
  )
);
