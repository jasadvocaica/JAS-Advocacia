
-- ===== Tabela de jobs de importação e exportação =====
CREATE TABLE public.ie_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('importacao','exportacao')),
  modulo TEXT NOT NULL,
  subtipo TEXT,
  status TEXT NOT NULL DEFAULT 'aguardando' CHECK (status IN (
    'aguardando','processando','concluido','concluido_parcial','erro','expirado'
  )),
  total_registros INTEGER NOT NULL DEFAULT 0,
  registros_ok INTEGER NOT NULL DEFAULT 0,
  registros_erro INTEGER NOT NULL DEFAULT 0,
  erros_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  arquivo_entrada_url TEXT,
  arquivo_entrada_nome TEXT,
  arquivo_saida_url TEXT,
  arquivo_saida_nome TEXT,
  arquivo_tamanho_bytes BIGINT,
  filtros JSONB NOT NULL DEFAULT '{}'::jsonb,
  iniciado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  iniciado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluido_em TIMESTAMPTZ,
  expira_em TIMESTAMPTZ,
  mensagem TEXT
);

CREATE INDEX idx_ie_jobs_tipo_status ON public.ie_jobs(tipo, status);
CREATE INDEX idx_ie_jobs_iniciado_por ON public.ie_jobs(iniciado_por);
CREATE INDEX idx_ie_jobs_modulo ON public.ie_jobs(modulo);
CREATE INDEX idx_ie_jobs_iniciado_em ON public.ie_jobs(iniciado_em DESC);

ALTER TABLE public.ie_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestor vê todos os jobs"
ON public.ie_jobs FOR SELECT
TO authenticated
USING (public.is_gestor(auth.uid()));

CREATE POLICY "Usuário vê seus próprios jobs"
ON public.ie_jobs FOR SELECT
TO authenticated
USING (iniciado_por = auth.uid());

CREATE POLICY "Usuário cria seus próprios jobs"
ON public.ie_jobs FOR INSERT
TO authenticated
WITH CHECK (iniciado_por = auth.uid());

CREATE POLICY "Gestor atualiza qualquer job"
ON public.ie_jobs FOR UPDATE
TO authenticated
USING (public.is_gestor(auth.uid()));

CREATE POLICY "Usuário atualiza seus próprios jobs"
ON public.ie_jobs FOR UPDATE
TO authenticated
USING (iniciado_por = auth.uid());

CREATE POLICY "Apenas gestor remove jobs"
ON public.ie_jobs FOR DELETE
TO authenticated
USING (public.is_gestor(auth.uid()));

-- ===== Mapeamentos de colunas reutilizáveis =====
CREATE TABLE public.ie_mapeamentos_colunas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  modulo TEXT NOT NULL,
  nome TEXT NOT NULL,
  mapeamento JSONB NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, modulo, nome)
);

ALTER TABLE public.ie_mapeamentos_colunas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário gerencia seus mapeamentos"
ON public.ie_mapeamentos_colunas FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ===== Bucket privado para arquivos de IE =====
INSERT INTO storage.buckets (id, name, public)
VALUES ('ie-arquivos', 'ie-arquivos', false)
ON CONFLICT (id) DO NOTHING;

-- Convenção de path: {user_id}/{job_id}/{nome_arquivo}
CREATE POLICY "Usuário lê seus arquivos de IE"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'ie-arquivos'
  AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_gestor(auth.uid()))
);

CREATE POLICY "Usuário envia arquivos de IE"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'ie-arquivos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Usuário atualiza seus arquivos de IE"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'ie-arquivos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Gestor remove arquivos de IE"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'ie-arquivos'
  AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_gestor(auth.uid()))
);

-- Trigger de timestamp
CREATE TRIGGER trg_ie_jobs_concluido
BEFORE UPDATE ON public.ie_jobs
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('concluido','concluido_parcial','erro'))
EXECUTE FUNCTION public.set_updated_at();
