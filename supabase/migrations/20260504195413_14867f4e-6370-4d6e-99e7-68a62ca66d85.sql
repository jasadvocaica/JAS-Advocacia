
DO $$ BEGIN CREATE TYPE public.saida_origem AS ENUM ('manual','repasse','comissao'); EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE public.financeiro_saidas
  ADD COLUMN IF NOT EXISTS origem public.saida_origem NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS origem_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_saidas_origem ON public.financeiro_saidas(origem, origem_id) WHERE origem_id IS NOT NULL;

-- Função para sincronizar repasse -> saída
CREATE OR REPLACE FUNCTION public.sync_saida_repasse()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fornecedor TEXT;
  v_status public.saida_status;
BEGIN
  SELECT COALESCE(p.nome, 'Parceiro') INTO v_fornecedor
  FROM public.parceiros p WHERE p.id = NEW.parceiro_id;

  v_status := CASE
    WHEN NEW.status = 'pago' THEN 'pago'::public.saida_status
    WHEN NEW.status = 'cancelado' THEN 'cancelado'::public.saida_status
    ELSE 'pendente'::public.saida_status
  END;

  INSERT INTO public.financeiro_saidas (
    descricao, categoria, valor, data_competencia, data_pagamento, forma_pagamento,
    status, fornecedor, observacao, origem, origem_id
  ) VALUES (
    'Repasse a parceiro: ' || COALESCE(v_fornecedor,'—'),
    'servicos'::public.saida_categoria,
    NEW.valor_repasse,
    COALESCE(NEW.data_repasse, CURRENT_DATE),
    NEW.data_repasse,
    NEW.forma_repasse,
    v_status,
    v_fornecedor,
    NEW.observacao,
    'repasse'::public.saida_origem,
    NEW.id
  )
  ON CONFLICT (origem, origem_id) WHERE origem_id IS NOT NULL DO UPDATE SET
    valor = EXCLUDED.valor,
    data_competencia = EXCLUDED.data_competencia,
    data_pagamento = EXCLUDED.data_pagamento,
    forma_pagamento = EXCLUDED.forma_pagamento,
    status = EXCLUDED.status,
    fornecedor = EXCLUDED.fornecedor,
    observacao = EXCLUDED.observacao,
    updated_at = now();

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_saida_repasse ON public.honorarios_repasses;
CREATE TRIGGER trg_sync_saida_repasse
AFTER INSERT OR UPDATE ON public.honorarios_repasses
FOR EACH ROW EXECUTE FUNCTION public.sync_saida_repasse();

CREATE OR REPLACE FUNCTION public.sync_saida_repasse_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.financeiro_saidas WHERE origem='repasse' AND origem_id = OLD.id;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_sync_saida_repasse_del ON public.honorarios_repasses;
CREATE TRIGGER trg_sync_saida_repasse_del
AFTER DELETE ON public.honorarios_repasses
FOR EACH ROW EXECUTE FUNCTION public.sync_saida_repasse_delete();

-- Função para sincronizar comissão -> saída
CREATE OR REPLACE FUNCTION public.sync_saida_comissao()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status public.saida_status;
BEGIN
  v_status := CASE
    WHEN NEW.status::text = 'pago' THEN 'pago'::public.saida_status
    WHEN NEW.status::text = 'cancelado' THEN 'cancelado'::public.saida_status
    ELSE 'pendente'::public.saida_status
  END;

  INSERT INTO public.financeiro_saidas (
    descricao, categoria, valor, data_competencia, data_pagamento, forma_pagamento,
    status, fornecedor, observacao, origem, origem_id
  ) VALUES (
    'Comissão: ' || COALESCE(NEW.beneficiario,'—'),
    'salarios'::public.saida_categoria,
    NEW.valor_comissao,
    COALESCE(NEW.data_competencia, CURRENT_DATE),
    NEW.data_pagamento,
    NEW.forma_pagamento,
    v_status,
    NEW.beneficiario,
    NEW.observacao,
    'comissao'::public.saida_origem,
    NEW.id
  )
  ON CONFLICT (origem, origem_id) WHERE origem_id IS NOT NULL DO UPDATE SET
    valor = EXCLUDED.valor,
    data_competencia = EXCLUDED.data_competencia,
    data_pagamento = EXCLUDED.data_pagamento,
    forma_pagamento = EXCLUDED.forma_pagamento,
    status = EXCLUDED.status,
    fornecedor = EXCLUDED.fornecedor,
    observacao = EXCLUDED.observacao,
    updated_at = now();

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_saida_comissao ON public.comissoes;
CREATE TRIGGER trg_sync_saida_comissao
AFTER INSERT OR UPDATE ON public.comissoes
FOR EACH ROW EXECUTE FUNCTION public.sync_saida_comissao();

CREATE OR REPLACE FUNCTION public.sync_saida_comissao_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.financeiro_saidas WHERE origem='comissao' AND origem_id = OLD.id;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_sync_saida_comissao_del ON public.comissoes;
CREATE TRIGGER trg_sync_saida_comissao_del
AFTER DELETE ON public.comissoes
FOR EACH ROW EXECUTE FUNCTION public.sync_saida_comissao_delete();

-- Backfill dos já existentes
INSERT INTO public.financeiro_saidas (descricao, categoria, valor, data_competencia, data_pagamento, forma_pagamento, status, fornecedor, observacao, origem, origem_id)
SELECT
  'Repasse a parceiro: ' || COALESCE(p.nome,'—'),
  'servicos', r.valor_repasse, COALESCE(r.data_repasse, CURRENT_DATE), r.data_repasse, r.forma_repasse,
  CASE WHEN r.status='pago' THEN 'pago'::public.saida_status WHEN r.status='cancelado' THEN 'cancelado'::public.saida_status ELSE 'pendente'::public.saida_status END,
  p.nome, r.observacao, 'repasse', r.id
FROM public.honorarios_repasses r LEFT JOIN public.parceiros p ON p.id = r.parceiro_id
ON CONFLICT (origem, origem_id) WHERE origem_id IS NOT NULL DO NOTHING;

INSERT INTO public.financeiro_saidas (descricao, categoria, valor, data_competencia, data_pagamento, forma_pagamento, status, fornecedor, observacao, origem, origem_id)
SELECT
  'Comissão: ' || COALESCE(c.beneficiario,'—'),
  'salarios', c.valor_comissao, COALESCE(c.data_competencia, CURRENT_DATE), c.data_pagamento, c.forma_pagamento,
  CASE WHEN c.status::text='pago' THEN 'pago'::public.saida_status WHEN c.status::text='cancelado' THEN 'cancelado'::public.saida_status ELSE 'pendente'::public.saida_status END,
  c.beneficiario, c.observacao, 'comissao', c.id
FROM public.comissoes c
ON CONFLICT (origem, origem_id) WHERE origem_id IS NOT NULL DO NOTHING;
