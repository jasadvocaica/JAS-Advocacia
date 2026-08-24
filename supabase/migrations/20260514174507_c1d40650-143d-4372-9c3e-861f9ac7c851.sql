DROP POLICY IF EXISTS "usuario ve proprio role e gestor ve todos" ON public.user_roles;

CREATE POLICY "ver roles equipe interna"
ON public.user_roles FOR SELECT
USING (
  user_id = auth.uid()
  OR public.is_gestor(auth.uid())
  OR public.is_interno_ativo(auth.uid())
);