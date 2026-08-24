-- 1) Tabela de tokens de ativação
CREATE TABLE public.usuario_ativacao_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  codigo_ultimo4 TEXT NOT NULL,
  expira_em TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  usado_em TIMESTAMPTZ,
  usado_por UUID,
  observacao TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por UUID
);

CREATE INDEX idx_usuario_ativacao_tokens_user ON public.usuario_ativacao_tokens(user_id) WHERE usado_em IS NULL;

ALTER TABLE public.usuario_ativacao_tokens ENABLE ROW LEVEL SECURITY;

-- Gestor / equipe.editar pode ver os tokens (para conferência)
CREATE POLICY "gestor visualiza tokens de ativacao"
ON public.usuario_ativacao_tokens
FOR SELECT
TO authenticated
USING (public.has_permission(auth.uid(), 'equipe'::public.modulo, 'editar'::public.acao_permissao));

-- Inserções somente via RPC SECURITY DEFINER. Nada de INSERT direto pelo cliente.
-- (sem policies INSERT/UPDATE/DELETE — bloqueadas por padrão com RLS habilitado)

-- 2) RPC para gerar token (somente gestor / equipe.editar)
CREATE OR REPLACE FUNCTION public.gerar_token_ativacao(_user_id uuid, _observacao text DEFAULT NULL)
RETURNS TABLE (codigo text, expira_em timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_codigo TEXT;
  v_hash TEXT;
  v_expira TIMESTAMPTZ := now() + INTERVAL '7 days';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida';
  END IF;

  IF NOT public.has_permission(v_uid, 'equipe'::public.modulo, 'editar'::public.acao_permissao) THEN
    RAISE EXCEPTION 'Sem permissão para gerar token de ativação';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id) THEN
    RAISE EXCEPTION 'Usuário não encontrado';
  END IF;

  -- Gera código numérico de 6 dígitos
  v_codigo := lpad((floor(random() * 1000000))::int::text, 6, '0');
  v_hash := encode(digest(v_codigo, 'sha256'), 'hex');

  -- Invalida tokens anteriores não usados desse usuário
  UPDATE public.usuario_ativacao_tokens
  SET usado_em = now(), usado_por = v_uid, observacao = COALESCE(observacao,'') || ' [substituído]'
  WHERE user_id = _user_id AND usado_em IS NULL;

  INSERT INTO public.usuario_ativacao_tokens (
    user_id, token_hash, codigo_ultimo4, expira_em, observacao, criado_por
  ) VALUES (
    _user_id, v_hash, right(v_codigo, 4), v_expira, _observacao, v_uid
  );

  RETURN QUERY SELECT v_codigo, v_expira;
END;
$$;

-- 3) RPC para o próprio usuário consumir o token e ativar a conta
CREATE OR REPLACE FUNCTION public.confirmar_ativacao_conta(_codigo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_hash TEXT;
  v_token RECORD;
  v_profile RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida';
  END IF;

  IF _codigo IS NULL OR length(trim(_codigo)) = 0 THEN
    RAISE EXCEPTION 'Código obrigatório';
  END IF;

  SELECT id, ativo INTO v_profile FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil não encontrado';
  END IF;

  IF v_profile.ativo THEN
    RETURN jsonb_build_object('ok', true, 'ja_ativo', true);
  END IF;

  v_hash := encode(digest(trim(_codigo), 'sha256'), 'hex');

  SELECT * INTO v_token
  FROM public.usuario_ativacao_tokens
  WHERE user_id = v_uid
    AND token_hash = v_hash
    AND usado_em IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Código inválido';
  END IF;

  IF v_token.expira_em < now() THEN
    RAISE EXCEPTION 'Código expirado';
  END IF;

  UPDATE public.usuario_ativacao_tokens
  SET usado_em = now(), usado_por = v_uid
  WHERE id = v_token.id;

  UPDATE public.profiles
  SET ativo = true
  WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true, 'ja_ativo', false);
END;
$$;

-- Garante extensão pgcrypto (digest) — geralmente já existe no Supabase
CREATE EXTENSION IF NOT EXISTS pgcrypto;