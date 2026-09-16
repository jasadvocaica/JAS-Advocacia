-- Descobre dinamicamente todos os vínculos com clientes e garante atomicidade:
-- qualquer conflito cancela a unificação completa, sem exclusão parcial.

CREATE OR REPLACE FUNCTION public.unificar_clientes(_id_a uuid, _id_b uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_mantido UUID;
  v_removido UUID;
  v_score_a INT;
  v_score_b INT;
  v_a RECORD;
  v_b RECORD;
  v_snap JSONB;
  v_movidos JSONB := '{}'::jsonb;
  v_count BIGINT;
  v_vinculo RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sessão inválida'; END IF;
  IF NOT public.is_gestor(v_uid) THEN
    RAISE EXCEPTION 'Apenas gestores podem unificar clientes';
  END IF;
  IF _id_a = _id_b THEN RAISE EXCEPTION 'Selecione dois clientes diferentes'; END IF;

  SELECT * INTO v_a FROM public.clientes WHERE id = _id_a FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente A não encontrado'; END IF;
  SELECT * INTO v_b FROM public.clientes WHERE id = _id_b FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente B não encontrado'; END IF;

  v_score_a := public.cliente_completude(_id_a);
  v_score_b := public.cliente_completude(_id_b);

  IF v_score_a > v_score_b THEN
    v_mantido := _id_a; v_removido := _id_b;
  ELSIF v_score_b > v_score_a THEN
    v_mantido := _id_b; v_removido := _id_a;
  ELSE
    IF v_a.criado_em <= v_b.criado_em THEN
      v_mantido := _id_a; v_removido := _id_b;
    ELSE
      v_mantido := _id_b; v_removido := _id_a;
    END IF;
  END IF;

  SELECT to_jsonb(c) INTO v_snap FROM public.clientes c WHERE id = v_removido;

  UPDATE public.clientes m SET
    nome = COALESCE(NULLIF(m.nome,''), r.nome),
    nome_social = COALESCE(NULLIF(m.nome_social,''), r.nome_social),
    cpf_cnpj = COALESCE(NULLIF(m.cpf_cnpj,''), r.cpf_cnpj),
    nascimento = COALESCE(m.nascimento, r.nascimento),
    estado_civil = COALESCE(NULLIF(m.estado_civil,''), r.estado_civil),
    escolaridade = COALESCE(NULLIF(m.escolaridade,''), r.escolaridade),
    rg = COALESCE(NULLIF(m.rg,''), r.rg),
    rg_orgao_emissor = COALESCE(NULLIF(m.rg_orgao_emissor,''), r.rg_orgao_emissor),
    rg_data_expedicao = COALESCE(m.rg_data_expedicao, r.rg_data_expedicao),
    nit_pis = COALESCE(NULLIF(m.nit_pis,''), r.nit_pis),
    cnh_numero = COALESCE(NULLIF(m.cnh_numero,''), r.cnh_numero),
    cnh_categoria = COALESCE(NULLIF(m.cnh_categoria,''), r.cnh_categoria),
    cnh_validade = COALESCE(m.cnh_validade, r.cnh_validade),
    profissao = COALESCE(NULLIF(m.profissao,''), r.profissao),
    cbo = COALESCE(NULLIF(m.cbo,''), r.cbo),
    ultimo_vinculo_emprego = COALESCE(m.ultimo_vinculo_emprego, r.ultimo_vinculo_emprego),
    renda_mensal = COALESCE(m.renda_mensal, r.renda_mensal),
    membros_familia = COALESCE(m.membros_familia, r.membros_familia),
    whatsapp = COALESCE(NULLIF(m.whatsapp,''), r.whatsapp),
    telefone_adicional = COALESCE(NULLIF(m.telefone_adicional,''), r.telefone_adicional),
    email = COALESCE(NULLIF(m.email,''), r.email),
    cep = COALESCE(NULLIF(m.cep,''), r.cep),
    endereco = COALESCE(NULLIF(m.endereco,''), r.endereco),
    numero = COALESCE(NULLIF(m.numero,''), r.numero),
    complemento = COALESCE(NULLIF(m.complemento,''), r.complemento),
    bairro = COALESCE(NULLIF(m.bairro,''), r.bairro),
    cidade = COALESCE(NULLIF(m.cidade,''), r.cidade),
    estado = COALESCE(NULLIF(m.estado,''), r.estado),
    observacoes = trim(both E'\n' from concat_ws(E'\n\n---\n[Unificado em ' || to_char(now(),'DD/MM/YYYY') || ']\n', NULLIF(m.observacoes,''), NULLIF(r.observacoes,''))),
    advogado_responsavel_id = COALESCE(m.advogado_responsavel_id, r.advogado_responsavel_id),
    ativo = (m.ativo OR r.ativo),
    status = CASE
      WHEN m.status = 'ativo' OR r.status = 'ativo' THEN 'ativo'
      WHEN m.ativo OR r.ativo THEN COALESCE(NULLIF(m.status,'inativo'), NULLIF(r.status,'inativo'), 'ativo')
      ELSE COALESCE(m.status, r.status)
    END
  FROM public.clientes r
  WHERE m.id = v_mantido AND r.id = v_removido;

  FOR v_vinculo IN
    WITH vinculos AS (
      SELECT c.table_schema AS schema_name, c.table_name, c.column_name
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.column_name = 'cliente_id'

      UNION

      SELECT n.nspname, tbl.relname, att.attname
      FROM pg_constraint con
      JOIN pg_class tbl ON tbl.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = tbl.relnamespace
      JOIN unnest(con.conkey) WITH ORDINALITY ck(attnum, ord) ON true
      JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ck.attnum
      WHERE con.contype = 'f'
        AND con.confrelid = 'public.clientes'::regclass
    )
    SELECT DISTINCT schema_name, table_name, column_name
    FROM vinculos
    WHERE table_name NOT IN ('clientes', 'cliente_unificacoes')
    ORDER BY schema_name, table_name, column_name
  LOOP
    -- Qualquer conflito aborta toda a transação. Nunca prosseguir para excluir
    -- o cadastro removido com vínculos parcialmente migrados.
    EXECUTE format(
      'UPDATE %I.%I SET %I = $1 WHERE %I = $2',
      v_vinculo.schema_name,
      v_vinculo.table_name,
      v_vinculo.column_name,
      v_vinculo.column_name
    )
    USING v_mantido, v_removido;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      v_movidos := v_movidos || jsonb_build_object(
        v_vinculo.table_name || '.' || v_vinculo.column_name,
        v_count
      );
    END IF;
  END LOOP;

  INSERT INTO public.cliente_unificacoes (
    cliente_mantido_id, cliente_removido_id, cliente_removido_snapshot, registros_movidos, unificado_por
  ) VALUES (v_mantido, v_removido, v_snap, v_movidos, v_uid);

  DELETE FROM public.clientes WHERE id = v_removido;

  RETURN v_mantido;
END;
$function$
