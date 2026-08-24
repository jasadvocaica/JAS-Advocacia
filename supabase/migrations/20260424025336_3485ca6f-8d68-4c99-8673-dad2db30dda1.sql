-- ============================================================
-- MÓDULO PARCEIROS — extensão e novas tabelas
-- ============================================================

-- 1) Estender tabela parceiros
ALTER TABLE public.parceiros
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'correspondente'
    CHECK (tipo IN ('correspondente','indicador','escritorio')),
  ADD COLUMN IF NOT EXISTS nome_social text,
  ADD COLUMN IF NOT EXISTS oab_numero text,
  ADD COLUMN IF NOT EXISTS oab_seccional text,
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS cidade text,
  ADD COLUMN IF NOT EXISTS estado text,
  ADD COLUMN IF NOT EXISTS especialidades text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS pix_chave text,
  ADD COLUMN IF NOT EXISTS pix_tipo text
    CHECK (pix_tipo IN ('cpf','cnpj','email','telefone','aleatoria')),
  ADD COLUMN IF NOT EXISTS banco_nome text,
  ADD COLUMN IF NOT EXISTS banco_agencia text,
  ADD COLUMN IF NOT EXISTS banco_conta text,
  ADD COLUMN IF NOT EXISTS banco_tipo text
    CHECK (banco_tipo IN ('corrente','poupanca')),
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ativo'
    CHECK (status IN ('ativo','inativo','suspenso')),
  ADD COLUMN IF NOT EXISTS observacoes_internas text,
  ADD COLUMN IF NOT EXISTS portal_ativo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS portal_senha_hash text,
  ADD COLUMN IF NOT EXISTS portal_ultimo_acesso timestamptz,
  ADD COLUMN IF NOT EXISTS portal_token_convite text,
  ADD COLUMN IF NOT EXISTS portal_convite_expira_em timestamptz,
  ADD COLUMN IF NOT EXISTS escritorio_parceiro_id uuid REFERENCES public.parceiros(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS criado_por uuid;

-- Coluna gerada para OAB completa (formato OAB/UF 00.000)
ALTER TABLE public.parceiros
  ADD COLUMN IF NOT EXISTS oab_completo text
    GENERATED ALWAYS AS (
      CASE
        WHEN oab_numero IS NOT NULL AND oab_seccional IS NOT NULL
        THEN 'OAB/' || oab_seccional || ' ' || oab_numero
        ELSE NULL
      END
    ) STORED;

-- Manter compat: se ativo=false, status passa a 'inativo'
UPDATE public.parceiros SET status = 'inativo' WHERE ativo = false AND status = 'ativo';

CREATE INDEX IF NOT EXISTS idx_parceiros_status ON public.parceiros(status);
CREATE INDEX IF NOT EXISTS idx_parceiros_tipo ON public.parceiros(tipo);
CREATE INDEX IF NOT EXISTS idx_parceiros_estado ON public.parceiros(estado);

-- ============================================================
-- 2) processo_parceiros — vínculo processo ↔ parceiro
-- ============================================================
CREATE TABLE IF NOT EXISTS public.processo_parceiros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id uuid NOT NULL REFERENCES public.processos(id) ON DELETE CASCADE,
  parceiro_id uuid NOT NULL REFERENCES public.parceiros(id),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),

  tipo_participacao text NOT NULL CHECK (tipo_participacao IN (
    'correspondente','substabelecido','indicador','correspondente_e_indicador'
  )),

  substabelecimento_com_reserva boolean,

  -- Rateio de atuação
  tem_rateio_atuacao boolean NOT NULL DEFAULT false,
  percentual_atuacao numeric(5,2),
  base_rateio text CHECK (base_rateio IN ('total_recebido','apenas_exito','fixo_por_processo')),
  valor_fixo_atuacao numeric(12,2),

  -- Comissão de indicação
  tem_comissao_indicacao boolean NOT NULL DEFAULT false,
  percentual_indicacao numeric(5,2),
  base_comissao text CHECK (base_comissao IN ('honorario_fixo','apenas_exito','total_honorarios')),

  observacao text,
  ativo boolean NOT NULL DEFAULT true,
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),

  UNIQUE(processo_id, parceiro_id)
);

