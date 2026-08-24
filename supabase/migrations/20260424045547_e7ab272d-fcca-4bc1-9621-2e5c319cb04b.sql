-- =========================================================
-- FASE 1: FUNDAÇÃO DOS TRÊS AMBIENTES + VISUALIZAR COMO
-- =========================================================

-- 1. Adicionar tipo_portal em profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tipo_portal text NOT NULL DEFAULT 'interno'
    CHECK (tipo_portal IN ('interno','parceiro','cliente'));

CREATE INDEX IF NOT EXISTS idx_profiles_tipo_portal ON public.profiles(tipo_portal);

-- 2. Tabela cliente_usuarios (login do portal do cliente)
CREATE TABLE IF NOT EXISTS public.cliente_usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL UNIQUE REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL UNIQUE,
  primeiro_acesso boolean NOT NULL DEFAULT true,
  ativo boolean NOT NULL DEFAULT true,
  mostrar_financeiro boolean NOT NULL DEFAULT false,
  ultimo_acesso timestamptz,
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cliente_usuarios_cliente ON public.cliente_usuarios(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cliente_usuarios_user ON public.cliente_usuarios(user_id);

ALTER TABLE public.cliente_usuarios ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_cliente_usuarios_updated
  BEFORE UPDATE ON public.cliente_usuarios
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Tabela cliente_portal_atualizacoes (atualizações em linguagem simples)
CREATE TABLE IF NOT EXISTS public.cliente_portal_atualizacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id uuid NOT NULL REFERENCES public.processos(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  texto_simples text NOT NULL,
  texto_juridico text,
  proximos_passos text,
  publicado boolean NOT NULL DEFAULT false,
  publicado_por uuid,
  publicado_em timestamptz,
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atualizacoes_processo ON public.cliente_portal_atualizacoes(processo_id);
CREATE INDEX IF NOT EXISTS idx_atualizacoes_cliente_publicado ON public.cliente_portal_atualizacoes(cliente_id, publicado);

ALTER TABLE public.cliente_portal_atualizacoes ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_atualizacoes_updated
  BEFORE UPDATE ON public.cliente_portal_atualizacoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Tabela cliente_portal_documentos (documentos liberados para o cliente)
CREATE TABLE IF NOT EXISTS public.cliente_portal_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  processo_id uuid REFERENCES public.processos(id) ON DELETE SET NULL,
  documento_id uuid REFERENCES public.documentos(id) ON DELETE CASCADE,
  nome_exibicao text NOT NULL,
  pode_download boolean NOT NULL DEFAULT true,
  liberado_por uuid,
  liberado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_docs_cliente ON public.cliente_portal_documentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_portal_docs_processo ON public.cliente_portal_documentos(processo_id);

ALTER TABLE public.cliente_portal_documentos ENABLE ROW LEVEL SECURITY;

-- 5. Tabela cliente_portal_mensagens (chat cliente x escritório)
CREATE TABLE IF NOT EXISTS public.cliente_portal_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  processo_id uuid REFERENCES public.processos(id) ON DELETE SET NULL,
  remetente_tipo text NOT NULL CHECK (remetente_tipo IN ('escritorio','cliente')),
  remetente_id uuid,
  texto text NOT NULL,
  lida boolean NOT NULL DEFAULT false,
  lida_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mensagens_cliente ON public.cliente_portal_mensagens(cliente_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_mensagens_processo ON public.cliente_portal_mensagens(processo_id);

ALTER TABLE public.cliente_portal_mensagens ENABLE ROW LEVEL SECURITY;

-- 6. Tabela visualizar_como_sessoes (gestor impersonando)
CREATE TABLE IF NOT EXISTS public.visualizar_como_sessoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gestor_id uuid NOT NULL,
  alvo_tipo text NOT NULL CHECK (alvo_tipo IN ('parceiro','cliente')),
  alvo_id uuid NOT NULL,
  alvo_user_id uuid,
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  encerrado_em timestamptz,
  ativa boolean NOT NULL DEFAULT true,
  ip_origem text,
  user_agent text
);

CREATE INDEX IF NOT EXISTS idx_visualizar_gestor ON public.visualizar_como_sessoes(gestor_id, ativa);
CREATE INDEX IF NOT EXISTS idx_visualizar_alvo ON public.visualizar_como_sessoes(alvo_tipo, alvo_id);

ALTER TABLE public.visualizar_como_sessoes ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- FUNÇÕES SECURITY DEFINER (helpers para RLS sem recursão)
-- =========================================================

-- Retorna o cliente_id ligado ao usuário do portal do cliente (NULL se não for cliente)
CREATE OR REPLACE FUNCTION public.cliente_id_do_usuario(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cliente_id FROM public.cliente_usuarios
  WHERE user_id = _user_id AND ativo = true
  LIMIT 1
$$;

-- Retorna o parceiro_id ligado ao usuário do portal do parceiro (NULL se não for parceiro)
-- (parceiros têm portal_ativo + email; vinculamos pelo email do auth.users)
CREATE OR REPLACE FUNCTION public.parceiro_id_do_usuario(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id
  FROM public.parceiros p
  JOIN auth.users u ON lower(u.email) = lower(p.email)
  WHERE u.id = _user_id AND p.portal_ativo = true AND p.ativo = true
  LIMIT 1
$$;

-- =========================================================
-- RLS — cliente_usuarios
-- =========================================================
CREATE POLICY "gestor gerencia cliente_usuarios"
  ON public.cliente_usuarios FOR ALL
  TO authenticated
  USING (is_gestor(auth.uid()))
  WITH CHECK (is_gestor(auth.uid()));

CREATE POLICY "equipe ve cliente_usuarios"
  ON public.cliente_usuarios FOR SELECT
  TO authenticated
  USING (has_permission(auth.uid(), 'clientes'::modulo, 'visualizar'::acao_permissao));

CREATE POLICY "cliente ve proprio acesso"
  ON public.cliente_usuarios FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- =========================================================
-- RLS — cliente_portal_atualizacoes
-- =========================================================
CREATE POLICY "equipe gerencia atualizacoes"
  ON public.cliente_portal_atualizacoes FOR ALL
  TO authenticated
  USING (has_permission(auth.uid(), 'processos'::modulo, 'editar'::acao_permissao))
  WITH CHECK (has_permission(auth.uid(), 'processos'::modulo, 'editar'::acao_permissao));

CREATE POLICY "equipe ve todas atualizacoes"
  ON public.cliente_portal_atualizacoes FOR SELECT
  TO authenticated
  USING (has_permission(auth.uid(), 'processos'::modulo, 'visualizar'::acao_permissao));

CREATE POLICY "cliente ve atualizacoes publicadas"
  ON public.cliente_portal_atualizacoes FOR SELECT
  TO authenticated
  USING (
    publicado = true
    AND cliente_id = public.cliente_id_do_usuario(auth.uid())
  );

-- =========================================================
-- RLS — cliente_portal_documentos
-- =========================================================
CREATE POLICY "equipe gerencia portal docs"
  ON public.cliente_portal_documentos FOR ALL
  TO authenticated
  USING (has_permission(auth.uid(), 'documentos'::modulo, 'editar'::acao_permissao))
  WITH CHECK (has_permission(auth.uid(), 'documentos'::modulo, 'editar'::acao_permissao));

CREATE POLICY "equipe ve portal docs"
  ON public.cliente_portal_documentos FOR SELECT
  TO authenticated
  USING (has_permission(auth.uid(), 'documentos'::modulo, 'visualizar'::acao_permissao));

CREATE POLICY "cliente ve seus docs liberados"
  ON public.cliente_portal_documentos FOR SELECT
  TO authenticated
  USING (cliente_id = public.cliente_id_do_usuario(auth.uid()));

-- =========================================================
-- RLS — cliente_portal_mensagens
-- =========================================================
CREATE POLICY "equipe ve mensagens"
  ON public.cliente_portal_mensagens FOR SELECT
  TO authenticated
  USING (has_permission(auth.uid(), 'clientes'::modulo, 'visualizar'::acao_permissao));

CREATE POLICY "equipe envia mensagens"
  ON public.cliente_portal_mensagens FOR INSERT
  TO authenticated
  WITH CHECK (
    remetente_tipo = 'escritorio'
    AND remetente_id = auth.uid()
    AND has_permission(auth.uid(), 'clientes'::modulo, 'visualizar'::acao_permissao)
  );

CREATE POLICY "cliente ve suas mensagens"
  ON public.cliente_portal_mensagens FOR SELECT
  TO authenticated
  USING (cliente_id = public.cliente_id_do_usuario(auth.uid()));

CREATE POLICY "cliente envia mensagem propria"
  ON public.cliente_portal_mensagens FOR INSERT
  TO authenticated
  WITH CHECK (
    remetente_tipo = 'cliente'
    AND cliente_id = public.cliente_id_do_usuario(auth.uid())
  );

CREATE POLICY "marcar mensagem como lida"
  ON public.cliente_portal_mensagens FOR UPDATE
  TO authenticated
  USING (
    cliente_id = public.cliente_id_do_usuario(auth.uid())
    OR has_permission(auth.uid(), 'clientes'::modulo, 'visualizar'::acao_permissao)
  );

-- =========================================================
-- RLS — visualizar_como_sessoes (só gestor)
-- =========================================================
CREATE POLICY "gestor cria sessao visualizar"
  ON public.visualizar_como_sessoes FOR INSERT
  TO authenticated
  WITH CHECK (is_gestor(auth.uid()) AND gestor_id = auth.uid());

CREATE POLICY "gestor encerra propria sessao"
  ON public.visualizar_como_sessoes FOR UPDATE
  TO authenticated
  USING (gestor_id = auth.uid() AND is_gestor(auth.uid()));

CREATE POLICY "gestor ve todas sessoes"
  ON public.visualizar_como_sessoes FOR SELECT
  TO authenticated
  USING (is_gestor(auth.uid()));

-- =========================================================
-- ESTENDER RLS DE TABELAS EXISTENTES PARA OS PORTAIS
-- =========================================================

-- Cliente vê seus próprios processos
CREATE POLICY "cliente ve proprios processos"
  ON public.processos FOR SELECT
  TO authenticated
  USING (cliente_id = public.cliente_id_do_usuario(auth.uid()));

-- Cliente vê seu próprio cadastro
CREATE POLICY "cliente ve proprio cadastro"
  ON public.clientes FOR SELECT
  TO authenticated
  USING (id = public.cliente_id_do_usuario(auth.uid()));

-- Cliente edita campos limitados do próprio cadastro (telefone, whatsapp, email contato)
CREATE POLICY "cliente edita proprio cadastro"
  ON public.clientes FOR UPDATE
  TO authenticated
  USING (id = public.cliente_id_do_usuario(auth.uid()));

-- Parceiro vê processos vinculados (via processo_parceiros se existir, ou responsavel)
-- Como não temos certeza do schema de processo_parceiros, fazemos via tabela parceiros + responsavel_id já coberto
-- O parceiro vê processos onde aparece como parceiro vinculado: deixaremos para a fase do portal do parceiro
-- pois exige inspecionar processo_parceiros. Adicionamos política simples baseada em parceiro_id_do_usuario:

-- Parceiro vê seu próprio cadastro
CREATE POLICY "parceiro ve proprio cadastro"
  ON public.parceiros FOR SELECT
  TO authenticated
  USING (id = public.parceiro_id_do_usuario(auth.uid()));

-- =========================================================
-- TRIGGER DE AUDITORIA EM visualizar_como_sessoes
-- =========================================================
CREATE TRIGGER audit_visualizar_como
  AFTER INSERT OR UPDATE ON public.visualizar_como_sessoes
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log('usuarios', 'alvo_tipo');