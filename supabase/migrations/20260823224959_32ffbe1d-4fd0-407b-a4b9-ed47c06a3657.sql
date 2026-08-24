CREATE OR REPLACE FUNCTION public.catalogo_homologacao_controlada()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_divorcio uuid;
  v_faltando text;
  id_audiencia_prep      uuid := 'a55978d7-d3e5-40e5-93d6-848c4a09ef72';
  id_audiencia_marcada   uuid := '94e54037-3674-4c6e-be30-c2e09555d595';
  id_onboarding          uuid := 'dd887e78-7892-4bca-9e02-5daad05091f2';
  id_onboarding_jur      uuid := '2b4473fb-ed92-4442-8e3d-5c66a3bcfbd7';
  id_peca_simples        uuid := '3371ae69-b1c1-425d-ba58-780d0324a70e';
  id_sent_analise        uuid := '2b9e5f4b-33bc-42da-ab8c-a1fb4faf6fa2';
  id_sent_decisao        uuid := '88e5e3b0-b0e8-491c-ac2f-58a96bf51466';
  id_substab_fluxo       uuid := '3fe290be-3497-4c51-a4dc-e1a058a23c1b';
  id_bpc_pos1            uuid := '7a45b752-d0e9-4a11-b97c-0e1d637032bf';
  id_bpc_pos2            uuid := 'ce6a2cf7-70eb-456a-8d53-1fe4b6faa0a5';
  id_pericia             uuid := '5b508935-53a4-4d8a-af13-a5f552506023';
  id_mod_procuracao      uuid := 'afe0326e-f417-404e-a206-75103959356f';
  id_mod_substab_amanda  uuid := '0aae41dc-9a67-46d7-bffd-9cc495b26bf2';
  id_mod_bpc_autista     uuid := '5b5edacd-a123-4baa-8fd5-025424df2c89';
  id_mod_43              uuid := 'aa1ea714-243f-48b4-af7b-0f696bcfa0b2';
  id_mod_48              uuid := '31680413-0343-4112-9281-59695081ba92';
  id_mod_49              uuid := '5935ff1a-d14b-4c64-af49-5e89c257d873';
  id_mod_50              uuid := '3cedc219-7f04-48c8-8891-5446b357758b';
  id_plano_saude         uuid := 'def0fc56-73ca-4e2a-b20d-03b90075b244';
  id_rev_emprestimo      uuid := '7117ae4d-6d9e-435d-ab1a-64f99931708c';
  id_ipi                 uuid := '924e3f6a-7e1f-431e-b3b7-af0addae9d64';
  id_ipva                uuid := '3d5b1973-e2c0-4866-bedf-7991b83c2655';
  id_cobranca            uuid := '6066e2a4-699d-48a0-b9c2-a809c3acecb2';
  id_acao_cobranca       uuid := 'b18ebf97-7bba-4c34-839d-1b6faf8b326f';
  id_guarda              uuid := '5bc8d1b1-5aa0-4ad9-b978-d20ce406b26a';
  id_guarda_inicial      uuid := 'da3ef70d-4c5a-4c2c-8d4b-4895f8b16a47';
  id_apos_incap          uuid := '74dddc95-fe8e-411a-aaee-e2c4fd5bfd33';
  id_apos_incap_perm     uuid := '47ea5db9-4fb9-49c4-9fba-f145c3ef4586';
  id_rev_benef           uuid := '2d0616e7-c3a4-4364-9e31-fedd7743910a';
  id_rev_benef_prev      uuid := '535528ca-b503-4097-90ec-622ae13ca6fa';
  id_bpc                 uuid := '74d2db75-172a-4536-b2e5-d719b38b502a';
  id_benef_assistencial  uuid := 'a4d90c35-f588-48a7-b940-58c76dddc9f5';
  id_div_consensual      uuid := '150f3888-4780-42f0-a216-911dc5bcf48f';
  id_div_cons_ext_jud    uuid := 'bd71c99f-a304-4950-b435-488f999d237e';
  id_div_litigioso       uuid := '528393b5-7b8f-4afe-9ec6-9be814d203de';
  id_inventario          uuid := '7cdf4ebe-13fd-4933-927c-a44eb23fd40b';
  id_inventario_ext_jud  uuid := '686497ae-d629-4fa2-aa88-9e8351d891b0';
  id_bpc_req_adm         uuid := '2f209042-bcae-4192-b3f5-007619926f45';
  id_bpc_neg_jud1        uuid := 'f12c3926-e20e-4511-ad78-74076585e651';
  id_bpc_neg_jud2        uuid := '2ceb6ee7-2966-4585-9e01-123a8031a22f';
  id_aux_incap           uuid := 'a5d5836d-a98a-43c9-a5f3-7673e54a3f26';
  id_aux_req_adm         uuid := 'f850ec97-f7aa-4ac6-898b-ad5e19e3689d';
  id_aux_neg1            uuid := '8f501196-19de-4526-95f7-f60a2cbd9ad0';
  id_aux_neg2            uuid := 'db5bd178-c464-4807-871c-920994fbb802';
  id_pensao_morte        uuid := '603202c7-72b7-417d-9986-124c33c4a803';
  id_pensao_req_jud      uuid := '1e2eced8-189c-41fa-b50f-e5eb5e702e97';
  id_sal_mat             uuid := '61ab8342-e5dd-4330-9c83-9d7ddc474d2c';
  id_sal_mat_req         uuid := '337e30c4-3e85-48db-8817-adece85f360d';
  id_sal_mat_rural       uuid := 'ea1c84e3-8a81-4c49-81e4-e8ddcb21f6a9';
  v_ids uuid[];
