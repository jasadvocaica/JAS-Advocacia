
-- View para listar duplicados por CPF/CNPJ
CREATE OR REPLACE VIEW public.v_clientes_duplicados AS
WITH norm AS (
  SELECT id, nome, cpf_cnpj, whatsapp, email, criado_em, ativo,
         regexp_replace(coalesce(cpf_cnpj,''), '[^0-9]', '', 'g') AS doc_norm
  FROM public.clientes
  WHERE coalesce(regexp_replace(coalesce(cpf_cnpj,''), '[^0-9]', '', 'g'),'') <> ''
), grp AS (
  SELECT doc_norm, COUNT(*) AS qtd
  FROM norm
  GROUP BY doc_norm
  HAVING COUNT(*) > 1
)
SELECT n.id, n.nome, n.cpf_cnpj, n.doc_norm, n.whatsapp, n.email, n.criado_em, n.ativo, g.qtd
FROM norm n
JOIN grp g ON g.doc_norm = n.doc_norm
ORDER BY n.doc_norm, n.criado_em;

-- Função: contar duplicados por documento (busca tempo real no form)
CREATE OR REPLACE FUNCTION public.clientes_por_documento(_doc text)
RETURNS TABLE(id uuid, nome text, cpf_cnpj text, whatsapp text, email text, status text, criado_em timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.id, c.nome, c.cpf_cnpj, c.whatsapp, c.email, c.status::text, c.criado_em
  FROM public.clientes c
  WHERE regexp_replace(coalesce(c.cpf_cnpj,''), '[^0-9]', '', 'g')
      = regexp_replace(coalesce(_doc,''), '[^0-9]', '', 'g')
    AND coalesce(regexp_replace(coalesce(_doc,''), '[^0-9]', '', 'g'),'') <> ''
  ORDER BY c.criado_em
$$;

-- Função: calcular completude do cadastro (campos preenchidos)
CREATE OR REPLACE FUNCTION public.cliente_completude(_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT (
    (CASE WHEN coalesce(nome,'')<>'' THEN 1 ELSE 0 END) +
    (CASE WHEN coalesce(cpf_cnpj,'')<>'' THEN 1 ELSE 0 END) +
    (CASE WHEN coalesce(whatsapp,'')<>'' THEN 1 ELSE 0 END) +
    (CASE WHEN coalesce(email,'')<>'' THEN 1 ELSE 0 END) +
    (CASE WHEN coalesce(rg,'')<>'' THEN 1 ELSE 0 END) +
    (CASE WHEN nascimento IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN coalesce(estado_civil,'')<>'' THEN 1 ELSE 0 END) +
    (CASE WHEN coalesce(profissao,'')<>'' THEN 1 ELSE 0 END) +
    (CASE WHEN coalesce(cep,'')<>'' THEN 1 ELSE 0 END) +
    (CASE WHEN coalesce(endereco,'')<>'' THEN 1 ELSE 0 END) +
    (CASE WHEN coalesce(cidade,'')<>'' THEN 1 ELSE 0 END) +
    (CASE WHEN coalesce(estado,'')<>'' THEN 1 ELSE 0 END) +
    (CASE WHEN coalesce(observacoes,'')<>'' THEN 1 ELSE 0 END) +
    (CASE WHEN renda_mensal IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN coalesce(nit_pis,'')<>'' THEN 1 ELSE 0 END) +
    (CASE WHEN advogado_responsavel_id IS NOT NULL THEN 1 ELSE 0 END)
  )
  FROM public.clientes WHERE id = _id
$$;

-- Tabela de log de unificações
CREATE TABLE IF NOT EXISTS public.cliente_unificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_mantido_id UUID NOT NULL,
  cliente_removido_id UUID NOT NULL,
  cliente_removido_snapshot JSONB NOT NULL,
  registros_movidos JSONB NOT NULL DEFAULT '{}'::jsonb,
  unificado_por UUID,
  unificado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cliente_unificacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gestores veem unificacoes" ON public.cliente_unificacoes
  FOR SELECT TO authenticated USING (public.is_gestor(auth.uid()));
CREATE POLICY "Sistema insere unificacoes" ON public.cliente_unificacoes
  FOR INSERT TO authenticated WITH CHECK (true);

-- RPC: unificar dois clientes (mantém o mais completo)
CREATE OR REPLACE FUNCTION public.unificar_clientes(_id_a uuid, _id_b uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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

  -- Mantém o mais completo. Empate: o mais antigo.
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

  -- Snapshot do removido
  SELECT to_jsonb(c) INTO v_snap FROM public.clientes c WHERE id = v_removido;

  -- Preenche campos vazios do mantido com os do removido
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
    ultimo_vinculo_emprego = COALESCE(NULLIF(m.ultimo_vinculo_emprego,''), r.ultimo_vinculo_emprego),
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
    advogado_responsavel_id = COALESCE(m.advogado_responsavel_id, r.advogado_responsavel_id)
  FROM public.clientes r
  WHERE m.id = v_mantido AND r.id = v_removido;

  -- Move todas as referências
  FOREACH v_tabela IN ARRAY v_tabelas LOOP
    BEGIN
      EXECUTE format('UPDATE public.%I SET cliente_id = $1 WHERE cliente_id = $2', v_tabela)
        USING v_mantido, v_removido;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      IF v_count > 0 THEN
        v_movidos := v_movidos || jsonb_build_object(v_tabela, v_count);
      END IF;
    EXCEPTION WHEN unique_violation THEN
      -- ignora conflitos de unicidade (ex.: portal_processos)
      v_movidos := v_movidos || jsonb_build_object(v_tabela || '_conflito', 'unique_violation');
    END;
  END LOOP;

  -- Log
  INSERT INTO public.cliente_unificacoes (
    cliente_mantido_id, cliente_removido_id, cliente_removido_snapshot, registros_movidos, unificado_por
  ) VALUES (v_mantido, v_removido, v_snap, v_movidos, v_uid);

  -- Remove o duplicado
  DELETE FROM public.clientes WHERE id = v_removido;

  RETURN v_mantido;
END;
$$;
