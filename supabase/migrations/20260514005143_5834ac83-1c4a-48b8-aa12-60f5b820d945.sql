
-- ============================================================
-- Endurecimento de Storage: privatizar buckets desnecessariamente
-- públicos e remover policies redundantes/permissivas
-- ============================================================

-- 1) Privatizar bucket "avatares" (não está em uso no app, evita
--    listagem/leitura por anon). Branding permanece público pois
--    é usado em e-mails e páginas não autenticadas.
UPDATE storage.buckets SET public = false WHERE id = 'avatares';

-- 2) Remover policies redundantes/permissivas do bucket "avatares"
--    - avatares_read_object: permitia leitura para qualquer role (anon)
--    - avatares_auth_write / avatares_auth_update: permitiam que
--      qualquer authenticated escrevesse em qualquer caminho
DROP POLICY IF EXISTS "avatares_read_object" ON storage.objects;
DROP POLICY IF EXISTS "avatares_auth_write" ON storage.objects;
DROP POLICY IF EXISTS "avatares_auth_update" ON storage.objects;

-- Mantemos:
--   "auth gerencia proprio avatar" (ALL, owner = auth.uid())
--   "auth lista proprios avatares" (SELECT, owner OR usuário ativo)
-- Restringe esta última ao role authenticated (estava como public)
DROP POLICY IF EXISTS "auth lista proprios avatares" ON storage.objects;
CREATE POLICY "avatares_select_owner_or_ativo"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'avatares'
  AND (owner = auth.uid() OR public.is_authenticated_active())
);

-- 3) Branding: deduplicar policies (existem dois conjuntos
--    equivalentes). Mantemos a versão "branding_*" e o SELECT público.
DROP POLICY IF EXISTS "Apenas gestores podem atualizar branding" ON storage.objects;
DROP POLICY IF EXISTS "Apenas gestores podem enviar branding" ON storage.objects;
DROP POLICY IF EXISTS "Apenas gestores podem remover branding" ON storage.objects;
DROP POLICY IF EXISTS "Branding é público para leitura" ON storage.objects;

-- Recria SELECT público de branding (necessário para uso em e-mails)
DROP POLICY IF EXISTS "branding_read_object" ON storage.objects;
CREATE POLICY "branding_public_read"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'branding');

-- 4) Endurecimento adicional: garantir que policies "FOR SELECT"
--    em buckets privados sensíveis estejam restritas a authenticated
--    (não a public). As que estão como {-} (public role) abaixo
--    já têm filtros de auth.uid()/has_permission, mas restringir
--    o role evita avaliações desnecessárias para anon.
DROP POLICY IF EXISTS "Ficha docs: leitura para usuários ativos" ON storage.objects;
CREATE POLICY "fichas_select_ativos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'fichas-atendimento' AND public.is_authenticated_active());

DROP POLICY IF EXISTS "Ficha docs: upload para quem cria clientes" ON storage.objects;
CREATE POLICY "fichas_insert_criar_clientes"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'fichas-atendimento'
  AND public.has_permission(auth.uid(), 'clientes'::public.modulo, 'criar'::public.acao_permissao)
);

DROP POLICY IF EXISTS "Ficha docs: update para quem edita clientes" ON storage.objects;
CREATE POLICY "fichas_update_editar_clientes"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'fichas-atendimento'
  AND public.has_permission(auth.uid(), 'clientes'::public.modulo, 'editar'::public.acao_permissao)
);

DROP POLICY IF EXISTS "Ficha docs: delete para quem exclui clientes" ON storage.objects;
CREATE POLICY "fichas_delete_excluir_clientes"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'fichas-atendimento'
  AND public.has_permission(auth.uid(), 'clientes'::public.modulo, 'excluir'::public.acao_permissao)
);
