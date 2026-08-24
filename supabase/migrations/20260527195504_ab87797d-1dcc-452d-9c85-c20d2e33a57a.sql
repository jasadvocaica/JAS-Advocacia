
-- 1) checklist_diligencias: substitui SELECT permissivo
DROP POLICY IF EXISTS "Autenticados leem checklist" ON public.checklist_diligencias;

CREATE POLICY "Checklist scope read"
ON public.checklist_diligencias
FOR SELECT
TO authenticated
USING (
  public.usuario_ve_processo(auth.uid(), processo_id)
  OR (visivel_cliente = true AND public.pode_ver_processo_no_portal(processo_id))
  OR (visivel_cliente = true AND public.parceiro_ve_processo(auth.uid(), processo_id))
);

-- 2) cliente_ficha_documentos: SELECT por escopo de cliente
DROP POLICY IF EXISTS "Usuários autenticados ativos podem ver documentos de fichas" ON public.cliente_ficha_documentos;

CREATE POLICY "Ficha documentos scope read"
ON public.cliente_ficha_documentos
FOR SELECT
TO authenticated
USING (
  public.usuario_ve_cliente(auth.uid(), cliente_id)
  OR cliente_id = public.cliente_id_do_usuario(auth.uid())
);

-- 3) storage bucket fichas-atendimento: escopo pela pasta (cliente_id no primeiro segmento)
DROP POLICY IF EXISTS "fichas_select_ativos" ON storage.objects;

CREATE POLICY "fichas_select_scope"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'fichas-atendimento'
  AND (
    public.is_gestor(auth.uid())
    OR (
      (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
      AND (
        public.usuario_ve_cliente(auth.uid(), ((storage.foldername(name))[1])::uuid)
        OR ((storage.foldername(name))[1])::uuid = public.cliente_id_do_usuario(auth.uid())
      )
    )
  )
);

-- 4) doc_comentarios: SELECT com escopo via peça
DROP POLICY IF EXISTS "ver comentarios docs" ON public.doc_comentarios;

CREATE POLICY "ver comentarios docs"
ON public.doc_comentarios
FOR SELECT
TO authenticated
USING (
  public.has_permission(auth.uid(), 'documentos'::modulo, 'visualizar'::acao_permissao)
  AND EXISTS (
    SELECT 1 FROM public.doc_pecas p
    WHERE p.id = doc_comentarios.peca_id
      AND (
        p.cliente_id IS NULL
        OR public.usuario_ve_cliente(auth.uid(), p.cliente_id)
      )
  )
);

-- 5) doc_pecas_versoes: SELECT com escopo via peça
DROP POLICY IF EXISTS "ver versoes" ON public.doc_pecas_versoes;

CREATE POLICY "ver versoes"
ON public.doc_pecas_versoes
FOR SELECT
TO authenticated
USING (
  public.has_permission(auth.uid(), 'documentos'::modulo, 'visualizar'::acao_permissao)
  AND EXISTS (
    SELECT 1 FROM public.doc_pecas p
    WHERE p.id = doc_pecas_versoes.peca_id
      AND (
        p.cliente_id IS NULL
        OR public.usuario_ve_cliente(auth.uid(), p.cliente_id)
      )
  )
);
