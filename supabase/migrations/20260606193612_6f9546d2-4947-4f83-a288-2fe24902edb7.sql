
DROP POLICY IF EXISTS "criar historico etapas" ON public.controladoria_etapas_historico;
DROP POLICY IF EXISTS "atualizar historico etapas" ON public.controladoria_etapas_historico;

CREATE POLICY "criar historico etapas" ON public.controladoria_etapas_historico
FOR INSERT TO authenticated
WITH CHECK (
  public.has_permission(auth.uid(), 'controladoria'::modulo, 'editar'::acao_permissao)
  AND public.can_manage_controladoria_responsaveis(item_id, auth.uid())
);

CREATE POLICY "atualizar historico etapas" ON public.controladoria_etapas_historico
FOR UPDATE TO authenticated
USING (
  public.has_permission(auth.uid(), 'controladoria'::modulo, 'editar'::acao_permissao)
  AND public.can_manage_controladoria_responsaveis(item_id, auth.uid())
)
WITH CHECK (
  public.has_permission(auth.uid(), 'controladoria'::modulo, 'editar'::acao_permissao)
  AND public.can_manage_controladoria_responsaveis(item_id, auth.uid())
);

DROP POLICY IF EXISTS "equipe cria fases padrao" ON public.processo_fases_padrao;
DROP POLICY IF EXISTS "equipe atualiza fases padrao" ON public.processo_fases_padrao;
DROP POLICY IF EXISTS "equipe remove fases padrao" ON public.processo_fases_padrao;

CREATE POLICY "equipe cria fases padrao" ON public.processo_fases_padrao
FOR INSERT TO authenticated
WITH CHECK (
  public.is_gestor(auth.uid())
  OR public.has_permission(auth.uid(), 'processos'::modulo, 'editar'::acao_permissao)
);

CREATE POLICY "equipe atualiza fases padrao" ON public.processo_fases_padrao
FOR UPDATE TO authenticated
USING (
  public.is_gestor(auth.uid())
  OR public.has_permission(auth.uid(), 'processos'::modulo, 'editar'::acao_permissao)
)
WITH CHECK (
  public.is_gestor(auth.uid())
  OR public.has_permission(auth.uid(), 'processos'::modulo, 'editar'::acao_permissao)
);

CREATE POLICY "equipe remove fases padrao" ON public.processo_fases_padrao
FOR DELETE TO authenticated
USING (
  public.is_gestor(auth.uid())
  OR public.has_permission(auth.uid(), 'processos'::modulo, 'editar'::acao_permissao)
);
