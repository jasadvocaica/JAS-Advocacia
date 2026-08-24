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

REVOKE EXECUTE ON FUNCTION public.can_manage_controladoria_responsaveis(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_manage_controladoria_responsaveis(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_controladoria_responsaveis(uuid, uuid) TO authenticated;