CREATE INDEX IF NOT EXISTS idx_proc_parceiros_parceiro ON public.processo_parceiros(parceiro_id);
CREATE INDEX IF NOT EXISTS idx_proc_parceiros_processo ON public.processo_parceiros(processo_id);
CREATE INDEX IF NOT EXISTS idx_proc_parceiros_cliente ON public.processo_parceiros(cliente_id);

CREATE TRIGGER trg_proc_parceiros_updated
  BEFORE UPDATE ON public.processo_parceiros
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.processo_parceiros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ver vinculos processo parceiros"
  ON public.processo_parceiros FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'processos'::modulo, 'visualizar'::acao_permissao));

CREATE POLICY "criar vinculos processo parceiros"
  ON public.processo_parceiros FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'processos'::modulo, 'editar'::acao_permissao));

CREATE POLICY "editar vinculos processo parceiros"
  ON public.processo_parceiros FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'processos'::modulo, 'editar'::acao_permissao));

CREATE POLICY "excluir vinculos processo parceiros"
  ON public.processo_parceiros FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'processos'::modulo, 'editar'::acao_permissao));

-- ============================================================
-- 3) parceiro_permissoes_processo — preparação portal
-- ============================================================
CREATE TABLE IF NOT EXISTS public.parceiro_permissoes_processo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parceiro_id uuid NOT NULL REFERENCES public.parceiros(id) ON DELETE CASCADE,
  processo_id uuid NOT NULL REFERENCES public.processos(id) ON DELETE CASCADE,

  ver_andamentos boolean NOT NULL DEFAULT true,
  ver_documentos boolean NOT NULL DEFAULT true,
  ver_tarefas_proprias boolean NOT NULL DEFAULT true,
  ver_prazos boolean NOT NULL DEFAULT true,
  ver_financeiro_proprio boolean NOT NULL DEFAULT true,
  comentar_chat boolean NOT NULL DEFAULT true,
  enviar_documentos boolean NOT NULL DEFAULT false,

  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE(parceiro_id, processo_id)
);

CREATE INDEX IF NOT EXISTS idx_perm_parceiro ON public.parceiro_permissoes_processo(parceiro_id);

ALTER TABLE public.parceiro_permissoes_processo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gestor configura permissoes parceiro"
  ON public.parceiro_permissoes_processo FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid()))
  WITH CHECK (public.is_gestor(auth.uid()));

CREATE POLICY "equipe ve permissoes parceiro"
  ON public.parceiro_permissoes_processo FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'parceiros'::modulo, 'visualizar'::acao_permissao));

-- ============================================================
-- 4) parceiro_log_acesso — log do portal (futuro)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.parceiro_log_acesso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parceiro_id uuid NOT NULL REFERENCES public.parceiros(id),
  acao text NOT NULL,
  processo_id uuid REFERENCES public.processos(id),
  ip text,
  user_agent text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parceiro_log_parceiro ON public.parceiro_log_acesso(parceiro_id);
CREATE INDEX IF NOT EXISTS idx_parceiro_log_criado ON public.parceiro_log_acesso(criado_em DESC);

ALTER TABLE public.parceiro_log_acesso ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gestor le log parceiro"
  ON public.parceiro_log_acesso FOR SELECT TO authenticated
  USING (public.is_gestor(auth.uid()));

CREATE POLICY "sistema insere log parceiro"
  ON public.parceiro_log_acesso FOR INSERT TO authenticated
  WITH CHECK (true);

-- ============================================================
-- 5) Política adicional: gestor/advogado editam parceiros
-- ============================================================
DROP POLICY IF EXISTS "gestor gerencia parceiros" ON public.parceiros;

CREATE POLICY "gestor advogado cria parceiros"
  ON public.parceiros FOR INSERT TO authenticated
  WITH CHECK (
    public.is_gestor(auth.uid())
    OR public.has_role(auth.uid(), 'advogado'::app_role)
  );

CREATE POLICY "gestor advogado edita parceiros"
  ON public.parceiros FOR UPDATE TO authenticated
  USING (
    public.is_gestor(auth.uid())
    OR public.has_role(auth.uid(), 'advogado'::app_role)
  );

CREATE POLICY "gestor exclui parceiros"
  ON public.parceiros FOR DELETE TO authenticated
  USING (public.is_gestor(auth.uid()));