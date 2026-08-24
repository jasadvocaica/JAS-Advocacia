
-- 1. Novas colunas no token de ativação
ALTER TABLE public.usuario_ativacao_tokens
  ADD COLUMN IF NOT EXISTS tentativas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bloqueado_ate timestamptz;

-- 2. gerar_token_ativacao: expiração 24h em vez de 7 dias
CREATE OR REPLACE FUNCTION public.gerar_token_ativacao(_user_id uuid, _observacao text DEFAULT NULL::text)
 RETURNS TABLE(codigo text, expira_em timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_codigo TEXT;
  v_hash TEXT;
  v_expira TIMESTAMPTZ := now() + INTERVAL '24 hours';
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

  v_codigo := lpad((floor(random() * 1000000))::int::text, 6, '0');
  v_hash := encode(digest(v_codigo, 'sha256'), 'hex');

  -- Invalida tokens anteriores não usados desse usuário
  UPDATE public.usuario_ativacao_tokens
  SET usado_em = now(), usado_por = v_uid,
      observacao = COALESCE(observacao,'') || ' [substituído]'
  WHERE user_id = _user_id AND usado_em IS NULL;

  INSERT INTO public.usuario_ativacao_tokens (
    user_id, token_hash, codigo_ultimo4, expira_em, observacao, criado_por
  ) VALUES (
    _user_id, v_hash, right(v_codigo, 4), v_expira, _observacao, v_uid
  );

  RETURN QUERY SELECT v_codigo, v_expira;
END;
$function$;

-- 3. confirmar_ativacao_conta com rate limit por tentativas
CREATE OR REPLACE FUNCTION public.confirmar_ativacao_conta(_codigo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_hash TEXT;
  v_token RECORD;
  v_profile RECORD;
  v_max_tentativas CONSTANT integer := 5;
  v_bloqueio_min CONSTANT integer := 15;
  v_resta integer;
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

  -- Pega token vigente do usuário (último não usado)
  SELECT * INTO v_token
  FROM public.usuario_ativacao_tokens
  WHERE user_id = v_uid
    AND usado_em IS NULL
  ORDER BY criado_em DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nenhum código ativo. Solicite um novo código.';
  END IF;

  -- Bloqueio temporário por excesso de tentativas
  IF v_token.bloqueado_ate IS NOT NULL AND v_token.bloqueado_ate > now() THEN
    RAISE EXCEPTION 'Muitas tentativas. Tente novamente em % minutos.',
      GREATEST(1, ceil(extract(epoch FROM (v_token.bloqueado_ate - now()))/60))::int;
  END IF;

  IF v_token.expira_em < now() THEN
    RAISE EXCEPTION 'Código expirado. Solicite um novo código.';
  END IF;

  v_hash := encode(digest(trim(_codigo), 'sha256'), 'hex');

  -- Código incorreto → incrementa tentativas
  IF v_token.token_hash <> v_hash THEN
    UPDATE public.usuario_ativacao_tokens
    SET tentativas = tentativas + 1,
        bloqueado_ate = CASE
          WHEN tentativas + 1 >= v_max_tentativas
          THEN now() + (v_bloqueio_min || ' minutes')::interval
          ELSE bloqueado_ate
        END
    WHERE id = v_token.id
    RETURNING (v_max_tentativas - tentativas) INTO v_resta;

    IF v_resta <= 0 THEN
      RAISE EXCEPTION 'Código inválido. Bloqueado por % minutos.', v_bloqueio_min;
    ELSE
      RAISE EXCEPTION 'Código inválido. Restam % tentativa(s).', v_resta;
    END IF;
  END IF;

  -- Sucesso
  UPDATE public.usuario_ativacao_tokens
  SET usado_em = now(), usado_por = v_uid
  WHERE id = v_token.id;

  UPDATE public.profiles SET ativo = true WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true, 'ja_ativo', false);
END;
$function$;
