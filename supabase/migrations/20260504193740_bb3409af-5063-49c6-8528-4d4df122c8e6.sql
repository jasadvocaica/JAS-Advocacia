
CREATE TYPE public.comissao_beneficiario_tipo AS ENUM ('estagiaria','parceiro');
CREATE TYPE public.comissao_evento AS ENUM ('indicacao_fechada','contrato_assinado','caso_encaminhado');
CREATE TYPE public.comissao_base AS ENUM ('honorarios_brutos','valor_recebido');
CREATE TYPE public.comissao_status AS ENUM ('a_pagar','pago');

CREATE TABLE public.regras_comissao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  beneficiario TEXT NOT NULL,
  tipo_beneficiario public.comissao_beneficiario_tipo NOT NULL,
  tipo_evento public.comissao_evento NOT NULL,
  percentual NUMERIC(5,2),
  valor_fixo NUMERIC(12,2),
  base_calculo public.comissao_base NOT NULL DEFAULT 'honorarios_brutos',
  ativo BOOLEAN NOT NULL DEFAULT true,
  observacao TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (percentual IS NOT NULL OR valor_fixo IS NOT NULL)
);

CREATE TABLE public.comissoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  beneficiario TEXT NOT NULL,
  tipo_beneficiario public.comissao_beneficiario_tipo NOT NULL,
  caso_id UUID REFERENCES public.processos(id) ON DELETE SET NULL,
  evento_gerador public.comissao_evento NOT NULL,
  valor_honorarios NUMERIC(12,2) NOT NULL CHECK (valor_honorarios >= 0),
  percentual_aplicado NUMERIC(5,2),
  valor_comissao NUMERIC(12,2) NOT NULL CHECK (valor_comissao >= 0),
  data_competencia DATE NOT NULL,
  status public.comissao_status NOT NULL DEFAULT 'a_pagar',
  data_pagamento DATE,
  forma_pagamento TEXT,
  observacao TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_comissoes_beneficiario ON public.comissoes(beneficiario);
CREATE INDEX idx_comissoes_status ON public.comissoes(status);
CREATE INDEX idx_comissoes_caso ON public.comissoes(caso_id);
CREATE INDEX idx_comissoes_competencia ON public.comissoes(data_competencia);

ALTER TABLE public.regras_comissao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comissoes ENABLE ROW LEVEL SECURITY;

-- regras_comissao
CREATE POLICY "Equipe interna pode ver regras de comissão"
ON public.regras_comissao FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'gestor'::app_role)
  OR public.has_role(auth.uid(),'advogado'::app_role)
  OR public.has_role(auth.uid(),'controladoria'::app_role)
  OR public.has_role(auth.uid(),'administrativo'::app_role)
  OR public.has_role(auth.uid(),'estagiario'::app_role)
);
CREATE POLICY "Equipe pode criar regras de comissão"
ON public.regras_comissao FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(),'gestor'::app_role)
  OR public.has_role(auth.uid(),'advogado'::app_role)
  OR public.has_role(auth.uid(),'controladoria'::app_role)
);
CREATE POLICY "Equipe pode editar regras de comissão"
ON public.regras_comissao FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(),'gestor'::app_role)
  OR public.has_role(auth.uid(),'advogado'::app_role)
  OR public.has_role(auth.uid(),'controladoria'::app_role)
);
CREATE POLICY "Equipe pode excluir regras de comissão"
ON public.regras_comissao FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(),'gestor'::app_role)
  OR public.has_role(auth.uid(),'advogado'::app_role)
  OR public.has_role(auth.uid(),'controladoria'::app_role)
);

-- comissoes
CREATE POLICY "Equipe interna pode ver comissões"
ON public.comissoes FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'gestor'::app_role)
  OR public.has_role(auth.uid(),'advogado'::app_role)
  OR public.has_role(auth.uid(),'controladoria'::app_role)
  OR public.has_role(auth.uid(),'administrativo'::app_role)
  OR public.has_role(auth.uid(),'estagiario'::app_role)
);
CREATE POLICY "Equipe pode lançar comissões"
ON public.comissoes FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(),'gestor'::app_role)
  OR public.has_role(auth.uid(),'advogado'::app_role)
  OR public.has_role(auth.uid(),'controladoria'::app_role)
);
CREATE POLICY "Equipe pode editar comissões"
ON public.comissoes FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(),'gestor'::app_role)
  OR public.has_role(auth.uid(),'advogado'::app_role)
  OR public.has_role(auth.uid(),'controladoria'::app_role)
);
CREATE POLICY "Equipe pode excluir comissões"
ON public.comissoes FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(),'gestor'::app_role)
  OR public.has_role(auth.uid(),'controladoria'::app_role)
);

CREATE TRIGGER trg_regras_comissao_updated_at
BEFORE UPDATE ON public.regras_comissao
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_comissoes_updated_at
BEFORE UPDATE ON public.comissoes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
