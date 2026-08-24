
CREATE TABLE IF NOT EXISTS public.publijus_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_url TEXT NOT NULL DEFAULT '',
  endpoint_busca_oab TEXT NOT NULL DEFAULT '/publicacoes',
  endpoint_detalhe TEXT NOT NULL DEFAULT '/publicacoes/{id}',
  param_oab TEXT NOT NULL DEFAULT 'oab',
  param_seccional TEXT NOT NULL DEFAULT 'uf',
  auth_header TEXT NOT NULL DEFAULT 'Authorization',
  auth_prefix TEXT NOT NULL DEFAULT 'Bearer ',
  observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT false,
  ultima_sincronizacao TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_por UUID
);

ALTER TABLE public.publijus_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestores podem ver config publijus"
ON public.publijus_config FOR SELECT
TO authenticated
USING (public.is_gestor(auth.uid()));

CREATE POLICY "Gestores podem inserir config publijus"
ON public.publijus_config FOR INSERT
TO authenticated
WITH CHECK (public.is_gestor(auth.uid()));

CREATE POLICY "Gestores podem editar config publijus"
ON public.publijus_config FOR UPDATE
TO authenticated
USING (public.is_gestor(auth.uid()))
WITH CHECK (public.is_gestor(auth.uid()));

CREATE TRIGGER trg_publijus_config_updated_at
BEFORE UPDATE ON public.publijus_config
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.publijus_config (base_url) VALUES ('') ON CONFLICT DO NOTHING;
