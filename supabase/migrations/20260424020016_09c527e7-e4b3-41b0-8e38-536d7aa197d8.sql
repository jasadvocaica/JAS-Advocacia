-- ============================================================
-- FASE 1 — EXPANSÃO DO MÓDULO CLIENTES
-- ============================================================

-- 1) Novos campos em clientes (todos opcionais para retrocompatibilidade)
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS nome_social TEXT,
  ADD COLUMN IF NOT EXISTS rg TEXT,
  ADD COLUMN IF NOT EXISTS rg_orgao_emissor TEXT,
  ADD COLUMN IF NOT EXISTS rg_data_expedicao DATE,
  ADD COLUMN IF NOT EXISTS estado_civil TEXT,
  ADD COLUMN IF NOT EXISTS escolaridade TEXT,
  ADD COLUMN IF NOT EXISTS nit_pis TEXT,
  ADD COLUMN IF NOT EXISTS cnh_numero TEXT,
  ADD COLUMN IF NOT EXISTS cnh_categoria TEXT,
  ADD COLUMN IF NOT EXISTS cnh_validade DATE,
  ADD COLUMN IF NOT EXISTS profissao TEXT,
  ADD COLUMN IF NOT EXISTS cbo TEXT,
  ADD COLUMN IF NOT EXISTS ultimo_vinculo_emprego DATE,
  ADD COLUMN IF NOT EXISTS renda_mensal NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS membros_familia INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS renda_per_capita NUMERIC(12,2)
    GENERATED ALWAYS AS (
      CASE WHEN COALESCE(membros_familia,0) > 0
           THEN COALESCE(renda_mensal,0) / membros_familia
           ELSE 0 END
    ) STORED,
  ADD COLUMN IF NOT EXISTS whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS telefone_adicional TEXT,
  ADD COLUMN IF NOT EXISTS contato_emergencia_nome TEXT,
  ADD COLUMN IF NOT EXISTS contato_emergencia_parentesco TEXT,
  ADD COLUMN IF NOT EXISTS contato_emergencia_telefone TEXT,
  ADD COLUMN IF NOT EXISTS responsavel_legal_nome TEXT,
  ADD COLUMN IF NOT EXISTS responsavel_legal_cpf TEXT,
  ADD COLUMN IF NOT EXISTS responsavel_legal_parentesco TEXT,
  ADD COLUMN IF NOT EXISTS responsavel_legal_telefone TEXT,
  ADD COLUMN IF NOT EXISTS advogado_responsavel_id UUID,
  ADD COLUMN IF NOT EXISTS origem_detalhe TEXT,
  ADD COLUMN IF NOT EXISTS proximo_contato_data DATE,
  ADD COLUMN IF NOT EXISTS proximo_contato_motivo TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ativo';

-- Backfill: status a partir de "ativo" (boolean) já existente
UPDATE public.clientes
SET status = CASE WHEN ativo THEN 'ativo' ELSE 'inativo' END
WHERE status IS NULL OR status NOT IN ('ativo','inativo','prospecto');

-- Constraint check para status (somente se ainda não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clientes_status_check'
  ) THEN
    ALTER TABLE public.clientes
      ADD CONSTRAINT clientes_status_check
      CHECK (status IN ('ativo','inativo','prospecto'));
  END IF;
END $$;

-- Índices úteis
CREATE INDEX IF NOT EXISTS idx_clientes_status ON public.clientes(status);
CREATE INDEX IF NOT EXISTS idx_clientes_advogado_resp ON public.clientes(advogado_responsavel_id);
CREATE INDEX IF NOT EXISTS idx_clientes_proximo_contato ON public.clientes(proximo_contato_data);

-- ============================================================
-- 2) BENEFÍCIOS INSS POR CLIENTE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cliente_beneficios_inss (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  nb TEXT NOT NULL,
  tipo_beneficio TEXT NOT NULL,
  der DATE,
  dib DATE,
  competencia_inicio DATE,
  valor_mensal NUMERIC(12,2),
  status TEXT NOT NULL DEFAULT 'ativo'
    CHECK (status IN ('ativo','suspenso','cessado','em_analise')),
  observacao TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_beneficios_cliente ON public.cliente_beneficios_inss(cliente_id);
CREATE INDEX IF NOT EXISTS idx_beneficios_nb ON public.cliente_beneficios_inss(nb);

ALTER TABLE public.cliente_beneficios_inss ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ver beneficios" ON public.cliente_beneficios_inss;
CREATE POLICY "ver beneficios"
ON public.cliente_beneficios_inss
FOR SELECT TO authenticated
USING (public.has_permission(auth.uid(), 'clientes'::modulo, 'visualizar'::acao_permissao));

DROP POLICY IF EXISTS "criar beneficios" ON public.cliente_beneficios_inss;
CREATE POLICY "criar beneficios"
ON public.cliente_beneficios_inss
FOR INSERT TO authenticated
WITH CHECK (public.has_permission(auth.uid(), 'clientes'::modulo, 'criar'::acao_permissao));

DROP POLICY IF EXISTS "editar beneficios" ON public.cliente_beneficios_inss;
CREATE POLICY "editar beneficios"
ON public.cliente_beneficios_inss
FOR UPDATE TO authenticated
USING (public.has_permission(auth.uid(), 'clientes'::modulo, 'editar'::acao_permissao));

DROP POLICY IF EXISTS "excluir beneficios" ON public.cliente_beneficios_inss;
CREATE POLICY "excluir beneficios"
ON public.cliente_beneficios_inss
FOR DELETE TO authenticated
USING (public.has_permission(auth.uid(), 'clientes'::modulo, 'excluir'::acao_permissao));

-- Trigger de updated_at
DROP TRIGGER IF EXISTS trg_beneficios_updated ON public.cliente_beneficios_inss;
CREATE TRIGGER trg_beneficios_updated
BEFORE UPDATE ON public.cliente_beneficios_inss
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
