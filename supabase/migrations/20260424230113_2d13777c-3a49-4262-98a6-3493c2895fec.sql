-- ============= DJE Análises =============
CREATE TABLE public.dje_analises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criado_por uuid NOT NULL,
  titulo text NOT NULL,
  origem text NOT NULL CHECK (origem IN ('caderno_dje','publicacao_avulsa','decisao','texto_colado')),
  arquivo_nome text,
  arquivo_path text,
  texto_bruto text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','processando','concluido','falha')),
  total_itens integer NOT NULL DEFAULT 0,
  erro text,
  modelo_ia text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX dje_analises_criado_por_idx ON public.dje_analises(criado_por, criado_em DESC);
CREATE INDEX dje_analises_status_idx ON public.dje_analises(status);

ALTER TABLE public.dje_analises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dje_analises_select_proprio_ou_gestor"
ON public.dje_analises FOR SELECT TO authenticated
USING (criado_por = auth.uid() OR public.has_role(auth.uid(), 'gestor'::app_role));

CREATE POLICY "dje_analises_insert_proprio"
ON public.dje_analises FOR INSERT TO authenticated
WITH CHECK (criado_por = auth.uid());

CREATE POLICY "dje_analises_update_proprio_ou_gestor"
ON public.dje_analises FOR UPDATE TO authenticated
USING (criado_por = auth.uid() OR public.has_role(auth.uid(), 'gestor'::app_role));

CREATE POLICY "dje_analises_delete_proprio_ou_gestor"
ON public.dje_analises FOR DELETE TO authenticated
USING (criado_por = auth.uid() OR public.has_role(auth.uid(), 'gestor'::app_role));

CREATE TRIGGER dje_analises_set_updated
BEFORE UPDATE ON public.dje_analises
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============= DJE Itens Extraídos =============
CREATE TABLE public.dje_itens_extraidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analise_id uuid NOT NULL REFERENCES public.dje_analises(id) ON DELETE CASCADE,
  ordem integer NOT NULL DEFAULT 0,
  numero_processo text,
  numero_processo_normalizado text,
  tribunal text,
  orgao_julgador text,
  tipo_ato text,
  intimados jsonb NOT NULL DEFAULT '[]'::jsonb,
  partes jsonb NOT NULL DEFAULT '[]'::jsonb,
  advogados jsonb NOT NULL DEFAULT '[]'::jsonb,
  data_publicacao date,
  prazo_dias integer,
  prazo_tipo text,
  prazo_base_legal text,
  resumo_simples text,
  trecho_original text,
  confianca numeric(4,2),
  processo_id uuid REFERENCES public.processos(id) ON DELETE SET NULL,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  status_revisao text NOT NULL DEFAULT 'novo' CHECK (status_revisao IN ('novo','revisado','ignorado','convertido')),
  item_controladoria_id uuid REFERENCES public.controladoria_itens(id) ON DELETE SET NULL,
  observacoes text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX dje_itens_analise_idx ON public.dje_itens_extraidos(analise_id, ordem);
CREATE INDEX dje_itens_processo_idx ON public.dje_itens_extraidos(numero_processo_normalizado);
CREATE INDEX dje_itens_status_idx ON public.dje_itens_extraidos(status_revisao);

ALTER TABLE public.dje_itens_extraidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dje_itens_select_via_analise"
ON public.dje_itens_extraidos FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.dje_analises a
    WHERE a.id = analise_id
      AND (a.criado_por = auth.uid() OR public.has_role(auth.uid(), 'gestor'::app_role)))
);

CREATE POLICY "dje_itens_insert_via_analise"
ON public.dje_itens_extraidos FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.dje_analises a
    WHERE a.id = analise_id
      AND (a.criado_por = auth.uid() OR public.has_role(auth.uid(), 'gestor'::app_role)))
);

CREATE POLICY "dje_itens_update_via_analise"
ON public.dje_itens_extraidos FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.dje_analises a
    WHERE a.id = analise_id
      AND (a.criado_por = auth.uid() OR public.has_role(auth.uid(), 'gestor'::app_role)))
);

CREATE POLICY "dje_itens_delete_via_analise"
ON public.dje_itens_extraidos FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.dje_analises a
    WHERE a.id = analise_id
      AND (a.criado_por = auth.uid() OR public.has_role(auth.uid(), 'gestor'::app_role)))
);

CREATE TRIGGER dje_itens_set_updated
BEFORE UPDATE ON public.dje_itens_extraidos
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============= Storage bucket privado =============
INSERT INTO storage.buckets (id, name, public)
VALUES ('dje-uploads', 'dje-uploads', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "dje_uploads_select_proprio"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'dje-uploads'
  AND (auth.uid()::text = (storage.foldername(name))[1]
       OR public.has_role(auth.uid(), 'gestor'::app_role))
);

CREATE POLICY "dje_uploads_insert_proprio"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'dje-uploads'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "dje_uploads_delete_proprio"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'dje-uploads'
  AND (auth.uid()::text = (storage.foldername(name))[1]
       OR public.has_role(auth.uid(), 'gestor'::app_role))
);