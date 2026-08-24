-- Permitir que quem tem a permissão "editar" no módulo "equipe" também
-- consiga atualizar perfis (usado para ativar/inativar usuários na lista).
CREATE POLICY "equipe editar pode ativar perfis"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.has_permission(auth.uid(), 'equipe'::public.modulo, 'editar'::public.acao_permissao))
WITH CHECK (public.has_permission(auth.uid(), 'equipe'::public.modulo, 'editar'::public.acao_permissao));