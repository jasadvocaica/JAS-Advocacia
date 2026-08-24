CREATE OR REPLACE FUNCTION public.can_view_controladoria_item(_user_id uuid, _item_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.controladoria_itens ci
    WHERE ci.id = _item_id
      AND public.has_permission(_user_id, 'controladoria'::public.modulo, 'visualizar'::public.acao_permissao)
      AND (
        public.is_gestor(_user_id)
        OR ci.responsavel_id = _user_id
        OR EXISTS (
          SELECT 1
          FROM public.controladoria_responsaveis cr
          WHERE cr.item_id = ci.id
            AND cr.user_id = _user_id
        )
        OR (ci.processo_id IS NOT NULL AND public.usuario_ve_processo(_user_id, ci.processo_id))
        OR (ci.cliente_id IS NOT NULL AND public.usuario_ve_cliente(_user_id, ci.cliente_id))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_controladoria_responsaveis(_user_id uuid, _item_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.controladoria_itens ci
    WHERE ci.id = _item_id
      AND public.has_permission(_user_id, 'controladoria'::public.modulo, 'editar'::public.acao_permissao)
      AND (
        public.is_gestor(_user_id)
        OR ci.responsavel_id = _user_id
        OR ci.criado_por = _user_id
        OR (ci.processo_id IS NOT NULL AND public.usuario_ve_processo(_user_id, ci.processo_id))
        OR (ci.cliente_id IS NOT NULL AND public.usuario_ve_cliente(_user_id, ci.cliente_id))
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_view_controladoria_item(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_controladoria_responsaveis(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_controladoria_item(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_controladoria_responsaveis(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "ver itens controladoria" ON public.controladoria_itens;
CREATE POLICY "ver itens controladoria"
ON public.controladoria_itens
FOR SELECT
USING (public.can_view_controladoria_item(auth.uid(), id));

DROP POLICY IF EXISTS "gerenciar responsaveis" ON public.controladoria_responsaveis;
CREATE POLICY "gerenciar responsaveis"
ON public.controladoria_responsaveis
FOR ALL
TO authenticated
USING (public.can_manage_controladoria_responsaveis(auth.uid(), item_id))
WITH CHECK (public.can_manage_controladoria_responsaveis(auth.uid(), item_id));