
-- 1) Campos extras em equipe_membros
ALTER TABLE public.equipe_membros
  ADD COLUMN IF NOT EXISTS rg TEXT,
  ADD COLUMN IF NOT EXISTS estado_civil TEXT,
  ADD COLUMN IF NOT EXISTS escolaridade TEXT,
  ADD COLUMN IF NOT EXISTS dependentes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS endereco_cep TEXT,
  ADD COLUMN IF NOT EXISTS endereco_logradouro TEXT,
  ADD COLUMN IF NOT EXISTS endereco_numero TEXT,
  ADD COLUMN IF NOT EXISTS endereco_complemento TEXT,
  ADD COLUMN IF NOT EXISTS endereco_bairro TEXT,
  ADD COLUMN IF NOT EXISTS endereco_cidade TEXT,
  ADD COLUMN IF NOT EXISTS endereco_estado TEXT,
  ADD COLUMN IF NOT EXISTS contato_emergencia_nome TEXT,
  ADD COLUMN IF NOT EXISTS contato_emergencia_telefone TEXT,
  ADD COLUMN IF NOT EXISTS contato_emergencia_parentesco TEXT;

-- 2) Tabela de benefícios fixos
CREATE TABLE IF NOT EXISTS public.equipe_beneficios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id UUID NOT NULL REFERENCES public.equipe_membros(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,                -- 'vr','vt','saude','odontologico','auxilio_creche','outro'
  descricao TEXT,
  valor_mensal NUMERIC(12,2) NOT NULL DEFAULT 0,
  natureza TEXT NOT NULL DEFAULT 'credito',  -- 'credito' soma na folha, 'debito' desconta
  data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  data_fim DATE,
  observacao TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por UUID,
  CONSTRAINT equipe_beneficios_natureza_chk CHECK (natureza IN ('credito','debito')),
  CONSTRAINT equipe_beneficios_valor_chk CHECK (valor_mensal >= 0)
);
CREATE INDEX IF NOT EXISTS idx_equipe_beneficios_membro ON public.equipe_beneficios(membro_id);
CREATE TRIGGER trg_equipe_beneficios_updated
  BEFORE UPDATE ON public.equipe_beneficios
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.equipe_beneficios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gestor gerencia beneficios equipe"
  ON public.equipe_beneficios FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid()))
  WITH CHECK (public.is_gestor(auth.uid()));

-- 3) Lançamentos avulsos (bônus/descontos pontuais)
CREATE TABLE IF NOT EXISTS public.equipe_lancamentos_folha (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id UUID NOT NULL REFERENCES public.equipe_membros(id) ON DELETE CASCADE,
  mes INTEGER NOT NULL,
  ano INTEGER NOT NULL,
  natureza TEXT NOT NULL,           -- 'bonus' soma | 'desconto' subtrai
  motivo TEXT NOT NULL,
  valor NUMERIC(12,2) NOT NULL DEFAULT 0,
  observacao TEXT,
  aplicado_folha BOOLEAN NOT NULL DEFAULT false,
  folha_id UUID REFERENCES public.equipe_folha_pagamento(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por UUID,
  CONSTRAINT equipe_lancamentos_natureza_chk CHECK (natureza IN ('bonus','desconto')),
  CONSTRAINT equipe_lancamentos_mes_chk CHECK (mes BETWEEN 1 AND 12),
  CONSTRAINT equipe_lancamentos_valor_chk CHECK (valor >= 0)
);
CREATE INDEX IF NOT EXISTS idx_equipe_lanc_membro_mes ON public.equipe_lancamentos_folha(membro_id, ano, mes);
CREATE TRIGGER trg_equipe_lancamentos_updated
  BEFORE UPDATE ON public.equipe_lancamentos_folha
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.equipe_lancamentos_folha ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gestor gerencia lancamentos folha"
  ON public.equipe_lancamentos_folha FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid()))
  WITH CHECK (public.is_gestor(auth.uid()));

-- 4) Documentos do colaborador (metadados)
CREATE TABLE IF NOT EXISTS public.equipe_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id UUID NOT NULL REFERENCES public.equipe_membros(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL,    -- 'rg','cnh','contrato','aso','comprovante','outro'
  nome TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  tamanho_bytes BIGINT,
  observacao TEXT,
  enviado_por UUID,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_equipe_documentos_membro ON public.equipe_documentos(membro_id);

ALTER TABLE public.equipe_documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gestor gerencia documentos equipe"
  ON public.equipe_documentos FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid()))
  WITH CHECK (public.is_gestor(auth.uid()));

-- 5) Bucket privado para os arquivos
INSERT INTO storage.buckets (id, name, public)
VALUES ('equipe-documentos', 'equipe-documentos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Gestor le documentos equipe"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'equipe-documentos' AND public.is_gestor(auth.uid()));

CREATE POLICY "Gestor envia documentos equipe"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'equipe-documentos' AND public.is_gestor(auth.uid()));

CREATE POLICY "Gestor atualiza documentos equipe"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'equipe-documentos' AND public.is_gestor(auth.uid()))
  WITH CHECK (bucket_id = 'equipe-documentos' AND public.is_gestor(auth.uid()));

CREATE POLICY "Gestor remove documentos equipe"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'equipe-documentos' AND public.is_gestor(auth.uid()));
