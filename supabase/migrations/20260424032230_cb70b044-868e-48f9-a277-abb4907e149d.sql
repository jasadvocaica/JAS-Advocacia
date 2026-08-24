-- ============= MÓDULO EQUIPE =============

-- Enums novos
CREATE TYPE public.cargo_equipe AS ENUM ('gestor', 'advogado', 'estagiario', 'administrativo', 'socio', 'outro');
CREATE TYPE public.tipo_vinculo_equipe AS ENUM ('clt', 'autonomo', 'estagio', 'socio', 'prestador');
CREATE TYPE public.status_membro AS ENUM ('ativo', 'inativo', 'afastado');
CREATE TYPE public.tipo_remuneracao AS ENUM ('fixo', 'comissao', 'misto', 'producao');
CREATE TYPE public.status_folha AS ENUM ('pendente', 'revisado', 'pago');

-- ============= MEMBROS =============
CREATE TABLE public.equipe_membros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE RESTRICT,
  nome TEXT NOT NULL,
  cpf TEXT UNIQUE,
  data_nascimento DATE,
  telefone TEXT,
  email_pessoal TEXT,
  cargo public.cargo_equipe NOT NULL,
  oab_numero TEXT,
  oab_seccional TEXT,
  tipo_vinculo public.tipo_vinculo_equipe NOT NULL,
  data_admissao DATE NOT NULL DEFAULT CURRENT_DATE,
  data_desligamento DATE,
  pix_chave TEXT,
  pix_tipo TEXT CHECK (pix_tipo IN ('cpf','email','telefone','aleatoria')),
  banco_nome TEXT,
  banco_agencia TEXT,
  banco_conta TEXT,
  status public.status_membro NOT NULL DEFAULT 'ativo',
  observacoes_internas TEXT,
  criado_por UUID,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_equipe_user ON public.equipe_membros(user_id);
CREATE INDEX idx_equipe_status ON public.equipe_membros(status);

-- ============= REMUNERAÇÃO =============
CREATE TABLE public.equipe_remuneracao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id UUID NOT NULL REFERENCES public.equipe_membros(id) ON DELETE CASCADE,
  tipo public.tipo_remuneracao NOT NULL,
  valor_fixo NUMERIC(12,2),
  dia_pagamento INTEGER DEFAULT 5 CHECK (dia_pagamento BETWEEN 1 AND 28),
  percentual_exito NUMERIC(5,2),
  valor_por_tarefa NUMERIC(12,2),
  valor_por_processo NUMERIC(12,2),
  data_inicio DATE NOT NULL,
  data_fim DATE,
  observacao TEXT,
  criado_por UUID,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_remuneracao_membro ON public.equipe_remuneracao(membro_id);
CREATE INDEX idx_remuneracao_vigencia ON public.equipe_remuneracao(membro_id, data_fim);

-- ============= METAS =============
CREATE TABLE public.equipe_metas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id UUID NOT NULL REFERENCES public.equipe_membros(id) ON DELETE CASCADE,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano INTEGER NOT NULL,
  meta_tarefas_concluidas INTEGER,
  meta_tarefas_no_prazo_pct NUMERIC(5,2) DEFAULT 90,
  meta_prazos_perdidos INTEGER DEFAULT 0,
  meta_atendimentos INTEGER,
  meta_processos_abertos INTEGER,
  meta_processos_fechados INTEGER,
  meta_pecas_elaboradas INTEGER,
  meta_receita_gerada NUMERIC(12,2),
  meta_nota_minima NUMERIC(3,1) DEFAULT 4.0,
  observacao TEXT,
  criado_por UUID,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(membro_id, mes, ano)
);
CREATE INDEX idx_metas_periodo ON public.equipe_metas(ano, mes);

-- ============= DESEMPENHO =============
CREATE TABLE public.equipe_desempenho (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id UUID NOT NULL REFERENCES public.equipe_membros(id) ON DELETE CASCADE,
  meta_id UUID REFERENCES public.equipe_metas(id) ON DELETE SET NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano INTEGER NOT NULL,
  tarefas_concluidas INTEGER NOT NULL DEFAULT 0,
  tarefas_no_prazo INTEGER NOT NULL DEFAULT 0,
  tarefas_fora_prazo INTEGER NOT NULL DEFAULT 0,
  tarefas_no_prazo_pct NUMERIC(5,2),
  prazos_cumpridos INTEGER NOT NULL DEFAULT 0,
  prazos_perdidos INTEGER NOT NULL DEFAULT 0,
  processos_abertos INTEGER NOT NULL DEFAULT 0,
  processos_fechados INTEGER NOT NULL DEFAULT 0,
  pecas_elaboradas INTEGER NOT NULL DEFAULT 0,
  receita_gerada NUMERIC(12,2) NOT NULL DEFAULT 0,
  atingimento_geral_pct NUMERIC(5,2),
  nota_avaliacao NUMERIC(3,1) CHECK (nota_avaliacao BETWEEN 1.0 AND 5.0),
  pontos_fortes TEXT,
  pontos_melhorar TEXT,
  metas_proximo_mes TEXT,
  avaliado_por UUID,
  avaliado_em TIMESTAMPTZ,
  gerado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(membro_id, mes, ano)
);
CREATE INDEX idx_desempenho_membro ON public.equipe_desempenho(membro_id);
CREATE INDEX idx_desempenho_periodo ON public.equipe_desempenho(ano, mes);