BEGIN
  IF NOT public.is_gestor(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas gestores podem executar a homologação controlada.';
  END IF;

  v_ids := ARRAY[
    id_audiencia_prep,id_audiencia_marcada,id_onboarding,id_onboarding_jur,id_peca_simples,
    id_sent_analise,id_sent_decisao,id_substab_fluxo,id_bpc_pos1,id_bpc_pos2,id_pericia,
    id_mod_procuracao,id_mod_substab_amanda,id_mod_bpc_autista,id_mod_43,id_mod_48,id_mod_49,id_mod_50,
    id_plano_saude,id_rev_emprestimo,id_ipi,id_ipva,
    id_cobranca,id_acao_cobranca,id_guarda,id_guarda_inicial,id_apos_incap,id_apos_incap_perm,
    id_rev_benef,id_rev_benef_prev,id_bpc,id_benef_assistencial,
    id_div_consensual,id_div_cons_ext_jud,id_div_litigioso,
    id_inventario,id_inventario_ext_jud,
    id_bpc_req_adm,id_bpc_neg_jud1,id_bpc_neg_jud2,
    id_aux_incap,id_aux_req_adm,id_aux_neg1,id_aux_neg2,
    id_pensao_morte,id_pensao_req_jud,
    id_sal_mat,id_sal_mat_req,id_sal_mat_rural
  ];

  SELECT string_agg(x::text, ', ') INTO v_faltando
  FROM unnest(v_ids) x
  WHERE NOT EXISTS (SELECT 1 FROM public.catalogo_servicos c WHERE c.id = x);

  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'Homologação abortada: IDs não encontrados no catálogo: %', v_faltando;
  END IF;

  UPDATE public.catalogo_servicos
     SET classificacao = 'pop_auxiliar',
         metadados = metadados || jsonb_build_object('homologacao_controlada', 'v1')
   WHERE id = ANY (ARRAY[
     id_audiencia_prep,id_audiencia_marcada,id_onboarding,id_onboarding_jur,id_peca_simples,
     id_sent_analise,id_sent_decisao,id_substab_fluxo,id_bpc_pos1,id_bpc_pos2,id_pericia]);

  UPDATE public.catalogo_servicos SET servico_principal_id = id_audiencia_prep WHERE id = id_audiencia_marcada;
  UPDATE public.catalogo_servicos SET servico_principal_id = id_onboarding     WHERE id = id_onboarding_jur;
  UPDATE public.catalogo_servicos SET servico_principal_id = id_sent_decisao   WHERE id = id_sent_analise;
  UPDATE public.catalogo_servicos SET servico_principal_id = id_bpc            WHERE id IN (id_bpc_pos1, id_bpc_pos2);

  UPDATE public.catalogo_servicos
     SET classificacao = 'modelo_documento',
         metadados = metadados || jsonb_build_object('homologacao_controlada', 'v1')
   WHERE id = ANY (ARRAY[id_mod_procuracao,id_mod_substab_amanda,id_mod_bpc_autista,
                         id_mod_43,id_mod_48,id_mod_49,id_mod_50]);

  UPDATE public.catalogo_servicos SET area = 'consumidor'
   WHERE id IN (id_plano_saude, id_rev_emprestimo);
  UPDATE public.catalogo_servicos SET area = 'tributario'
   WHERE id IN (id_ipi, id_ipva);

  UPDATE public.catalogo_servicos
     SET possivel_duplicidade = false,
         duplicidade_grupo = NULL,
         duplicidade_justificativa = NULL,
         duplicidade_sugerida = false,
         duplicidade_sugerida_justificativa = NULL,
         servico_principal_id = NULL,
         servico_principal_sugerido_id = NULL,
         servico_principal_sugerido_nome = NULL
   WHERE id IN (id_ipi, id_ipva);

  UPDATE public.catalogo_servicos c
     SET servico_principal_id = m.principal,
         modalidade = COALESCE(m.modalidade, c.modalidade),
         classificacao = 'servico_juridico',
         metadados = c.metadados
                     || jsonb_build_object('homologacao_controlada', 'v1')
                     || jsonb_build_object('alias_historico', jsonb_build_object(
                          'nome', c.nome, 'origem_tabela', c.origem_tabela, 'origem_id', c.origem_id,
                          'origem_texto', c.origem_texto))
    FROM (VALUES
      (id_acao_cobranca,   id_cobranca,   NULL::text),
      (id_guarda_inicial,  id_guarda,     NULL),
      (id_apos_incap_perm, id_apos_incap, 'Incapacidade permanente'),
      (id_rev_benef_prev,  id_rev_benef,  'Revisão previdenciária'),
      (id_benef_assistencial, id_bpc,     NULL)
    ) AS m(alvo, principal, modalidade)
   WHERE c.id = m.alvo;

  UPDATE public.catalogo_servicos
     SET classificacao = 'servico_juridico',
         metadados = metadados || jsonb_build_object('homologacao_controlada', 'v1')
   WHERE id IN (id_cobranca, id_guarda, id_apos_incap, id_rev_benef, id_bpc);

  SELECT id INTO v_divorcio FROM public.catalogo_servicos
   WHERE origem_tabela = 'homologacao_controlada' AND nome_norm = public.catalogo_norm('Divórcio')
   LIMIT 1;

  IF v_divorcio IS NULL THEN
    INSERT INTO public.catalogo_servicos
      (nome, area, status_homologacao, classificacao, publico,
       ativo_operacional, origem_tabela, origem_texto, metadados)
    VALUES ('Divórcio', 'familia',
            'a_confirmar', 'servico_juridico', 'ambos', false,
            'homologacao_controlada', 'Serviço principal criado na homologação controlada',
            jsonb_build_object('homologacao_controlada', 'v1', 'servico_principal_familia', 'divorcio'))
    RETURNING id INTO v_divorcio;
  END IF;

  UPDATE public.catalogo_servicos c
     SET servico_principal_id = v_divorcio,
         modalidade = m.modalidade,
         classificacao = 'servico_juridico',
         metadados = c.metadados || jsonb_build_object('homologacao_controlada', 'v1')
    FROM (VALUES
      (id_div_consensual,   'Consensual'),
      (id_div_cons_ext_jud, 'Judicial ou Extrajudicial — seleção futura'),
      (id_div_litigioso,    'Litigioso')
    ) AS m(alvo, modalidade)
   WHERE c.id = m.alvo;

  UPDATE public.catalogo_servicos SET classificacao = 'servico_juridico' WHERE id = id_inventario;
  UPDATE public.catalogo_servicos
     SET classificacao = 'servico_juridico',
         servico_principal_id = id_inventario,
         modalidade = 'Judicial ou Extrajudicial — seleção futura'
   WHERE id = id_inventario_ext_jud;

  UPDATE public.catalogo_servicos
     SET classificacao = 'servico_juridico', servico_principal_id = id_bpc,
         modalidade = 'Requerimento administrativo'
   WHERE id = id_bpc_req_adm;
  UPDATE public.catalogo_servicos
     SET classificacao = 'servico_juridico', servico_principal_id = id_bpc,
         modalidade = 'Judicial após indeferimento'
   WHERE id IN (id_bpc_neg_jud1, id_bpc_neg_jud2);

  UPDATE public.catalogo_servicos SET classificacao = 'servico_juridico' WHERE id = id_aux_incap;
  UPDATE public.catalogo_servicos
     SET classificacao = 'servico_juridico', servico_principal_id = id_aux_incap,
         modalidade = 'Requerimento administrativo'
   WHERE id = id_aux_req_adm;
  UPDATE public.catalogo_servicos
     SET classificacao = 'servico_juridico', servico_principal_id = id_aux_incap,
         modalidade = 'Judicial após negativa'
   WHERE id IN (id_aux_neg1, id_aux_neg2);

  UPDATE public.catalogo_servicos SET classificacao = 'servico_juridico' WHERE id = id_pensao_morte;
  UPDATE public.catalogo_servicos
     SET classificacao = 'servico_juridico', servico_principal_id = id_pensao_morte,
         modalidade = 'Requerimento administrativo ou Judicial — seleção futura'
   WHERE id = id_pensao_req_jud;

  UPDATE public.catalogo_servicos SET classificacao = 'servico_juridico' WHERE id = id_sal_mat;
  UPDATE public.catalogo_servicos
     SET classificacao = 'servico_juridico', servico_principal_id = id_sal_mat,
         modalidade = 'Requerimento INSS'
   WHERE id = id_sal_mat_req;
  UPDATE public.catalogo_servicos
     SET servico_principal_id = NULL,
         servico_principal_sugerido_id = NULL,
         servico_principal_sugerido_nome = NULL,
         possivel_duplicidade = false,
         duplicidade_grupo = NULL,
         duplicidade_justificativa = NULL,
         duplicidade_sugerida = false,
         duplicidade_sugerida_justificativa = NULL
   WHERE id = id_sal_mat_rural;

  RETURN jsonb_build_object(
    'divorcio_id', v_divorcio,
    'servico_juridico', (SELECT count(*) FROM public.catalogo_servicos WHERE classificacao = 'servico_juridico'),
    'pop_auxiliar', (SELECT count(*) FROM public.catalogo_servicos WHERE classificacao = 'pop_auxiliar'),
    'modelo_documento', (SELECT count(*) FROM public.catalogo_servicos WHERE classificacao = 'modelo_documento'),
    'legado_descartar', (SELECT count(*) FROM public.catalogo_servicos WHERE classificacao = 'legado_descartar'),
    'a_confirmar', (SELECT count(*) FROM public.catalogo_servicos WHERE classificacao = 'a_confirmar'),
    'ativos_operacionais', (SELECT count(*) FROM public.catalogo_servicos WHERE ativo_operacional),
    'total', (SELECT count(*) FROM public.catalogo_servicos)
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.catalogo_homologacao_controlada() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalogo_homologacao_controlada() TO authenticated;