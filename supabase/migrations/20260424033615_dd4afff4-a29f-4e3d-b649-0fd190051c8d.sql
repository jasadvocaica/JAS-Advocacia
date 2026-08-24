-- =========================================
-- MÓDULO DOCUMENTOS JURÍDICOS
-- =========================================

-- ENUMS
CREATE TYPE public.doc_categoria AS ENUM (
  'peticao_inicial','recurso','manifestacao','contrato',
  'procuracao','administrativo_inss','quesitos','notificacao','outro'
);

CREATE TYPE public.doc_area_direito AS ENUM (
  'previdenciario','familia','civil','trabalhista',
  'tributario','consumidor','geral'
);

CREATE TYPE public.doc_peca_status AS ENUM (
  'rascunho','em_revisao','revisado','finalizado','protocolado'
);

CREATE TYPE public.doc_variavel_fonte AS ENUM (
  'fixo','processo','cliente','advogado','manual'
);

-- =========================================
-- TABELA: doc_modelos
-- =========================================
CREATE TABLE public.doc_modelos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descricao TEXT,
  categoria public.doc_categoria NOT NULL,
  area_direito public.doc_area_direito DEFAULT 'geral',
  conteudo_html TEXT NOT NULL DEFAULT '',
  variaveis_usadas TEXT[] DEFAULT '{}',
  fonte TEXT DEFAULT 'Bookman Old Style',
  tamanho_fonte INTEGER DEFAULT 12,
  margem_superior INTEGER DEFAULT 1440,
  margem_inferior INTEGER DEFAULT 1440,
  margem_esquerda INTEGER DEFAULT 1800,
  margem_direita INTEGER DEFAULT 1080,
  espacamento_entre_linhas NUMERIC(3,1) DEFAULT 1.5,
  ativo BOOLEAN NOT NULL DEFAULT true,
  uso_count INTEGER NOT NULL DEFAULT 0,
  criado_por UUID,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_doc_modelos_categoria ON public.doc_modelos(categoria);
CREATE INDEX idx_doc_modelos_area ON public.doc_modelos(area_direito);
CREATE INDEX idx_doc_modelos_ativo ON public.doc_modelos(ativo);

ALTER TABLE public.doc_modelos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ver modelos" ON public.doc_modelos FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'documentos'::modulo, 'visualizar'::acao_permissao));
CREATE POLICY "criar modelos" ON public.doc_modelos FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'documentos'::modulo, 'criar'::acao_permissao));
CREATE POLICY "editar modelos" ON public.doc_modelos FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'documentos'::modulo, 'editar'::acao_permissao));
CREATE POLICY "excluir modelos" ON public.doc_modelos FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'documentos'::modulo, 'excluir'::acao_permissao));

CREATE TRIGGER trg_doc_modelos_updated
  BEFORE UPDATE ON public.doc_modelos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- TABELA: doc_pecas
-- =========================================
CREATE TABLE public.doc_pecas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  categoria public.doc_categoria NOT NULL,
  processo_id UUID NOT NULL REFERENCES public.processos(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  modelo_id UUID REFERENCES public.doc_modelos(id) ON DELETE SET NULL,
  conteudo_html TEXT NOT NULL DEFAULT '',
  status public.doc_peca_status NOT NULL DEFAULT 'rascunho',
  versao_atual INTEGER NOT NULL DEFAULT 1,
  fonte TEXT DEFAULT 'Bookman Old Style',
  tamanho_fonte INTEGER DEFAULT 12,
  margem_superior INTEGER DEFAULT 1440,
  margem_inferior INTEGER DEFAULT 1440,
  margem_esquerda INTEGER DEFAULT 1800,
  margem_direita INTEGER DEFAULT 1080,
  espacamento_entre_linhas NUMERIC(3,1) DEFAULT 1.5,
  url_docx TEXT,
  url_pdf TEXT,
  elaborado_por UUID,
  revisado_por UUID,
  finalizado_por UUID,
  finalizado_em TIMESTAMPTZ,
  protocolado_em DATE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_doc_pecas_processo ON public.doc_pecas(processo_id);
CREATE INDEX idx_doc_pecas_cliente ON public.doc_pecas(cliente_id);
CREATE INDEX idx_doc_pecas_status ON public.doc_pecas(status);
CREATE INDEX idx_doc_pecas_elaborado ON public.doc_pecas(elaborado_por);

ALTER TABLE public.doc_pecas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ver pecas" ON public.doc_pecas FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'documentos'::modulo, 'visualizar'::acao_permissao));
CREATE POLICY "criar pecas" ON public.doc_pecas FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'documentos'::modulo, 'criar'::acao_permissao));
CREATE POLICY "editar pecas" ON public.doc_pecas FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'documentos'::modulo, 'editar'::acao_permissao));
CREATE POLICY "excluir pecas" ON public.doc_pecas FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'documentos'::modulo, 'excluir'::acao_permissao));

CREATE TRIGGER trg_doc_pecas_updated
  BEFORE UPDATE ON public.doc_pecas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- TABELA: doc_pecas_versoes
-- =========================================
CREATE TABLE public.doc_pecas_versoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  peca_id UUID NOT NULL REFERENCES public.doc_pecas(id) ON DELETE CASCADE,
  numero_versao INTEGER NOT NULL,
  nome_versao TEXT,
  conteudo_html TEXT NOT NULL,
  salvo_por UUID,
  salvo_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(peca_id, numero_versao)
);