-- ============= FOLHA DE PAGAMENTO =============
CREATE TABLE public.equipe_folha_pagamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id UUID NOT NULL REFERENCES public.equipe_membros(id) ON DELETE CASCADE,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano INTEGER NOT NULL,
  valor_fixo NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_comissao_exito NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_comissao_producao NUMERIC(12,2) NOT NULL DEFAULT 0,
  bonus_manual NUMERIC(12,2) NOT NULL DEFAULT 0,
  desconto_manual NUMERIC(12,2) NOT NULL DEFAULT 0,
  observacao_ajuste TEXT,
  valor_total NUMERIC(12,2) GENERATED ALWAYS AS (
    valor_fixo + valor_comissao_exito + valor_comissao_producao + bonus_manual - desconto_manual
  ) STORED,
  status public.status_folha NOT NULL DEFAULT 'pendente',
  data_pagamento DATE,
  forma_pagamento TEXT CHECK (forma_pagamento IN ('pix','deposito','dinheiro','outro')),
  comprovante_url TEXT,
  gerado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  pago_por UUID,
  pago_em TIMESTAMPTZ,
  UNIQUE(membro_id, mes, ano)
);
CREATE INDEX idx_folha_membro ON public.equipe_folha_pagamento(membro_id);
CREATE INDEX idx_folha_periodo ON public.equipe_folha_pagamento(ano, mes);
CREATE INDEX idx_folha_status ON public.equipe_folha_pagamento(status);

-- ============= COMISSÕES DE ÊXITO =============
CREATE TABLE public.equipe_comissoes_exito (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id UUID NOT NULL REFERENCES public.equipe_membros(id) ON DELETE CASCADE,
  processo_id UUID NOT NULL REFERENCES public.processos(id) ON DELETE CASCADE,
  pagamento_id UUID REFERENCES public.honorarios_pagamentos(id) ON DELETE SET NULL,
  valor_honorario NUMERIC(12,2) NOT NULL,
  percentual_comissao NUMERIC(5,2) NOT NULL,
  valor_comissao NUMERIC(12,2) NOT NULL,
  mes_referencia INTEGER NOT NULL CHECK (mes_referencia BETWEEN 1 AND 12),
  ano_referencia INTEGER NOT NULL,
  incluida_folha BOOLEAN NOT NULL DEFAULT false,
  folha_id UUID REFERENCES public.equipe_folha_pagamento(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_comissoes_membro_periodo ON public.equipe_comissoes_exito(membro_id, ano_referencia, mes_referencia);

-- ============= METAS PADRÃO POR CARGO =============
CREATE TABLE public.equipe_metas_padrao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cargo public.cargo_equipe NOT NULL UNIQUE,
  meta_tarefas_concluidas INTEGER,
  meta_tarefas_no_prazo_pct NUMERIC(5,2) DEFAULT 90,
  meta_atendimentos INTEGER,
  meta_processos_abertos INTEGER,
  meta_processos_fechados INTEGER,
  meta_pecas_elaboradas INTEGER,
  meta_receita_gerada NUMERIC(12,2),
  meta_nota_minima NUMERIC(3,1) DEFAULT 4.0,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============= TRIGGERS updated_at =============
CREATE TRIGGER trg_equipe_membros_updated BEFORE UPDATE ON public.equipe_membros
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_equipe_desempenho_updated BEFORE UPDATE ON public.equipe_desempenho
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============= TRIGGER: gerar comissão de êxito ao registrar pagamento =============
CREATE OR REPLACE FUNCTION public.gerar_comissao_exito_equipe()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_processo_id UUID;
  v_advogado_id UUID;
  v_membro RECORD;
  v_remuneracao RECORD;
  v_valor_comissao NUMERIC(12,2);
  v_data_ref DATE;
BEGIN
  IF NEW.tipo_pagamento <> 'exito' THEN RETURN NEW; END IF;

  SELECT processo_id INTO v_processo_id FROM public.honorarios_contratos WHERE id = NEW.contrato_id;
  IF v_processo_id IS NULL THEN RETURN NEW; END IF;

  SELECT responsavel_id INTO v_advogado_id FROM public.processos WHERE id = v_processo_id;
  IF v_advogado_id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_membro FROM public.equipe_membros
   WHERE user_id = v_advogado_id AND status = 'ativo' LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_data_ref := NEW.data_pagamento;
  SELECT * INTO v_remuneracao FROM public.equipe_remuneracao
   WHERE membro_id = v_membro.id
     AND tipo IN ('comissao','misto')
     AND percentual_exito IS NOT NULL
     AND data_inicio <= v_data_ref
     AND (data_fim IS NULL OR data_fim >= v_data_ref)
   ORDER BY data_inicio DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_valor_comissao := NEW.valor_recebido * (v_remuneracao.percentual_exito / 100);

  INSERT INTO public.equipe_comissoes_exito (
    membro_id, processo_id, pagamento_id,
    valor_honorario, percentual_comissao, valor_comissao,
    mes_referencia, ano_referencia
  ) VALUES (
    v_membro.id, v_processo_id, NEW.id,
    NEW.valor_recebido, v_remuneracao.percentual_exito, v_valor_comissao,
    EXTRACT(MONTH FROM v_data_ref)::int,
    EXTRACT(YEAR FROM v_data_ref)::int
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_gerar_comissao_equipe
  AFTER INSERT ON public.honorarios_pagamentos
  FOR EACH ROW EXECUTE FUNCTION public.gerar_comissao_exito_equipe();

-- ============= RLS =============
ALTER TABLE public.equipe_membros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipe_remuneracao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipe_metas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipe_desempenho ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipe_folha_pagamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipe_comissoes_exito ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipe_metas_padrao ENABLE ROW LEVEL SECURITY;

-- MEMBROS: gestor tudo; demais veem apenas o próprio cadastro (sem observações internas via view se preciso)
CREATE POLICY "gestor_membros_total" ON public.equipe_membros
  FOR ALL USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));
CREATE POLICY "membro_ve_proprio" ON public.equipe_membros
  FOR SELECT USING (user_id = auth.uid());

-- REMUNERAÇÃO: somente gestor
CREATE POLICY "gestor_remuneracao_total" ON public.equipe_remuneracao
  FOR ALL USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));

