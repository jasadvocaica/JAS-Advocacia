
-- =========================================================================
-- 1. NOTIFICAÇÕES
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.notificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  link TEXT,
  lida BOOLEAN NOT NULL DEFAULT false,
  lida_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_user ON public.notificacoes(user_id, lida);
CREATE INDEX IF NOT EXISTS idx_notif_criado ON public.notificacoes(criado_em DESC);

ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ver proprias notificacoes" ON public.notificacoes
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "marcar lida" ON public.notificacoes
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "excluir proprias notificacoes" ON public.notificacoes
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "sistema cria notificacoes" ON public.notificacoes
  FOR INSERT TO authenticated WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacoes;

-- =========================================================================
-- 2. LOG DE ATIVIDADES (imutável)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.user_log_atividade (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  acao TEXT NOT NULL,
  modulo TEXT,
  registro_id UUID,
  registro_titulo TEXT,
  dados_antes JSONB,
  dados_depois JSONB,
  ip TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_log_user ON public.user_log_atividade(user_id);
CREATE INDEX IF NOT EXISTS idx_log_modulo ON public.user_log_atividade(modulo);
CREATE INDEX IF NOT EXISTS idx_log_criado ON public.user_log_atividade(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_log_registro ON public.user_log_atividade(registro_id);

ALTER TABLE public.user_log_atividade ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gestor le log" ON public.user_log_atividade
  FOR SELECT TO authenticated USING (public.is_gestor(auth.uid()));

CREATE POLICY "sistema insere log" ON public.user_log_atividade
  FOR INSERT TO authenticated WITH CHECK (true);

-- Sem UPDATE / DELETE: log é imutável
-- (nenhuma policy criada para essas operações)

-- =========================================================================
-- 3. TRIGGER GENÉRICO DE AUDITORIA
-- =========================================================================
CREATE OR REPLACE FUNCTION public.trg_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_modulo TEXT := TG_ARGV[0];
  v_titulo_col TEXT := COALESCE(TG_ARGV[1], 'titulo');
  v_acao TEXT;
  v_titulo TEXT;
  v_registro_id UUID;
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_acao := 'criou';
    BEGIN
      EXECUTE format('SELECT ($1).%I::text, ($1).id', v_titulo_col) INTO v_titulo, v_registro_id USING NEW;
    EXCEPTION WHEN OTHERS THEN
      v_titulo := NULL;
      v_registro_id := (to_jsonb(NEW)->>'id')::uuid;
    END;
    INSERT INTO public.user_log_atividade (user_id, acao, modulo, registro_id, registro_titulo, dados_depois)
    VALUES (v_uid, v_acao, v_modulo, v_registro_id, v_titulo, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_acao := 'editou';
    BEGIN
      EXECUTE format('SELECT ($1).%I::text, ($1).id', v_titulo_col) INTO v_titulo, v_registro_id USING NEW;
    EXCEPTION WHEN OTHERS THEN
      v_titulo := NULL;
      v_registro_id := (to_jsonb(NEW)->>'id')::uuid;
    END;
    -- só registra se algo mudou de fato
    IF to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
      INSERT INTO public.user_log_atividade (user_id, acao, modulo, registro_id, registro_titulo, dados_antes, dados_depois)
      VALUES (v_uid, v_acao, v_modulo, v_registro_id, v_titulo, to_jsonb(OLD), to_jsonb(NEW));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_acao := 'excluiu';
    BEGIN
      EXECUTE format('SELECT ($1).%I::text, ($1).id', v_titulo_col) INTO v_titulo, v_registro_id USING OLD;
    EXCEPTION WHEN OTHERS THEN
      v_titulo := NULL;
      v_registro_id := (to_jsonb(OLD)->>'id')::uuid;
    END;
    INSERT INTO public.user_log_atividade (user_id, acao, modulo, registro_id, registro_titulo, dados_antes)
    VALUES (v_uid, v_acao, v_modulo, v_registro_id, v_titulo, to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Aplicar triggers nas tabelas-chave
DROP TRIGGER IF EXISTS audit_clientes ON public.clientes;
CREATE TRIGGER audit_clientes
  AFTER INSERT OR UPDATE OR DELETE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log('clientes', 'nome');

DROP TRIGGER IF EXISTS audit_processos ON public.processos;
CREATE TRIGGER audit_processos
  AFTER INSERT OR UPDATE OR DELETE ON public.processos
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log('processos', 'numero_cnj');

DROP TRIGGER IF EXISTS audit_controladoria ON public.controladoria_itens;
CREATE TRIGGER audit_controladoria
  AFTER INSERT OR UPDATE OR DELETE ON public.controladoria_itens
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log('controladoria', 'titulo');

DROP TRIGGER IF EXISTS audit_pecas ON public.doc_pecas;
CREATE TRIGGER audit_pecas
  AFTER INSERT OR UPDATE OR DELETE ON public.doc_pecas
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log('documentos', 'titulo');

DROP TRIGGER IF EXISTS audit_contratos ON public.honorarios_contratos;
CREATE TRIGGER audit_contratos
  AFTER INSERT OR UPDATE OR DELETE ON public.honorarios_contratos
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log('financeiro', 'tipo');

DROP TRIGGER IF EXISTS audit_pagamentos ON public.honorarios_pagamentos;
CREATE TRIGGER audit_pagamentos
  AFTER INSERT OR UPDATE OR DELETE ON public.honorarios_pagamentos
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log('financeiro', 'tipo_pagamento');

DROP TRIGGER IF EXISTS audit_equipe ON public.equipe_membros;
CREATE TRIGGER audit_equipe
  AFTER INSERT OR UPDATE OR DELETE ON public.equipe_membros
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log('equipe', 'nome');

DROP TRIGGER IF EXISTS audit_profiles ON public.profiles;
CREATE TRIGGER audit_profiles
  AFTER UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log('usuarios', 'nome');

DROP TRIGGER IF EXISTS audit_user_roles ON public.user_roles;
CREATE TRIGGER audit_user_roles
  AFTER INSERT OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log('usuarios', 'role');

DROP TRIGGER IF EXISTS audit_user_permissions ON public.user_permissions;
CREATE TRIGGER audit_user_permissions
  AFTER INSERT OR UPDATE OR DELETE ON public.user_permissions
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log('usuarios', 'modulo');

-- =========================================================================
-- 4. NOTIFICAÇÃO AUTOMÁTICA: tarefa atribuída
-- =========================================================================
CREATE OR REPLACE FUNCTION public.trg_notificar_responsavel_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_resp UUID;
BEGIN
  -- Pega responsável principal recém-adicionado
  IF TG_OP = 'INSERT' THEN
    v_resp := NEW.user_id;
    IF v_resp IS NOT NULL AND v_resp <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) THEN
      INSERT INTO public.notificacoes (user_id, tipo, titulo, descricao, link)
      SELECT v_resp,
             'tarefa_atribuida',
             'Nova tarefa atribuída',
             ci.titulo,
             '/controladoria'
      FROM public.controladoria_itens ci
      WHERE ci.id = NEW.item_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notificar_responsavel_item ON public.controladoria_responsaveis;
CREATE TRIGGER notificar_responsavel_item
  AFTER INSERT ON public.controladoria_responsaveis
  FOR EACH ROW EXECUTE FUNCTION public.trg_notificar_responsavel_item();

-- =========================================================================
-- 5. PROTEÇÃO: último gestor não pode ser inativado nem perder o role
-- =========================================================================
CREATE OR REPLACE FUNCTION public.trg_proteger_ultimo_gestor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_qtd INTEGER;
BEGIN
  -- Caso 1: profile sendo desativado
  IF TG_TABLE_NAME = 'profiles' AND OLD.ativo = true AND NEW.ativo = false THEN
    SELECT COUNT(*) INTO v_qtd
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.role = 'gestor' AND p.ativo = true AND p.id <> OLD.id;
    IF v_qtd = 0 AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = OLD.id AND role = 'gestor') THEN
      RAISE EXCEPTION 'Não é possível inativar o último gestor ativo do sistema.';
    END IF;
  END IF;

  -- Caso 2: removendo role 'gestor'
  IF TG_TABLE_NAME = 'user_roles' AND TG_OP = 'DELETE' AND OLD.role = 'gestor' THEN
    SELECT COUNT(*) INTO v_qtd
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.role = 'gestor' AND p.ativo = true AND ur.user_id <> OLD.user_id;
    IF v_qtd = 0 THEN
      RAISE EXCEPTION 'Não é possível remover o papel de gestor do último gestor ativo.';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS proteger_gestor_profile ON public.profiles;
CREATE TRIGGER proteger_gestor_profile
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_proteger_ultimo_gestor();

DROP TRIGGER IF EXISTS proteger_gestor_role ON public.user_roles;
CREATE TRIGGER proteger_gestor_role
  BEFORE DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.trg_proteger_ultimo_gestor();
