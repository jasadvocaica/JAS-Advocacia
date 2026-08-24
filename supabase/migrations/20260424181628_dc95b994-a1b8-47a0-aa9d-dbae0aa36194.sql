-- =========================================================
-- Gestão de Pessoas — Fase 1: Ponto, Banco de Horas e Férias
-- =========================================================

-- 1) Configuração de jornada por membro
CREATE TABLE public.gp_ponto_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id UUID NOT NULL UNIQUE REFERENCES public.equipe_membros(id) ON DELETE CASCADE,
  dias_trabalho TEXT[] NOT NULL DEFAULT ARRAY['seg','ter','qua','qui','sex'],
  horas_diarias NUMERIC(4,2) NOT NULL DEFAULT 8.0,
  horario_entrada TIME NOT NULL DEFAULT '08:00',
  horario_saida TIME NOT NULL DEFAULT '18:00',
  intervalo_almoco_minutos INTEGER NOT NULL DEFAULT 60,
  tolerancia_entrada_minutos INTEGER NOT NULL DEFAULT 10,
  banco_horas_ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.gp_ponto_config ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_gp_ponto_config_upd
BEFORE UPDATE ON public.gp_ponto_config
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Registros diários de ponto
CREATE TABLE public.gp_ponto_registros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id UUID NOT NULL REFERENCES public.equipe_membros(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  entrada TIME,
  saida_almoco TIME,
  retorno_almoco TIME,
  saida TIME,
  horas_trabalhadas NUMERIC(5,2),
  horas_esperadas NUMERIC(5,2) NOT NULL DEFAULT 8,
  horas_extras NUMERIC(5,2) NOT NULL DEFAULT 0,
  horas_falta NUMERIC(5,2) NOT NULL DEFAULT 0,
  tipo_registro TEXT NOT NULL DEFAULT 'manual'
    CHECK (tipo_registro IN ('manual','auto','correcao')),
  justificativa TEXT,
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','aprovado','ajustado')),
  aprovado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  aprovado_em TIMESTAMPTZ,
  registrado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(membro_id, data)
);

CREATE INDEX idx_gp_ponto_membro_data ON public.gp_ponto_registros(membro_id, data DESC);
CREATE INDEX idx_gp_ponto_status ON public.gp_ponto_registros(status) WHERE status = 'pendente';

ALTER TABLE public.gp_ponto_registros ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_gp_ponto_registros_upd
BEFORE UPDATE ON public.gp_ponto_registros
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Banco de horas (lançamentos)
CREATE TABLE public.gp_banco_horas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id UUID NOT NULL REFERENCES public.equipe_membros(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  horas NUMERIC(5,2) NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('credito','debito','compensacao','expiracao')),
  descricao TEXT,
  registro_ponto_id UUID REFERENCES public.gp_ponto_registros(id) ON DELETE SET NULL,
  aprovado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  criado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gp_banco_horas_membro ON public.gp_banco_horas(membro_id, data DESC);

ALTER TABLE public.gp_banco_horas ENABLE ROW LEVEL SECURITY;

-- View de saldo do banco de horas
CREATE VIEW public.gp_banco_horas_saldo AS
SELECT
  membro_id,
  COALESCE(SUM(horas), 0)::numeric(7,2) AS saldo_total,
  COALESCE(SUM(CASE WHEN horas > 0 THEN horas ELSE 0 END), 0)::numeric(7,2) AS total_creditos,
  COALESCE(SUM(CASE WHEN horas < 0 THEN ABS(horas) ELSE 0 END), 0)::numeric(7,2) AS total_debitos
FROM public.gp_banco_horas
GROUP BY membro_id;

-- 4) Férias (período aquisitivo + gozo)
CREATE TABLE public.gp_ferias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id UUID NOT NULL REFERENCES public.equipe_membros(id) ON DELETE CASCADE,
  periodo_aquisitivo_inicio DATE NOT NULL,
  periodo_aquisitivo_fim DATE NOT NULL,
  data_inicio DATE,
  data_fim DATE,
  dias_gozados INTEGER,
  dias_direito INTEGER NOT NULL DEFAULT 30,
  dias_vendidos INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','a_gozar','agendado','em_gozo','concluido','vencido')),
  observacao TEXT,
  aprovado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  aprovado_em TIMESTAMPTZ,
  criado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gp_ferias_membro ON public.gp_ferias(membro_id, periodo_aquisitivo_inicio DESC);
CREATE INDEX idx_gp_ferias_status ON public.gp_ferias(status);