-- METAS: gestor edita; membro vê as próprias
CREATE POLICY "gestor_metas_total" ON public.equipe_metas
  FOR ALL USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));
CREATE POLICY "membro_ve_proprias_metas" ON public.equipe_metas
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.equipe_membros m WHERE m.id = membro_id AND m.user_id = auth.uid())
  );

-- DESEMPENHO: gestor tudo; membro vê o próprio
CREATE POLICY "gestor_desempenho_total" ON public.equipe_desempenho
  FOR ALL USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));
CREATE POLICY "membro_ve_proprio_desempenho" ON public.equipe_desempenho
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.equipe_membros m WHERE m.id = membro_id AND m.user_id = auth.uid())
  );

-- FOLHA: somente gestor
CREATE POLICY "gestor_folha_total" ON public.equipe_folha_pagamento
  FOR ALL USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));

-- COMISSÕES: gestor tudo; membro vê as próprias
CREATE POLICY "gestor_comissoes_total" ON public.equipe_comissoes_exito
  FOR ALL USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));
CREATE POLICY "membro_ve_proprias_comissoes" ON public.equipe_comissoes_exito
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.equipe_membros m WHERE m.id = membro_id AND m.user_id = auth.uid())
  );

-- METAS PADRÃO: gestor edita; todos veem
CREATE POLICY "gestor_metas_padrao" ON public.equipe_metas_padrao
  FOR ALL USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));
CREATE POLICY "todos_veem_metas_padrao" ON public.equipe_metas_padrao
  FOR SELECT USING (true);

-- ============= SEED metas padrão =============
INSERT INTO public.equipe_metas_padrao (cargo, meta_tarefas_concluidas, meta_tarefas_no_prazo_pct, meta_atendimentos, meta_processos_abertos, meta_processos_fechados, meta_pecas_elaboradas, meta_receita_gerada, meta_nota_minima) VALUES
  ('estagiario',     40, 90, 20, NULL, NULL, 8,  NULL,    4.0),
  ('advogado',       60, 95, 30, 5,    3,    15, 30000,   4.0),
  ('socio',          40, 95, 20, 8,    5,    10, 80000,   4.5),
  ('administrativo', 50, 95, 40, NULL, NULL, NULL, NULL,  4.0),
  ('gestor',         30, 95, 25, NULL, NULL, NULL, NULL,  4.5),
  ('outro',          NULL, 90, NULL, NULL, NULL, NULL, NULL, 4.0);

-- ============= CRON: dia 1 às 02h BRT (05h UTC) =============
SELECT cron.schedule(
  'equipe-job-mensal',
  '0 5 1 * *',
  $$
  SELECT net.http_post(
    url := 'https://fhbmervgidsixgkjylym.supabase.co/functions/v1/equipe-job-mensal',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZoYm1lcnZnaWRzaXhna2p5bHltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5Njg4NzEsImV4cCI6MjA5MjU0NDg3MX0.tSkxAHgQlvqnw2cUjKR9UFvS8CiLcGc-z7EhatDTOp0'),
    body := jsonb_build_object('modo', 'agendado')
  ) AS request_id;
  $$
);