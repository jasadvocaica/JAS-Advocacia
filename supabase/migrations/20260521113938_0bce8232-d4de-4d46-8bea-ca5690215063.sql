CREATE OR REPLACE FUNCTION public.ponto_registrar_evento(_evento text)
 RETURNS gp_ponto_registros
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_membro uuid;
  v_membro_status text;
  v_data date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  v_hora time := (now() AT TIME ZONE 'America/Cuiaba')::time;
  v_reg public.gp_ponto_registros;
  v_horas numeric(5,2);
  v_horas_esperadas numeric(5,2);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida' USING ERRCODE = 'P0001', HINT = 'PT000';
  END IF;

  IF _evento NOT IN ('entrada','saida_almoco','retorno_almoco','saida') THEN
    RAISE EXCEPTION 'Evento inválido' USING ERRCODE = 'P0001', HINT = 'PT003';
  END IF;

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

  -- Horas esperadas conforme jornada do membro (cai para 8 se não tiver config)
  SELECT COALESCE(horas_diarias, 8)::numeric(5,2)
  INTO v_horas_esperadas
  FROM public.gp_ponto_config WHERE membro_id = v_membro LIMIT 1;
  IF v_horas_esperadas IS NULL THEN v_horas_esperadas := 8; END IF;

  INSERT INTO public.gp_ponto_registros (membro_id, data, registrado_por, tipo_registro, horas_esperadas)
  VALUES (v_membro, v_data, v_uid, 'manual', v_horas_esperadas)
  ON CONFLICT (membro_id, data) DO UPDATE SET horas_esperadas = COALESCE(public.gp_ponto_registros.horas_esperadas, EXCLUDED.horas_esperadas);

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
$function$;