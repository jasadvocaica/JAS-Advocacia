DO $$ BEGIN
  CREATE TYPE public.pje_monitoramento_tipo AS ENUM ('oab','nome','cpf_cnpj','cnj');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.pje_monitoramentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo public.pje_monitoramento_tipo NOT NULL,
  valor text NOT NULL,
  uf_oab text NULL,
  rotulo text NULL,
  cliente_id uuid NULL REFERENCES public.clientes(id) ON DELETE SET NULL,
  membro_id uuid NULL REFERENCES public.equipe_membros(id) ON DELETE SET NULL,
  oab_legacy_id uuid NULL REFERENCES public.pje_oabs_monitoradas(id) ON DELETE SET NULL,
  ativo boolean NOT NULL DEFAULT true,
  ultima_sync_em timestamptz NULL,
  ultima_sync_qtd integer NOT NULL DEFAULT 0,
  observacoes text NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  criado_por uuid NULL,
  CONSTRAINT pje_monitoramento_oab_uf CHECK (
    tipo <> 'oab' OR (uf_oab IS NOT NULL AND length(uf_oab) = 2)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS pje_monitoramento_unq
  ON public.pje_monitoramentos (tipo, lower(valor), COALESCE(upper(uf_oab),''))
  WHERE ativo = true;

CREATE INDEX IF NOT EXISTS pje_monitoramento_tipo_idx ON public.pje_monitoramentos(tipo) WHERE ativo;
CREATE INDEX IF NOT EXISTS pje_monitoramento_cliente_idx ON public.pje_monitoramentos(cliente_id);
CREATE INDEX IF NOT EXISTS pje_monitoramento_membro_idx ON public.pje_monitoramentos(membro_id);

DROP TRIGGER IF EXISTS pje_monitoramento_set_updated_at ON public.pje_monitoramentos;
CREATE TRIGGER pje_monitoramento_set_updated_at
  BEFORE UPDATE ON public.pje_monitoramentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pje_publicacoes
  ADD COLUMN IF NOT EXISTS monitoramento_id uuid NULL
    REFERENCES public.pje_monitoramentos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS pje_publicacoes_monitoramento_idx
  ON public.pje_publicacoes(monitoramento_id);

ALTER TABLE public.pje_monitoramentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pje_monit_select" ON public.pje_monitoramentos;
CREATE POLICY "pje_monit_select"
ON public.pje_monitoramentos
FOR SELECT
TO authenticated
USING (
  public.is_gestor(auth.uid())
  OR criado_por = auth.uid()
  OR (membro_id IS NOT NULL AND membro_id = public.gp_membro_id_do_usuario(auth.uid()))
  OR (cliente_id IS NOT NULL AND public.usuario_ve_cliente(auth.uid(), cliente_id))
);

DROP POLICY IF EXISTS "pje_monit_insert" ON public.pje_monitoramentos;
CREATE POLICY "pje_monit_insert"
ON public.pje_monitoramentos
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_permission(auth.uid(), 'processos'::modulo, 'editar'::acao_permissao)
);

DROP POLICY IF EXISTS "pje_monit_update" ON public.pje_monitoramentos;
CREATE POLICY "pje_monit_update"
ON public.pje_monitoramentos
FOR UPDATE
TO authenticated
USING (
  public.is_gestor(auth.uid())
  OR (criado_por = auth.uid()
      AND public.has_permission(auth.uid(), 'processos'::modulo, 'editar'::acao_permissao))
)
WITH CHECK (true);

DROP POLICY IF EXISTS "pje_monit_delete" ON public.pje_monitoramentos;
CREATE POLICY "pje_monit_delete"
ON public.pje_monitoramentos
FOR DELETE
TO authenticated
USING (
  public.is_gestor(auth.uid())
  OR (criado_por = auth.uid()
      AND public.has_permission(auth.uid(), 'processos'::modulo, 'excluir'::acao_permissao))
);

INSERT INTO public.pje_monitoramentos (
  tipo, valor, uf_oab, rotulo, membro_id, oab_legacy_id, ativo,
  ultima_sync_em, ultima_sync_qtd, observacoes, criado_em, criado_por
)
SELECT
  'oab'::public.pje_monitoramento_tipo,
  o.numero_oab,
  o.uf_oab,
  o.nome_advogado,
  o.membro_id,
  o.id,
  o.ativo,
  o.ultima_sync_em,
  o.ultima_sync_qtd,
  o.observacoes,
  o.criado_em,
  o.criado_por
FROM public.pje_oabs_monitoradas o
WHERE NOT EXISTS (
  SELECT 1 FROM public.pje_monitoramentos m
  WHERE m.oab_legacy_id = o.id
);