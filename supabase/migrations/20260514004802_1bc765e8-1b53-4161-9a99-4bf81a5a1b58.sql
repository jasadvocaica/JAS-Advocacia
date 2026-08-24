
DROP POLICY IF EXISTS "todos_veem_metas_padrao" ON public.equipe_metas_padrao;
CREATE POLICY "autenticados_veem_metas_padrao"
ON public.equipe_metas_padrao FOR SELECT TO authenticated
USING (true);
