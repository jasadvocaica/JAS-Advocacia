-- Função auxiliar para verificar vínculo do usuário logado
CREATE OR REPLACE FUNCTION public.ponto_verificar_vinculo()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_membro_id uuid;
  v_membro RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('vinculado', false, 'codigo', 'PT000', 'mensagem', 'Sessão inválida');
  END IF;

  SELECT id, nome, status INTO v_membro
  FROM public.equipe_membros
  WHERE user_id = v_uid
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'vinculado', false,
      'codigo', 'PT001',
      'mensagem', 'Seu login ainda não está vinculado a um membro da equipe. Solicite ao gestor que cadastre você em Equipe → Gestão de Pessoas.'
    );
  END IF;

  IF v_membro.status <> 'ativo' THEN
    RETURN jsonb_build_object(
      'vinculado', false,
      'codigo', 'PT002',
      'mensagem', 'Seu cadastro de membro está inativo. Procure o gestor para reativar.',
      'membro_id', v_membro.id,
      'nome', v_membro.nome
    );
  END IF;

  RETURN jsonb_build_object(
    'vinculado', true,
    'codigo', 'OK',
    'membro_id', v_membro.id,
    'nome', v_membro.nome
  );
END;
$$;

-- Atualiza ponto_registrar_evento para validar vínculo com erros específicos
CREATE OR REPLACE FUNCTION public.ponto_registrar_evento(_evento text)
RETURNS gp_ponto_registros
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_membro uuid;
  v_membro_status text;
  v_data date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  v_hora time := (now() AT TIME ZONE 'America/Cuiaba')::time;
  v_reg public.gp_ponto_registros;
  v_horas numeric(5,2);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida' USING ERRCODE = 'P0001', HINT = 'PT000';
  END IF;

  IF _evento NOT IN ('entrada','saida_almoco','retorno_almoco','saida') THEN
    RAISE EXCEPTION 'Evento inválido' USING ERRCODE = 'P0001', HINT = 'PT003';
  END IF;

  -- Validação de vínculo login ↔ membro (erro específico)
  SELECT id, status INTO v_membro, v_membro_status
  FROM public.equipe_membros
  WHERE user_id = v_uid
  LIMIT 1;

  IF v_membro IS NULL THEN
    RAISE EXCEPTION 'Seu login ainda não está vinculado a um membro da equipe. Solicite ao gestor que cadastre você em Equipe → Gestão de Pessoas.'
      USING ERRCODE = 'P0001', HINT = 'PT001';
  END IF;

  IF v_membro_status <> 'ativo' THEN
    RAISE EXCEPTION 'Seu cadastro de membro está inativo. Procure o gestor para reativar.'
      USING ERRCODE = 'P0001', HINT = 'PT002';
  END IF;

  -- Cria linha do dia se não existir
  INSERT INTO public.gp_ponto_registros (membro_id, data, registrado_por, tipo_registro)
  VALUES (v_membro, v_data, v_uid, 'manual')
  ON CONFLICT (membro_id, data) DO NOTHING;

  SELECT * INTO v_reg FROM public.gp_ponto_registros
  WHERE membro_id = v_membro AND data = v_data FOR UPDATE;

  IF _evento = 'entrada' AND v_reg.entrada IS NOT NULL THEN
    RAISE EXCEPTION 'Entrada já registrada hoje' USING ERRCODE = 'P0001', HINT = 'PT010';
  ELSIF _evento = 'saida_almoco' AND v_reg.saida_almoco IS NOT NULL THEN
    RAISE EXCEPTION 'Saída para almoço já registrada' USING ERRCODE = 'P0001', HINT = 'PT011';
  ELSIF _evento = 'retorno_almoco' AND v_reg.retorno_almoco IS NOT NULL THEN
    RAISE EXCEPTION 'Retorno do almoço já registrado' USING ERRCODE = 'P0001', HINT = 'PT012';
  ELSIF _evento = 'saida' AND v_reg.saida IS NOT NULL THEN
    RAISE EXCEPTION 'Saída já registrada' USING ERRCODE = 'P0001', HINT = 'PT013';
  END IF;

  IF _evento <> 'entrada' AND v_reg.entrada IS NULL THEN
    RAISE EXCEPTION 'Registre a entrada primeiro' USING ERRCODE = 'P0001', HINT = 'PT020';
  END IF;
  IF _evento = 'retorno_almoco' AND v_reg.saida_almoco IS NULL THEN
    RAISE EXCEPTION 'Registre a saída para almoço primeiro' USING ERRCODE = 'P0001', HINT = 'PT021';
  END IF;
  IF _evento = 'saida' AND v_reg.saida_almoco IS NOT NULL AND v_reg.retorno_almoco IS NULL THEN
    RAISE EXCEPTION 'Registre o retorno do almoço primeiro' USING ERRCODE = 'P0001', HINT = 'PT022';
  END IF;

  IF _evento = 'entrada' THEN
    UPDATE public.gp_ponto_registros SET entrada = v_hora WHERE id = v_reg.id;
  ELSIF _evento = 'saida_almoco' THEN
    UPDATE public.gp_ponto_registros SET saida_almoco = v_hora WHERE id = v_reg.id;
  ELSIF _evento = 'retorno_almoco' THEN
    UPDATE public.gp_ponto_registros SET retorno_almoco = v_hora WHERE id = v_reg.id;
  ELSIF _evento = 'saida' THEN
    v_horas := EXTRACT(EPOCH FROM (v_hora - v_reg.entrada))/3600.0;
    IF v_reg.saida_almoco IS NOT NULL AND v_reg.retorno_almoco IS NOT NULL THEN
      v_horas := v_horas - EXTRACT(EPOCH FROM (v_reg.retorno_almoco - v_reg.saida_almoco))/3600.0;
    END IF;
    UPDATE public.gp_ponto_registros
    SET saida = v_hora,
        horas_trabalhadas = ROUND(v_horas::numeric, 2)
    WHERE id = v_reg.id;
  END IF;

  SELECT * INTO v_reg FROM public.gp_ponto_registros WHERE id = v_reg.id;
  RETURN v_reg;
END;
$$;