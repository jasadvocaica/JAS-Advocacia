-- Garante que autores e gestores podem editar e excluir comentários da controladoria
DROP POLICY IF EXISTS "editar proprio comentario" ON public.controladoria_comentarios;
DROP POLICY IF EXISTS "editar comentario controladoria" ON public.controladoria_comentarios;
CREATE POLICY "editar comentario controladoria"
ON public.controladoria_comentarios
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid() OR public.is_gestor(auth.uid())
)
WITH CHECK (
  user_id = auth.uid() OR public.is_gestor(auth.uid())
);

DROP POLICY IF EXISTS "excluir proprio comentario" ON public.controladoria_comentarios;
DROP POLICY IF EXISTS "excluir comentario controladoria" ON public.controladoria_comentarios;
CREATE POLICY "excluir comentario controladoria"
ON public.controladoria_comentarios
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid() OR public.is_gestor(auth.uid())
);