CREATE INDEX idx_doc_versoes_peca ON public.doc_pecas_versoes(peca_id);

ALTER TABLE public.doc_pecas_versoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ver versoes" ON public.doc_pecas_versoes FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'documentos'::modulo, 'visualizar'::acao_permissao));
CREATE POLICY "criar versoes" ON public.doc_pecas_versoes FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'documentos'::modulo, 'editar'::acao_permissao));
CREATE POLICY "excluir versoes" ON public.doc_pecas_versoes FOR DELETE TO authenticated
  USING (public.is_gestor(auth.uid()));

-- =========================================
-- TABELA: doc_comentarios
-- =========================================
CREATE TABLE public.doc_comentarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  peca_id UUID NOT NULL REFERENCES public.doc_pecas(id) ON DELETE CASCADE,
  trecho_texto TEXT,
  comentario TEXT NOT NULL,
  resolvido BOOLEAN NOT NULL DEFAULT false,
  autor_id UUID,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolvido_em TIMESTAMPTZ,
  resolvido_por UUID
);

CREATE INDEX idx_doc_comentarios_peca ON public.doc_comentarios(peca_id);

ALTER TABLE public.doc_comentarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ver comentarios docs" ON public.doc_comentarios FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'documentos'::modulo, 'visualizar'::acao_permissao));
CREATE POLICY "criar comentarios docs" ON public.doc_comentarios FOR INSERT TO authenticated
  WITH CHECK (autor_id = auth.uid() AND public.has_permission(auth.uid(), 'documentos'::modulo, 'visualizar'::acao_permissao));
CREATE POLICY "editar comentarios docs" ON public.doc_comentarios FOR UPDATE TO authenticated
  USING (autor_id = auth.uid() OR public.is_gestor(auth.uid()));
CREATE POLICY "excluir comentarios docs" ON public.doc_comentarios FOR DELETE TO authenticated
  USING (autor_id = auth.uid() OR public.is_gestor(auth.uid()));

-- =========================================
-- TABELA: doc_variaveis_customizadas
-- =========================================
CREATE TABLE public.doc_variaveis_customizadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chave TEXT UNIQUE NOT NULL,
  nome_legivel TEXT NOT NULL,
  valor_padrao TEXT,
  fonte public.doc_variavel_fonte NOT NULL DEFAULT 'fixo',
  campo_fonte TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.doc_variaveis_customizadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "todos veem variaveis" ON public.doc_variaveis_customizadas FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "gestor gerencia variaveis" ON public.doc_variaveis_customizadas FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid()))
  WITH CHECK (public.is_gestor(auth.uid()));

-- =========================================
-- SEED: variáveis customizadas do escritório
-- =========================================
INSERT INTO public.doc_variaveis_customizadas (chave, nome_legivel, valor_padrao, fonte) VALUES
  ('endereco_escritorio', 'Endereço do escritório', 'Rua São Cristóvão, 315, Poncho Verde II, Primavera do Leste/MT', 'fixo'),
  ('instagram_escritorio', 'Instagram do escritório', '@julianaaraujoadvogada', 'fixo'),
  ('email_escritorio', 'E-mail do escritório', 'advocaciajulianaaraujo@gmail.com', 'fixo'),
  ('whatsapp_escritorio', 'WhatsApp principal', '(66) 99262-4753', 'fixo'),
  ('comarca', 'Comarca', 'Primavera do Leste', 'fixo');

-- =========================================
-- TRIGGER: ao protocolar peça, criar andamento
-- =========================================
CREATE OR REPLACE FUNCTION public.trg_doc_peca_protocolada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'protocolado'
     AND NEW.protocolado_em IS NOT NULL
     AND (OLD.status IS DISTINCT FROM 'protocolado' OR OLD.protocolado_em IS DISTINCT FROM NEW.protocolado_em)
  THEN
    INSERT INTO public.andamentos (
      processo_id, descricao, data, fonte, criado_por
    ) VALUES (
      NEW.processo_id,
      'Peça protocolada: ' || NEW.titulo,
      NEW.protocolado_em,
      'documentos',
      COALESCE(NEW.finalizado_por, auth.uid())
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_doc_pecas_protocolar
  AFTER UPDATE ON public.doc_pecas
  FOR EACH ROW EXECUTE FUNCTION public.trg_doc_peca_protocolada();

-- =========================================
-- STORAGE: bucket producao-juridica
-- =========================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('producao-juridica', 'producao-juridica', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "ver arquivos producao"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'producao-juridica'
  AND public.has_permission(auth.uid(), 'documentos'::modulo, 'visualizar'::acao_permissao)
);

CREATE POLICY "upload arquivos producao"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'producao-juridica'
  AND public.has_permission(auth.uid(), 'documentos'::modulo, 'criar'::acao_permissao)
);

CREATE POLICY "atualizar arquivos producao"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'producao-juridica'
  AND public.has_permission(auth.uid(), 'documentos'::modulo, 'editar'::acao_permissao)
);

CREATE POLICY "excluir arquivos producao"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'producao-juridica'
  AND public.has_permission(auth.uid(), 'documentos'::modulo, 'excluir'::acao_permissao)
);