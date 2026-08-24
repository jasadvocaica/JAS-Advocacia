
-- ============= TABELAS =============

CREATE TABLE IF NOT EXISTS public.ferramentas_analises_caso (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_documento TEXT NOT NULL DEFAULT 'outro' CHECK (tipo_documento IN (
    'indeferimento_inss','carta_concessao','sentenca','peticao',
    'processo_administrativo','documento_judicial','outro'
  )),
  titulo TEXT,
  arquivo_nome TEXT,
  arquivo_url TEXT,
  texto_origem TEXT,
  dados_extraidos JSONB NOT NULL DEFAULT '{}'::jsonb,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  processo_id UUID REFERENCES public.processos(id) ON DELETE SET NULL,
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ferramentas_analises_cliente ON public.ferramentas_analises_caso(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ferramentas_analises_processo ON public.ferramentas_analises_caso(processo_id);
CREATE INDEX IF NOT EXISTS idx_ferramentas_analises_criado_por ON public.ferramentas_analises_caso(criado_por);

CREATE TRIGGER trg_ferramentas_analises_updated
BEFORE UPDATE ON public.ferramentas_analises_caso
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE IF NOT EXISTS public.ferramentas_calculos_cnis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT,
  arquivo_nome TEXT,
  arquivo_url TEXT,
  data_referencia DATE NOT NULL DEFAULT CURRENT_DATE,
  desemprego_involuntario BOOLEAN NOT NULL DEFAULT false,
  dados_segurado JSONB NOT NULL DEFAULT '{}'::jsonb,
  vinculos JSONB NOT NULL DEFAULT '[]'::jsonb,
  resultado JSONB NOT NULL DEFAULT '{}'::jsonb,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  processo_id UUID REFERENCES public.processos(id) ON DELETE SET NULL,
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ferramentas_cnis_cliente ON public.ferramentas_calculos_cnis(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ferramentas_cnis_processo ON public.ferramentas_calculos_cnis(processo_id);
CREATE INDEX IF NOT EXISTS idx_ferramentas_cnis_criado_por ON public.ferramentas_calculos_cnis(criado_por);

CREATE TRIGGER trg_ferramentas_cnis_updated
BEFORE UPDATE ON public.ferramentas_calculos_cnis
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============= RLS =============

ALTER TABLE public.ferramentas_analises_caso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ferramentas_calculos_cnis ENABLE ROW LEVEL SECURITY;

-- Análises: qualquer usuário autenticado ativo lê suas próprias; gestor vê tudo
CREATE POLICY "analises_select_proprio_ou_gestor"
ON public.ferramentas_analises_caso FOR SELECT
TO authenticated
USING (
  public.is_authenticated_active() AND (
    criado_por = auth.uid() OR public.is_gestor(auth.uid())
  )
);

CREATE POLICY "analises_insert_autenticado"
ON public.ferramentas_analises_caso FOR INSERT
TO authenticated
WITH CHECK (
  public.is_authenticated_active() AND criado_por = auth.uid()
);

CREATE POLICY "analises_update_proprio_ou_gestor"
ON public.ferramentas_analises_caso FOR UPDATE
TO authenticated
USING (criado_por = auth.uid() OR public.is_gestor(auth.uid()))
WITH CHECK (criado_por = auth.uid() OR public.is_gestor(auth.uid()));

CREATE POLICY "analises_delete_proprio_ou_gestor"
ON public.ferramentas_analises_caso FOR DELETE
TO authenticated
USING (criado_por = auth.uid() OR public.is_gestor(auth.uid()));

-- CNIS: mesmas regras
CREATE POLICY "cnis_select_proprio_ou_gestor"
ON public.ferramentas_calculos_cnis FOR SELECT
TO authenticated
USING (
  public.is_authenticated_active() AND (
    criado_por = auth.uid() OR public.is_gestor(auth.uid())
  )
);

CREATE POLICY "cnis_insert_autenticado"
ON public.ferramentas_calculos_cnis FOR INSERT
TO authenticated
WITH CHECK (
  public.is_authenticated_active() AND criado_por = auth.uid()
);

CREATE POLICY "cnis_update_proprio_ou_gestor"
ON public.ferramentas_calculos_cnis FOR UPDATE
TO authenticated
USING (criado_por = auth.uid() OR public.is_gestor(auth.uid()))
WITH CHECK (criado_por = auth.uid() OR public.is_gestor(auth.uid()));

CREATE POLICY "cnis_delete_proprio_ou_gestor"
ON public.ferramentas_calculos_cnis FOR DELETE
TO authenticated
USING (criado_por = auth.uid() OR public.is_gestor(auth.uid()));


-- ============= STORAGE BUCKETS =============

INSERT INTO storage.buckets (id, name, public)
VALUES ('ferramentas-analises', 'ferramentas-analises', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('ferramentas-cnis', 'ferramentas-cnis', false)
ON CONFLICT (id) DO NOTHING;

-- Análises: usuário autenticado vê o seu (nome do arquivo começa com user_id)
CREATE POLICY "ferramentas_analises_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'ferramentas-analises'
  AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_gestor(auth.uid()))
);

CREATE POLICY "ferramentas_analises_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'ferramentas-analises'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "ferramentas_analises_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'ferramentas-analises'
  AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_gestor(auth.uid()))
);

CREATE POLICY "ferramentas_cnis_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'ferramentas-cnis'
  AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_gestor(auth.uid()))
);

CREATE POLICY "ferramentas_cnis_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'ferramentas-cnis'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "ferramentas_cnis_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'ferramentas-cnis'
  AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_gestor(auth.uid()))
);
