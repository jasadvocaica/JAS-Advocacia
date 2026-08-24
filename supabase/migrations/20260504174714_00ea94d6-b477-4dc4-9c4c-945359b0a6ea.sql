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
  v_tabelas TEXT[] := ARRAY[
    'cliente_atendimentos','cliente_beneficios_inss','cliente_credenciais',
    'cliente_interacoes','cliente_portal_andamentos','cliente_portal_atualizacoes',
    'cliente_portal_documentos','cliente_portal_financeiro','cliente_portal_mensagens',
    'cliente_portal_processos','cliente_usuarios','controladoria_itens',
    'dje_itens_extraidos','doc_pecas','documentos','ferramentas_analises_caso',
    'ferramentas_calculos_cnis','ferramentas_calculos_salvos','ferramentas_notificacoes',
    'fluxo_instancias','honorarios_contratos','honorarios_exito','honorarios_legado',
    'honorarios_pagamentos','honorarios_repasses','mkt_leads','parceiro_submissoes',
    'pje_monitoramentos','processo_parceiros','processos'
  ];
  v_tabela TEXT;
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

  FOREACH v_tabela IN ARRAY v_tabelas LOOP
    BEGIN
      EXECUTE format('UPDATE public.%I SET cliente_id = $1 WHERE cliente_id = $2', v_tabela)
        USING v_mantido, v_removido;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      IF v_count > 0 THEN
        v_movidos := v_movidos || jsonb_build_object(v_tabela, v_count);
      END IF;
    EXCEPTION WHEN unique_violation THEN
      v_movidos := v_movidos || jsonb_build_object(v_tabela || '_conflito', 'unique_violation');
    END;
  END LOOP;

  INSERT INTO public.cliente_unificacoes (
    cliente_mantido_id, cliente_removido_id, cliente_removido_snapshot, registros_movidos, unificado_por
  ) VALUES (v_mantido, v_removido, v_snap, v_movidos, v_uid);

  DELETE FROM public.clientes WHERE id = v_removido;

  RETURN v_mantido;
END;
$function$;

-- Reativar clientes que foram unificados e ficaram inativos por causa do bug
UPDATE public.clientes c
SET ativo = true,
    status = CASE WHEN status = 'inativo' OR status IS NULL THEN 'ativo' ELSE status END
WHERE id IN (SELECT cliente_mantido_id FROM public.cliente_unificacoes)
  AND (ativo = false OR status = 'inativo');