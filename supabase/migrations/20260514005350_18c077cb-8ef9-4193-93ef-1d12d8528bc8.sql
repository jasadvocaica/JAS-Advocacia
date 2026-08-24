
-- ============================================================
-- Monitoramento e alertas de segurança
-- ============================================================

CREATE TABLE IF NOT EXISTS public.seguranca_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  tipo text NOT NULL CHECK (tipo IN (
    'rls_negado','permissao_negada','otp_expirado','otp_bloqueado',
    'acesso_recurso_negado','token_invalido','funcao_negada','outro'
  )),
  recurso text,
  rota text,
  detalhe text,
  user_agent text,
  contexto jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seg_eventos_criado ON public.seguranca_eventos(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_seg_eventos_tipo ON public.seguranca_eventos(tipo, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_seg_eventos_user ON public.seguranca_eventos(user_id, criado_em DESC);

ALTER TABLE public.seguranca_eventos ENABLE ROW LEVEL SECURITY;

-- Qualquer authenticated pode inserir seu próprio evento (ou anônimo via user_id null)
CREATE POLICY "auth_insere_evento_seguranca"
ON public.seguranca_eventos FOR INSERT TO authenticated
WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Apenas gestores leem
CREATE POLICY "gestor_le_eventos_seguranca"
ON public.seguranca_eventos FOR SELECT TO authenticated
USING (public.is_gestor(auth.uid()));

-- ------------------------------------------------------------
-- RPC: registrar evento (segurança definer p/ aceitar anon também)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_evento_seguranca(
  _tipo text,
  _recurso text DEFAULT NULL,
  _rota text DEFAULT NULL,
  _detalhe text DEFAULT NULL,
  _contexto jsonb DEFAULT NULL,
  _user_agent text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_email text;
BEGIN
  IF _tipo NOT IN ('rls_negado','permissao_negada','otp_expirado','otp_bloqueado',
                   'acesso_recurso_negado','token_invalido','funcao_negada','outro') THEN
    RAISE EXCEPTION 'Tipo inválido';
  END IF;

  IF v_uid IS NOT NULL THEN
    SELECT email INTO v_email FROM public.profiles WHERE id = v_uid;
  END IF;

  INSERT INTO public.seguranca_eventos (
    user_id, email, tipo, recurso, rota, detalhe, user_agent, contexto
  ) VALUES (
    v_uid, v_email, _tipo,
    NULLIF(left(_recurso, 200), ''),
    NULLIF(left(_rota, 500), ''),
    NULLIF(left(_detalhe, 1000), ''),
    NULLIF(left(_user_agent, 500), ''),
    _contexto
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_evento_seguranca(text,text,text,text,jsonb,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.registrar_evento_seguranca(text,text,text,text,jsonb,text) TO authenticated;

-- ------------------------------------------------------------
-- RPC: resumo de segurança (gestores)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seguranca_resumo()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_resp jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_gestor(v_uid) THEN
    RAISE EXCEPTION 'Apenas gestores podem consultar o monitoramento de segurança';
  END IF;

  SELECT jsonb_build_object(
    'logins_falha_24h', (
      SELECT COUNT(*) FROM public.auth_login_eventos
      WHERE evento = 'login_falha' AND criado_em > now() - interval '24 hours'
    ),
    'logins_falha_7d', (
      SELECT COUNT(*) FROM public.auth_login_eventos
      WHERE evento = 'login_falha' AND criado_em > now() - interval '7 days'
    ),
    'top_emails_falha_24h', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('email', email, 'total', total)), '[]'::jsonb)
      FROM (
        SELECT email, COUNT(*)::int AS total
        FROM public.auth_login_eventos
        WHERE evento = 'login_falha'
          AND email IS NOT NULL
          AND criado_em > now() - interval '24 hours'
        GROUP BY email ORDER BY total DESC LIMIT 5
      ) t
    ),
    'otp_bloqueados', (
      SELECT COUNT(*) FROM public.usuario_ativacao_tokens
      WHERE bloqueado_ate IS NOT NULL AND bloqueado_ate > now()
    ),
    'otp_expirados_24h', (
      SELECT COUNT(*) FROM public.usuario_ativacao_tokens
      WHERE expira_em < now() AND usado_em IS NULL
        AND criado_em > now() - interval '24 hours'
    ),
    'otp_tentativas_24h', (
      SELECT COALESCE(SUM(tentativas),0)::int FROM public.usuario_ativacao_tokens
      WHERE criado_em > now() - interval '24 hours'
    ),
    'eventos_24h', (
      SELECT COUNT(*) FROM public.seguranca_eventos
      WHERE criado_em > now() - interval '24 hours'
    ),
    'eventos_por_tipo_24h', (
      SELECT COALESCE(jsonb_object_agg(tipo, total), '{}'::jsonb)
      FROM (
        SELECT tipo, COUNT(*)::int AS total
        FROM public.seguranca_eventos
        WHERE criado_em > now() - interval '24 hours'
        GROUP BY tipo
      ) t
    ),
    'rls_negados_7d', (
      SELECT COUNT(*) FROM public.seguranca_eventos
      WHERE tipo IN ('rls_negado','permissao_negada','funcao_negada')
        AND criado_em > now() - interval '7 days'
    ),
    'gerado_em', now()
  ) INTO v_resp;

  RETURN v_resp;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.seguranca_resumo() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.seguranca_resumo() TO authenticated;

-- ------------------------------------------------------------
-- RPC: verificar alertas (cria notificações para gestores se
-- limites forem ultrapassados nas últimas 24h)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seguranca_verificar_alertas()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_logins_falha int;
  v_otp_bloq int;
  v_rls_neg int;
  v_alertas jsonb := '[]'::jsonb;
  v_gestor RECORD;
BEGIN
  IF v_uid IS NULL OR NOT public.is_gestor(v_uid) THEN
    RAISE EXCEPTION 'Apenas gestores podem disparar verificação de alertas';
  END IF;

  SELECT COUNT(*) INTO v_logins_falha
  FROM public.auth_login_eventos
  WHERE evento = 'login_falha' AND criado_em > now() - interval '1 hour';

  SELECT COUNT(*) INTO v_otp_bloq
  FROM public.usuario_ativacao_tokens
  WHERE bloqueado_ate IS NOT NULL AND bloqueado_ate > now();

  SELECT COUNT(*) INTO v_rls_neg
  FROM public.seguranca_eventos
  WHERE tipo IN ('rls_negado','permissao_negada','funcao_negada')
    AND criado_em > now() - interval '1 hour';

  IF v_logins_falha >= 10 THEN
    v_alertas := v_alertas || jsonb_build_object('tipo','logins_falha','total', v_logins_falha);
  END IF;
  IF v_otp_bloq >= 3 THEN
    v_alertas := v_alertas || jsonb_build_object('tipo','otp_bloqueados','total', v_otp_bloq);
  END IF;
  IF v_rls_neg >= 5 THEN
    v_alertas := v_alertas || jsonb_build_object('tipo','rls_negados','total', v_rls_neg);
  END IF;

  IF jsonb_array_length(v_alertas) > 0 THEN
    FOR v_gestor IN
      SELECT ur.user_id FROM public.user_roles ur
      JOIN public.profiles p ON p.id = ur.user_id AND p.ativo = true
      WHERE ur.role = 'gestor'
    LOOP
      INSERT INTO public.notificacoes (user_id, tipo, titulo, descricao, link)
      VALUES (
        v_gestor.user_id,
        'alerta_seguranca',
        'Alerta de segurança',
        'Eventos suspeitos detectados na última hora — abra o monitoramento.',
        '/configuracoes/seguranca'
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object('alertas', v_alertas, 'verificado_em', now());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.seguranca_verificar_alertas() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.seguranca_verificar_alertas() TO authenticated;
