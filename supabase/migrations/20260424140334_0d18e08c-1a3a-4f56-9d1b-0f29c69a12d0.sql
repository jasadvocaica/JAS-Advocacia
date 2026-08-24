
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Branding é público para leitura"
ON storage.objects FOR SELECT
USING (bucket_id = 'branding');

CREATE POLICY "Apenas gestores podem enviar branding"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'branding' AND public.is_gestor(auth.uid()));

CREATE POLICY "Apenas gestores podem atualizar branding"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'branding' AND public.is_gestor(auth.uid()));

CREATE POLICY "Apenas gestores podem remover branding"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'branding' AND public.is_gestor(auth.uid()));
