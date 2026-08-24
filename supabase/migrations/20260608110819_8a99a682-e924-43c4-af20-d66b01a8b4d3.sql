-- 1) Tighten 'documentos' bucket SELECT: remove owner-only bypass, require scope
DROP POLICY IF EXISTS "ver documentos restritos" ON storage.objects;
CREATE POLICY "ver documentos restritos" ON storage.objects
FOR SELECT USING (
  bucket_id = 'documentos'
  AND (
    public.is_gestor(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.documentos d
      WHERE d.url = objects.name
        AND public.has_permission(auth.uid(), 'documentos'::public.modulo, 'visualizar'::public.acao_permissao)
        AND (
          (d.cliente_id IS NOT NULL AND public.usuario_ve_cliente(auth.uid(), d.cliente_id))
          OR (d.processo_id IS NOT NULL AND public.usuario_ve_processo(auth.uid(), d.processo_id))
          OR (d.cliente_id IS NULL AND d.processo_id IS NULL AND owner = auth.uid())
        )
    )
    -- Permite ao próprio uploader ler enquanto ainda não existe o registro em public.documentos
    -- (janela curta entre upload e insert do metadado)
    OR (
      owner = auth.uid()
      AND NOT EXISTS (SELECT 1 FROM public.documentos d WHERE d.url = objects.name)
    )
  )
);

-- 2) Tighten 'documentos' DELETE: require scope, not only ownership
DROP POLICY IF EXISTS "auth deleta proprios uploads" ON storage.objects;
CREATE POLICY "auth deleta proprios uploads" ON storage.objects
FOR DELETE USING (
  bucket_id IN ('documentos','chat-anexos','comprovantes')
  AND (
    public.is_gestor(auth.uid())
    OR (
      owner = auth.uid()
      AND (
        bucket_id <> 'documentos'
        OR NOT EXISTS (SELECT 1 FROM public.documentos d WHERE d.url = objects.name)
        OR EXISTS (
          SELECT 1 FROM public.documentos d
          WHERE d.url = objects.name
            AND public.has_permission(auth.uid(), 'documentos'::public.modulo, 'excluir'::public.acao_permissao)
            AND (
              (d.cliente_id IS NOT NULL AND public.usuario_ve_cliente(auth.uid(), d.cliente_id))
              OR (d.processo_id IS NOT NULL AND public.usuario_ve_processo(auth.uid(), d.processo_id))
              OR (d.cliente_id IS NULL AND d.processo_id IS NULL)
            )
        )
      )
    )
  )
);

-- 3) Tighten 'producao-juridica' SELECT: scope by doc_pecas
DROP POLICY IF EXISTS "ver arquivos producao" ON storage.objects;
CREATE POLICY "ver arquivos producao" ON storage.objects
FOR SELECT USING (
  bucket_id = 'producao-juridica'
  AND (
    public.is_gestor(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.doc_pecas dp
      WHERE (dp.url_docx = objects.name OR dp.url_pdf = objects.name)
        AND public.has_permission(auth.uid(), 'documentos'::public.modulo, 'visualizar'::public.acao_permissao)
        AND public.usuario_ve_cliente(auth.uid(), dp.cliente_id)
    )
    -- Janela curta entre upload e vínculo em doc_pecas
    OR (
      owner = auth.uid()
      AND NOT EXISTS (SELECT 1 FROM public.doc_pecas dp WHERE dp.url_docx = objects.name OR dp.url_pdf = objects.name)
    )
  )
);

-- 4) Revogar EXECUTE de anon nas SECURITY DEFINER ainda expostas
REVOKE EXECUTE ON FUNCTION public.notificar_mencoes_controladoria(uuid, uuid[]) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.notificar_comentario_controladoria(uuid, uuid, text, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.trg_notificar_comentario_controladoria() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.notificar_mencoes_controladoria(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notificar_comentario_controladoria(uuid, uuid, text, text, text) TO authenticated;
