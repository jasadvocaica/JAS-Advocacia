DROP POLICY IF EXISTS "pje_monit_update" ON public.pje_monitoramentos;
CREATE POLICY "pje_monit_update"
ON public.pje_monitoramentos
FOR UPDATE
TO authenticated
USING (
  public.is_gestor(auth.uid())
  OR (criado_por = auth.uid()
      AND public.has_permission(auth.uid(), 'processos'::modulo, 'editar'::acao_permissao))
)
WITH CHECK (
  public.is_gestor(auth.uid())
  OR (criado_por = auth.uid()
      AND public.has_permission(auth.uid(), 'processos'::modulo, 'editar'::acao_permissao))
);