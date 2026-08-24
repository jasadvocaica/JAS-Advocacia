CREATE OR REPLACE FUNCTION public.comercial_responsavel_comunicacao()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _resp uuid;
  _nome text;
BEGIN
  IF _uid IS NULL OR NOT public.is_interno_ativo(_uid) THEN
    RETURN jsonb_build_object('configurado', false, 'user_id', NULL, 'nome', NULL, 'ativo', false);
  END IF;

  SELECT nullif(btrim(coalesce(valor,'')),'')::uuid INTO _resp
  FROM public.configuracoes_sistema
  WHERE secao = 'comercial' AND chave = 'responsavel_comunicacao_user_id';

  IF _resp IS NULL THEN
    RETURN jsonb_build_object('configurado', false, 'user_id', NULL, 'nome', NULL, 'ativo', false);
  END IF;

  SELECT nome INTO _nome FROM public.profiles WHERE id = _resp;

  RETURN jsonb_build_object(
    'configurado', true,
    'user_id', _resp,
    'nome', _nome,
    'ativo', public.is_interno_ativo(_resp)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.comercial_responsavel_comunicacao() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.comercial_responsavel_comunicacao() TO authenticated;