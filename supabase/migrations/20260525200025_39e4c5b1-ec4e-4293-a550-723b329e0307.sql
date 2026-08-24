
-- % padrão de comissão de fechamento por membro
ALTER TABLE public.equipe_membros
  ADD COLUMN IF NOT EXISTS percentual_comissao_fechamento NUMERIC(5,2) DEFAULT 0;

-- Enum status
DO $$ BEGIN
  CREATE TYPE public.status_comissao_fechamento AS ENUM ('pendente','calculada','confirmada','cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tabela principal
CREATE TABLE IF NOT EXISTS public.clientes_comissoes_fechamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  fechador_user_id UUID NOT NULL,
  contrato_id UUID REFERENCES public.honorarios_contratos(id) ON DELETE SET NULL,
  valor_base NUMERIC(12,2),
  percentual NUMERIC(5,2),
  valor_comissao NUMERIC(12,2),
  status public.status_comissao_fechamento NOT NULL DEFAULT 'pendente',
  data_confirmacao DATE,
  observacao TEXT,
  lancado_por UUID,
  lancado_em TIMESTAMPTZ,
  criado_por UUID,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cliente_id)
);

CREATE INDEX IF NOT EXISTS idx_ccf_fechador ON public.clientes_comissoes_fechamento(fechador_user_id);
CREATE INDEX IF NOT EXISTS idx_ccf_status ON public.clientes_comissoes_fechamento(status);
CREATE INDEX IF NOT EXISTS idx_ccf_contrato ON public.clientes_comissoes_fechamento(contrato_id);

CREATE TRIGGER trg_ccf_updated BEFORE UPDATE ON public.clientes_comissoes_fechamento
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.clientes_comissoes_fechamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestores acessam comissoes fechamento"
  ON public.clientes_comissoes_fechamento
  FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid()))
  WITH CHECK (public.is_gestor(auth.uid()));

-- Trigger: criar pendência ao cadastrar cliente fechado por não-gestor
CREATE OR REPLACE FUNCTION public.trg_criar_comissao_fechamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pct NUMERIC(5,2);
BEGIN
  IF NEW.criado_por IS NULL THEN RETURN NEW; END IF;
  IF public.is_gestor(NEW.criado_por) THEN RETURN NEW; END IF;

  SELECT em.percentual_comissao_fechamento INTO v_pct
  FROM public.equipe_membros em
  WHERE em.user_id = NEW.criado_por AND em.status = 'ativo'
  LIMIT 1;

  -- só registra se a pessoa faz parte da equipe interna
  IF NOT FOUND THEN RETURN NEW; END IF;

  INSERT INTO public.clientes_comissoes_fechamento (
    cliente_id, fechador_user_id, percentual, status, criado_por
  ) VALUES (
    NEW.id, NEW.criado_por, COALESCE(v_pct, 0), 'pendente', NEW.criado_por
  ) ON CONFLICT (cliente_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cliente_criar_comissao_fechamento ON public.clientes;
CREATE TRIGGER trg_cliente_criar_comissao_fechamento
  AFTER INSERT ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.trg_criar_comissao_fechamento();

-- Trigger: confirmar comissão ao registrar pagamento do contrato vinculado
CREATE OR REPLACE FUNCTION public.trg_confirmar_comissao_fechamento_pagamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.clientes_comissoes_fechamento
  SET status = 'confirmada',
      data_confirmacao = COALESCE(NEW.data_pagamento, CURRENT_DATE),
      atualizado_em = now()
  WHERE contrato_id = NEW.contrato_id
    AND status IN ('pendente','calculada');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pagamento_confirmar_comissao_fechamento ON public.honorarios_pagamentos;
CREATE TRIGGER trg_pagamento_confirmar_comissao_fechamento
  AFTER INSERT ON public.honorarios_pagamentos
  FOR EACH ROW EXECUTE FUNCTION public.trg_confirmar_comissao_fechamento_pagamento();

-- Backfill: gera pendências para clientes já existentes criados por equipe (não-gestores)
INSERT INTO public.clientes_comissoes_fechamento (cliente_id, fechador_user_id, percentual, status, criado_por)
SELECT c.id, c.criado_por, COALESCE(em.percentual_comissao_fechamento, 0), 'pendente', c.criado_por
FROM public.clientes c
JOIN public.equipe_membros em ON em.user_id = c.criado_por AND em.status = 'ativo'
WHERE c.criado_por IS NOT NULL
  AND NOT public.is_gestor(c.criado_por)
  AND NOT EXISTS (SELECT 1 FROM public.clientes_comissoes_fechamento x WHERE x.cliente_id = c.id)
ON CONFLICT (cliente_id) DO NOTHING;
