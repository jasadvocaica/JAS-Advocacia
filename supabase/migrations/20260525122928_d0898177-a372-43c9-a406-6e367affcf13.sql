
DROP POLICY IF EXISTS "auth write pt" ON public.processos_tags;
DROP POLICY IF EXISTS "auth delete pt" ON public.processos_tags;

CREATE POLICY "auth write pt"
  ON public.processos_tags
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_authenticated_active()
    AND has_permission(auth.uid(), 'processos'::modulo, 'editar'::acao_permissao)
    AND public.usuario_ve_processo(auth.uid(), processo_id)
  );

CREATE POLICY "auth delete pt"
  ON public.processos_tags
  FOR DELETE
  TO authenticated
  USING (
    is_authenticated_active()
    AND has_permission(auth.uid(), 'processos'::modulo, 'editar'::acao_permissao)
    AND public.usuario_ve_processo(auth.uid(), processo_id)
  );

DROP POLICY IF EXISTS "ver documentos restritos" ON storage.objects;
CREATE POLICY "ver documentos restritos"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documentos'
    AND (
      owner = auth.uid()
      OR is_gestor(auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.documentos d
        WHERE d.url = storage.objects.name
          AND has_permission(auth.uid(), 'documentos'::modulo, 'visualizar'::acao_permissao)
          AND (
            (d.cliente_id  IS NOT NULL AND public.usuario_ve_cliente(auth.uid(), d.cliente_id))
            OR
            (d.processo_id IS NOT NULL AND public.usuario_ve_processo(auth.uid(), d.processo_id))
            OR
            (d.cliente_id IS NULL AND d.processo_id IS NULL)
          )
      )
    )
  );

DROP POLICY IF EXISTS "ver comprovantes restritos" ON storage.objects;
CREATE POLICY "ver comprovantes restritos"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'comprovantes'
    AND (owner = auth.uid() OR is_gestor(auth.uid()))
  );

DROP POLICY IF EXISTS "ver arquivos producao" ON storage.objects;
CREATE POLICY "ver arquivos producao"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'producao-juridica'
    AND (owner = auth.uid() OR is_gestor(auth.uid()))
  );

REVOKE EXECUTE ON FUNCTION public.is_interno_ativo(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ponto_verificar_vinculo() FROM anon, PUBLIC;
