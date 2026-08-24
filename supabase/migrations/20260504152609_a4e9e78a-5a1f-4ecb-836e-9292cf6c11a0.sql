CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.criar_token_mcp(_nome text, _expira_em timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_token text;
  v_hash text;
  v_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.is_gestor(v_uid) THEN
    RAISE EXCEPTION 'Apenas gestores podem criar tokens MCP';
  END IF;
  IF _nome IS NULL OR length(trim(_nome)) = 0 THEN
    RAISE EXCEPTION 'Nome do token é obrigatório';
  END IF;

  v_token := 'mcp_' || encode(gen_random_bytes(32), 'hex');
  v_hash := encode(digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.mcp_tokens (nome, token_hash, user_id, expira_em)
  VALUES (trim(_nome), v_hash, v_uid, _expira_em)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'token', v_token, 'nome', _nome);
END;
$$;

CREATE OR REPLACE FUNCTION public.revogar_token_mcp(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_gestor(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas gestores podem revogar tokens MCP';
  END IF;
  UPDATE public.mcp_tokens SET ativo = false WHERE id = _id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.criar_token_mcp(text, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.revogar_token_mcp(uuid) FROM anon;