ALTER TABLE public.gp_ferias ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_gp_ferias_upd
BEFORE UPDATE ON public.gp_ferias
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5) Afastamentos (atestados, licenças, etc.)
CREATE TABLE public.gp_afastamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id UUID NOT NULL REFERENCES public.equipe_membros(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN (
    'atestado_medico','licenca_maternidade','licenca_paternidade',
    'acidente_trabalho','licenca_sem_vencimento','declaracao_comparecimento','outro'
  )),
  data_inicio DATE NOT NULL,
  data_fim DATE,
  dias_afastamento INTEGER,
  cid TEXT,
  documento_url TEXT,
  observacao TEXT,
  status TEXT NOT NULL DEFAULT 'ativo'
    CHECK (status IN ('ativo','encerrado','cancelado')),
  registrado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gp_afastamentos_membro ON public.gp_afastamentos(membro_id, data_inicio DESC);

ALTER TABLE public.gp_afastamentos ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_gp_afastamentos_upd
BEFORE UPDATE ON public.gp_afastamentos
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- Função auxiliar: obter membro_id do usuário logado
-- =========================================================
CREATE OR REPLACE FUNCTION public.gp_membro_id_do_usuario(_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.equipe_membros WHERE user_id = _user_id LIMIT 1
$$;

-- =========================================================
-- RLS POLICIES
-- =========================================================

-- gp_ponto_config
CREATE POLICY "Gestor gerencia config de ponto" ON public.gp_ponto_config
  FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid()))
  WITH CHECK (public.is_gestor(auth.uid()));

CREATE POLICY "Membro vê própria config" ON public.gp_ponto_config
  FOR SELECT TO authenticated
  USING (membro_id = public.gp_membro_id_do_usuario(auth.uid()));

-- gp_ponto_registros
CREATE POLICY "Gestor gerencia registros de ponto" ON public.gp_ponto_registros
  FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid()))
  WITH CHECK (public.is_gestor(auth.uid()));

CREATE POLICY "Membro vê próprios registros" ON public.gp_ponto_registros
  FOR SELECT TO authenticated
  USING (membro_id = public.gp_membro_id_do_usuario(auth.uid()));

-- gp_banco_horas
CREATE POLICY "Gestor gerencia banco de horas" ON public.gp_banco_horas
  FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid()))
  WITH CHECK (public.is_gestor(auth.uid()));

CREATE POLICY "Membro vê próprio banco de horas" ON public.gp_banco_horas
  FOR SELECT TO authenticated
  USING (membro_id = public.gp_membro_id_do_usuario(auth.uid()));

-- gp_ferias
CREATE POLICY "Gestor gerencia férias" ON public.gp_ferias
  FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid()))
  WITH CHECK (public.is_gestor(auth.uid()));

CREATE POLICY "Membro vê próprias férias" ON public.gp_ferias
  FOR SELECT TO authenticated
  USING (membro_id = public.gp_membro_id_do_usuario(auth.uid()));

-- gp_afastamentos
CREATE POLICY "Gestor gerencia afastamentos" ON public.gp_afastamentos
  FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid()))
  WITH CHECK (public.is_gestor(auth.uid()));

CREATE POLICY "Membro vê próprios afastamentos" ON public.gp_afastamentos
  FOR SELECT TO authenticated
  USING (membro_id = public.gp_membro_id_do_usuario(auth.uid()));

-- =========================================================
-- Trigger: ao registrar ponto, calcular horas trabalhadas
-- =========================================================
CREATE OR REPLACE FUNCTION public.gp_calcular_horas_ponto()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_minutos_total INTEGER := 0;
  v_minutos_almoco INTEGER := 0;
  v_horas NUMERIC(5,2);
BEGIN
  IF NEW.entrada IS NOT NULL AND NEW.saida IS NOT NULL THEN
    v_minutos_total := EXTRACT(EPOCH FROM (NEW.saida - NEW.entrada))::int / 60;
    IF NEW.saida_almoco IS NOT NULL AND NEW.retorno_almoco IS NOT NULL THEN
      v_minutos_almoco := EXTRACT(EPOCH FROM (NEW.retorno_almoco - NEW.saida_almoco))::int / 60;
    END IF;
    v_horas := GREATEST((v_minutos_total - v_minutos_almoco)::numeric / 60.0, 0)::numeric(5,2);
    NEW.horas_trabalhadas := v_horas;
    NEW.horas_extras := GREATEST(v_horas - COALESCE(NEW.horas_esperadas, 8), 0)::numeric(5,2);
    NEW.horas_falta := GREATEST(COALESCE(NEW.horas_esperadas, 8) - v_horas, 0)::numeric(5,2);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_gp_calcular_horas_ponto
BEFORE INSERT OR UPDATE ON public.gp_ponto_registros
FOR EACH ROW EXECUTE FUNCTION public.gp_calcular_horas_ponto();