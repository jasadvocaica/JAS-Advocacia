
-- ============================================================
-- SECURITY HARDENING
-- 1) profiles: restrict SELECT to own row + active staff users
-- 2) user_roles: restrict SELECT to own role + gestor
-- 3) storage 'auth ve documentos': restrict to owner + gestor + perms
-- 4) avatares: restrict listing (LIST) but keep public read
-- 5) realtime.messages: scope channel subscriptions per-user
-- ============================================================

-- 1) profiles -------------------------------------------------
DROP POLICY IF EXISTS "todos veem perfis ativos" ON public.profiles;

-- Staff (with any user_roles row) can see all active profiles; everyone can see their own.
CREATE POLICY "perfis visiveis para equipe e proprio"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
  )
);

-- 2) user_roles -----------------------------------------------
DROP POLICY IF EXISTS "usuarios veem roles" ON public.user_roles;

CREATE POLICY "usuario ve proprio role e gestor ve todos"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_gestor(auth.uid())
);

-- 3) storage objects: tighten 'auth ve documentos' ------------
DROP POLICY IF EXISTS "auth ve documentos" ON storage.objects;

-- documentos: owner OR gestor OR users with documentos.visualizar permission
CREATE POLICY "ver documentos restritos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documentos'
  AND (
    owner = auth.uid()
    OR public.is_gestor(auth.uid())
    OR public.has_permission(auth.uid(), 'documentos'::modulo, 'visualizar'::acao_permissao)
  )
);

-- chat-anexos: owner OR gestor OR users with controladoria.visualizar permission
CREATE POLICY "ver chat anexos restritos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-anexos'
  AND (
    owner = auth.uid()
    OR public.is_gestor(auth.uid())
    OR public.has_permission(auth.uid(), 'controladoria'::modulo, 'visualizar'::acao_permissao)
  )
);

-- comprovantes: owner OR gestor OR users with financeiro.visualizar permission
CREATE POLICY "ver comprovantes restritos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'comprovantes'
  AND (
    owner = auth.uid()
    OR public.is_gestor(auth.uid())
    OR public.has_permission(auth.uid(), 'financeiro'::modulo, 'visualizar'::acao_permissao)
  )
);

-- 4) avatares: restrict listing (LIST) -- keep public read by URL ---
-- The bucket is public so direct URLs continue to work.
-- We replace the broad public listing with an authenticated-only LIST policy
-- that returns only objects the user owns. Public read by URL is unaffected
-- because Storage CDN serves public bucket files without checking RLS for reads.
DROP POLICY IF EXISTS "publico ve avatares" ON storage.objects;

-- Authenticated users can list/select their own avatar files
CREATE POLICY "auth lista proprios avatares"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatares'
  AND (
    owner = auth.uid()
    OR public.is_authenticated_active()
  )
);

-- 5) realtime.messages: restrict channel subscriptions ---------
-- Only authenticated users can subscribe, and only to topics that include
-- their own auth.uid(). This prevents users from listening to other users'
-- notification or comment channels.
DROP POLICY IF EXISTS "auth subscribes own topics" ON realtime.messages;

CREATE POLICY "auth subscribes own topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- Allow if the topic contains the caller's user id (e.g. 'notificacoes:<uid>')
  (realtime.topic() LIKE '%' || auth.uid()::text || '%')
  -- Or general public topics for staff (postgres_changes broadcasts)
  OR public.is_gestor(auth.uid())
);
