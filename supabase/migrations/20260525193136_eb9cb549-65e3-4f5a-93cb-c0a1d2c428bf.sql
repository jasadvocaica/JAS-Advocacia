-- Comentários: permitir criar para quem visualiza controladoria
DROP POLICY IF EXISTS "criar comentarios" ON public.controladoria_comentarios;
CREATE POLICY "criar comentarios"
ON public.controladoria_comentarios
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND has_permission(auth.uid(), 'controladoria'::modulo, 'visualizar'::acao_permissao)
);

-- Storage: permitir upload de anexos para quem visualiza controladoria
DROP POLICY IF EXISTS "enviar anexos chat controladoria" ON storage.objects;
CREATE POLICY "enviar anexos chat controladoria"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-anexos'
  AND has_permission(auth.uid(), 'controladoria'::modulo, 'visualizar'::acao_permissao)
  AND (auth.uid())::text = (storage.foldername(name))[1]
);