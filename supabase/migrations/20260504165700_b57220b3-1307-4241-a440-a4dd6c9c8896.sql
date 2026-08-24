-- 1. Expandir cliente_atendimentos
ALTER TABLE public.cliente_atendimentos
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','ativo','arquivado','convertido')),
  ADD COLUMN IF NOT EXISTS area TEXT,
  ADD COLUMN IF NOT EXISTS subtipo TEXT,
  ADD COLUMN IF NOT EXISTS informacoes_brutas TEXT,
  ADD COLUMN IF NOT EXISTS resumo_ia TEXT,
  ADD COLUMN IF NOT EXISTS tese_juridica TEXT,
  ADD COLUMN IF NOT EXISTS dados_estruturados JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS item_controladoria_id UUID REFERENCES public.controladoria_itens(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS convertido_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS convertido_tipo TEXT
    CHECK (convertido_tipo IS NULL OR convertido_tipo IN ('processo','processo_administrativo','diligencia'));

-- 2. Documentos da ficha
CREATE TABLE IF NOT EXISTS public.cliente_ficha_documentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  atendimento_id UUID NOT NULL REFERENCES public.cliente_atendimentos(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL,
  nome TEXT NOT NULL,
  tipo TEXT,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  tamanho_bytes BIGINT,
  resumo_ia TEXT,
  enviado_por UUID,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ficha_docs_atendimento ON public.cliente_ficha_documentos(atendimento_id);

ALTER TABLE public.cliente_ficha_documentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados ativos podem ver documentos de fichas"
  ON public.cliente_ficha_documentos FOR SELECT
  USING (public.is_authenticated_active());

CREATE POLICY "Usuários com permissão de clientes podem inserir documentos"
  ON public.cliente_ficha_documentos FOR INSERT
  WITH CHECK (
    public.has_permission(auth.uid(), 'clientes'::modulo, 'criar'::acao_permissao)
  );

CREATE POLICY "Usuários com permissão de clientes podem editar documentos"
  ON public.cliente_ficha_documentos FOR UPDATE
  USING (public.has_permission(auth.uid(), 'clientes'::modulo, 'editar'::acao_permissao));

CREATE POLICY "Usuários com permissão de clientes podem excluir documentos"
  ON public.cliente_ficha_documentos FOR DELETE
  USING (public.has_permission(auth.uid(), 'clientes'::modulo, 'excluir'::acao_permissao));

-- 3. Bucket privado para arquivos da ficha
INSERT INTO storage.buckets (id, name, public)
VALUES ('fichas-atendimento', 'fichas-atendimento', false)
ON CONFLICT (id) DO NOTHING;

-- Policies do bucket: usuários autenticados podem ler/escrever/atualizar/excluir
CREATE POLICY "Ficha docs: leitura para usuários ativos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'fichas-atendimento' AND public.is_authenticated_active());

CREATE POLICY "Ficha docs: upload para quem cria clientes"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'fichas-atendimento'
    AND public.has_permission(auth.uid(), 'clientes'::modulo, 'criar'::acao_permissao)
  );

CREATE POLICY "Ficha docs: update para quem edita clientes"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'fichas-atendimento'
    AND public.has_permission(auth.uid(), 'clientes'::modulo, 'editar'::acao_permissao)
  );

CREATE POLICY "Ficha docs: delete para quem exclui clientes"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'fichas-atendimento'
    AND public.has_permission(auth.uid(), 'clientes'::modulo, 'excluir'::acao_permissao)
  );