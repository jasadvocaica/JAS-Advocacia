-- Helper: usuário interno ativo (qualquer pessoa do escritório com perfil ativo)
CREATE OR REPLACE FUNCTION public.is_interno_ativo(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id
      AND ativo = true
      AND COALESCE(tipo_portal, 'interno') = 'interno'
  )
$$;

-- Equipe interna pode ver TODOS os processos/clientes do escritório.
-- Portais de cliente/parceiro continuam restritos pelas demais policies.
CREATE OR REPLACE FUNCTION public.usuario_ve_processo(_user_id uuid, _processo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_gestor(_user_id)
    OR public.is_interno_ativo(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.processos p
      WHERE p.id = _processo_id
        AND p.responsavel_id = _user_id
    )
$$;

CREATE OR REPLACE FUNCTION public.usuario_ve_cliente(_user_id uuid, _cliente_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_gestor(_user_id)
    OR public.is_interno_ativo(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.processos p
      WHERE p.cliente_id = _cliente_id
        AND p.responsavel_id = _user_id
    )
$$;

-- Policy de SELECT em processos: permitir equipe interna ativa com permissão de visualizar
DROP POLICY IF EXISTS "ver processos" ON public.processos;
CREATE POLICY "ver processos"
ON public.processos FOR SELECT
USING (
  public.has_permission(auth.uid(), 'processos'::public.modulo, 'visualizar'::public.acao_permissao)
  AND (
    public.is_gestor(auth.uid())
    OR public.is_interno_ativo(auth.uid())
    OR responsavel_id = auth.uid()
  )
);