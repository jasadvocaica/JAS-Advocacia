
-- Harden permissive RLS policies (replace USING(true)/WITH CHECK(true) with authenticated-active checks)

-- checklist_diligencias
DROP POLICY IF EXISTS "Autenticados atualizam checklist" ON public.checklist_diligencias;
DROP POLICY IF EXISTS "Autenticados criam checklist" ON public.checklist_diligencias;
DROP POLICY IF EXISTS "Autenticados removem checklist" ON public.checklist_diligencias;

CREATE POLICY "Autenticados atualizam checklist"
ON public.checklist_diligencias FOR UPDATE TO authenticated
USING (public.is_authenticated_active())
WITH CHECK (public.is_authenticated_active());

CREATE POLICY "Autenticados criam checklist"
ON public.checklist_diligencias FOR INSERT TO authenticated
WITH CHECK (public.is_authenticated_active());

CREATE POLICY "Autenticados removem checklist"
ON public.checklist_diligencias FOR DELETE TO authenticated
USING (public.is_authenticated_active());

-- cliente_unificacoes (somente gestor pode inserir; função SECURITY DEFINER continua funcionando)
DROP POLICY IF EXISTS "Sistema insere unificacoes" ON public.cliente_unificacoes;
CREATE POLICY "Gestores inserem unificacoes"
ON public.cliente_unificacoes FOR INSERT TO authenticated
WITH CHECK (public.is_gestor(auth.uid()));

-- processos_tags
DROP POLICY IF EXISTS "auth delete pt" ON public.processos_tags;
DROP POLICY IF EXISTS "auth write pt" ON public.processos_tags;

CREATE POLICY "auth delete pt"
ON public.processos_tags FOR DELETE TO authenticated
USING (public.is_authenticated_active());

CREATE POLICY "auth write pt"
ON public.processos_tags FOR INSERT TO authenticated
WITH CHECK (public.is_authenticated_active());

-- tags
DROP POLICY IF EXISTS "auth delete tags" ON public.tags;
DROP POLICY IF EXISTS "auth update tags" ON public.tags;
DROP POLICY IF EXISTS "auth write tags" ON public.tags;

CREATE POLICY "auth delete tags"
ON public.tags FOR DELETE TO authenticated
USING (public.is_authenticated_active());

CREATE POLICY "auth update tags"
ON public.tags FOR UPDATE TO authenticated
USING (public.is_authenticated_active())
WITH CHECK (public.is_authenticated_active());

CREATE POLICY "auth write tags"
ON public.tags FOR INSERT TO authenticated
WITH CHECK (public.is_authenticated_active());
