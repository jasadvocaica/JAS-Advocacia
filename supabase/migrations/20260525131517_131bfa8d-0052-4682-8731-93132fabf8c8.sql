DROP POLICY IF EXISTS "ver itens controladoria" ON public.controladoria_itens;

CREATE POLICY "ver itens controladoria"
ON public.controladoria_itens
FOR SELECT
USING (
  public.has_permission(auth.uid(), 'controladoria'::public.modulo, 'visualizar'::public.acao_permissao)
  AND (
    public.is_gestor(auth.uid())
    OR responsavel_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.controladoria_responsaveis cr
      WHERE cr.item_id = controladoria_itens.id
        AND cr.user_id = auth.uid()
    )
    OR (processo_id IS NOT NULL AND public.usuario_ve_processo(auth.uid(), processo_id))
    OR (cliente_id IS NOT NULL AND public.usuario_ve_cliente(auth.uid(), cliente_id))
  )
);

DROP POLICY IF EXISTS "gerenciar responsaveis" ON public.controladoria_responsaveis;

CREATE POLICY "gerenciar responsaveis"
ON public.controladoria_responsaveis
FOR ALL
TO authenticated
USING (
  public.has_permission(auth.uid(), 'controladoria'::public.modulo, 'editar'::public.acao_permissao)
  AND (
    public.is_gestor(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.controladoria_itens ci
      WHERE ci.id = controladoria_responsaveis.item_id
        AND (
          ci.responsavel_id = auth.uid()
          OR ci.criado_por = auth.uid()
          OR (ci.processo_id IS NOT NULL AND public.usuario_ve_processo(auth.uid(), ci.processo_id))
          OR (ci.cliente_id IS NOT NULL AND public.usuario_ve_cliente(auth.uid(), ci.cliente_id))
        )
    )
  )
)
WITH CHECK (
  public.has_permission(auth.uid(), 'controladoria'::public.modulo, 'editar'::public.acao_permissao)
  AND (
    public.is_gestor(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.controladoria_itens ci
      WHERE ci.id = controladoria_responsaveis.item_id
        AND (
          ci.responsavel_id = auth.uid()
          OR ci.criado_por = auth.uid()
          OR (ci.processo_id IS NOT NULL AND public.usuario_ve_processo(auth.uid(), ci.processo_id))
          OR (ci.cliente_id IS NOT NULL AND public.usuario_ve_cliente(auth.uid(), ci.cliente_id))
        )
    )
  )
);