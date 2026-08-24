-- Realtime para comentários
ALTER TABLE public.controladoria_comentarios REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.controladoria_comentarios;

-- Storage policies para bucket chat-anexos
CREATE POLICY "ver anexos chat controladoria"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-anexos'
  AND public.has_permission(auth.uid(), 'controladoria'::public.modulo, 'visualizar'::public.acao_permissao)
);

CREATE POLICY "enviar anexos chat controladoria"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-anexos'
  AND public.has_permission(auth.uid(), 'controladoria'::public.modulo, 'criar'::public.acao_permissao)
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "excluir proprios anexos chat"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'chat-anexos'
  AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_gestor(auth.uid()))
);