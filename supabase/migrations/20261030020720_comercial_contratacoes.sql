-- Fluxo de contratação: reutiliza clientes, doc_modelos e tarefas. Sem cobranças automáticas.
CREATE SCHEMA comercial_privado;
REVOKE ALL ON SCHEMA comercial_privado FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA comercial_privado TO authenticated,service_role;
CREATE TABLE public.comercial_acessos (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id), preparar boolean NOT NULL DEFAULT false,
 conferir boolean NOT NULL DEFAULT false,enviar boolean NOT NULL DEFAULT false,gerenciar boolean NOT NULL DEFAULT false,
 ver_todos boolean NOT NULL DEFAULT false,formalizar_manual boolean NOT NULL DEFAULT false,ver_comissao boolean NOT NULL DEFAULT false,alterar_comissao boolean NOT NULL DEFAULT false
);
CREATE FUNCTION comercial_privado.pode(acao text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND public.is_interno_ativo(auth.uid()) AND (public.is_gestor(auth.uid()) OR
 EXISTS(SELECT 1 FROM public.comercial_acessos a WHERE a.user_id=auth.uid() AND CASE acao WHEN 'preparar' THEN a.preparar WHEN 'conferir' THEN a.conferir WHEN 'enviar' THEN a.enviar WHEN 'gerenciar' THEN a.gerenciar WHEN 'ver_todos' THEN a.ver_todos WHEN 'formalizar_manual' THEN a.formalizar_manual WHEN 'ver_comissao' THEN a.ver_comissao WHEN 'alterar_comissao' THEN a.alterar_comissao WHEN 'visualizar' THEN a.preparar OR a.conferir OR a.enviar OR a.gerenciar ELSE false END)
 OR (acao IN ('visualizar','preparar') AND marketing_privado.comercial(CASE WHEN acao='preparar' THEN 'editar' ELSE 'visualizar' END)))
$$;
CREATE TABLE public.comercial_config (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),envio_habilitado boolean NOT NULL DEFAULT false,
 ambiente text NOT NULL DEFAULT 'sandbox' CHECK(ambiente IN ('sandbox','producao')),
 ciclo_inicio date NOT NULL DEFAULT date_trunc('month',current_date)::date,ciclo_fim date NOT NULL DEFAULT (date_trunc('month',current_date)+interval '1 month')::date,
 limite_documentos integer NOT NULL DEFAULT 20 CHECK(limite_documentos BETWEEN 1 AND 100000),alerta_documentos integer NOT NULL DEFAULT 16 CHECK(alerta_documentos>=0),
 responsavel_operacional uuid REFERENCES public.profiles(id),responsavel_financeiro uuid REFERENCES public.profiles(id),prazo_interno_dias integer NOT NULL DEFAULT 3 CHECK(prazo_interno_dias BETWEEN 0 AND 90),
 CHECK(ciclo_fim>ciclo_inicio),CHECK(alerta_documentos<=limite_documentos)
);
INSERT INTO public.comercial_config(id) VALUES(true);
CREATE TABLE public.comercial_modelos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),nome text NOT NULL,versao integer NOT NULL DEFAULT 1 CHECK(versao>0),
 servico_id uuid REFERENCES public.catalogo_servicos(id),tese_id uuid REFERENCES public.juridico_teses(id),
 contrato_modelo_id uuid NOT NULL REFERENCES public.doc_modelos(id),procuracao_modelo_id uuid REFERENCES public.doc_modelos(id),declaracao_modelo_id uuid REFERENCES public.doc_modelos(id),
 campos_obrigatorios jsonb NOT NULL DEFAULT '["cliente.nome","cliente.cpf_cnpj","cliente.whatsapp","cliente.endereco","cliente.cidade","cliente.estado","objeto"]',
 signatarios jsonb NOT NULL DEFAULT '{"contrato":["cliente"],"procuracao_declaracao":["cliente"]}',
 checklist jsonb NOT NULL DEFAULT '[]',exigir_pagamento_inicio boolean NOT NULL DEFAULT false,
 estado text NOT NULL DEFAULT 'rascunho' CHECK(estado IN ('rascunho','aprovado','inativo')),somente_teste boolean NOT NULL DEFAULT true,
 snapshot jsonb,criado_por uuid REFERENCES public.profiles(id) DEFAULT auth.uid(),aprovado_por uuid REFERENCES public.profiles(id),aprovado_em timestamptz,criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.comercial_contratacoes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid REFERENCES public.clientes(id),modelo_id uuid REFERENCES public.comercial_modelos(id),
 servico_id uuid REFERENCES public.catalogo_servicos(id),tese_id uuid REFERENCES public.juridico_teses(id),objeto text NOT NULL DEFAULT '',uf_atuacao text,
 responsavel_id uuid NOT NULL REFERENCES public.profiles(id),criado_por uuid NOT NULL REFERENCES public.profiles(id) DEFAULT auth.uid(),
 dados jsonb NOT NULL DEFAULT '{}',signatarios jsonb NOT NULL DEFAULT '{}',incluir_declaracao boolean NOT NULL DEFAULT false,
 honorarios_iniciais boolean,condicoes jsonb NOT NULL DEFAULT '{}',observacoes text NOT NULL DEFAULT '',pendencias_documentais text NOT NULL DEFAULT '',
 versao integer NOT NULL DEFAULT 1,conferida_versao integer,conferida_por uuid REFERENCES public.profiles(id),conferida_em timestamptz,conferencia_hash text,
 status text NOT NULL DEFAULT 'rascunho' CHECK(status IN ('rascunho','aguardando_conferencia','pronto_envio','envio_parcial_falha','aguardando_assinatura','parcialmente_assinado','formalizado','cancelado','expirado','teste_concluido')),
 formalizado_em timestamptz,formalizado_por uuid REFERENCES public.profiles(id),formalizacao_origem text CHECK(formalizacao_origem IN ('zapsign','manual')),
 tarefa_operacional_id uuid UNIQUE REFERENCES public.controladoria_itens(id),tarefa_financeira_id uuid UNIQUE REFERENCES public.controladoria_itens(id),
 operacional_status text NOT NULL DEFAULT 'nao_iniciado' CHECK(operacional_status IN ('nao_iniciado','pendente','encaminhado','aguardando_pagamento')),
 financeiro_status text NOT NULL DEFAULT 'nao_aplicavel' CHECK(financeiro_status IN ('nao_aplicavel','pendente','cobranca_preparada')),
 financeiro_referencia_id uuid REFERENCES public.honorarios_contratos(id),link_pagamento text,encaminhamento_erro text,
 criado_em timestamptz NOT NULL DEFAULT now(),atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.comercial_condicoes_comissao (
 contratacao_id uuid PRIMARY KEY REFERENCES public.comercial_contratacoes(id),tem_comissao boolean NOT NULL DEFAULT false,
 percentual numeric(7,4) NOT NULL DEFAULT 0 CHECK(percentual BETWEEN 0 AND 100),base text NOT NULL DEFAULT 'recebimentos_confirmados' CHECK(base='recebimentos_confirmados'),
 condicao text NOT NULL DEFAULT '',beneficiario_id uuid REFERENCES public.profiles(id),atualizado_por uuid REFERENCES public.profiles(id),atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.comercial_documentos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),contratacao_id uuid NOT NULL REFERENCES public.comercial_contratacoes(id),versao integer NOT NULL,
 tipo text NOT NULL CHECK(tipo IN ('contrato','procuracao_declaracao')),conteudo_html text NOT NULL,conteudo_hash text NOT NULL,
 signatarios jsonb NOT NULL,modelo_snapshot jsonb NOT NULL,ambiente text NOT NULL CHECK(ambiente IN ('sandbox','producao')),
 estado text NOT NULL DEFAULT 'preparado' CHECK(estado IN ('preparado','em_envio','incerto','falha','criado','parcialmente_assinado','assinado','recusado','cancelado','expirado')),
 externo_id text,links_assinatura jsonb NOT NULL DEFAULT '[]',assinaturas jsonb NOT NULL DEFAULT '[]',arquivo_assinado_path text,
 lease_id uuid,lease_ate timestamptz,tentado_em timestamptz,criado_provedor_em timestamptz,assinado_em timestamptz,erro_codigo text,
 UNIQUE(contratacao_id,versao,tipo),UNIQUE(ambiente,externo_id)
);
CREATE TABLE public.comercial_historico (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,contratacao_id uuid REFERENCES public.comercial_contratacoes(id),usuario_id uuid REFERENCES public.profiles(id),
 acao text NOT NULL,dados jsonb NOT NULL DEFAULT '{}',criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comercial_contratacoes_cliente ON public.comercial_contratacoes(cliente_id);
CREATE INDEX comercial_contratacoes_responsavel_data ON public.comercial_contratacoes(responsavel_id,criado_em DESC);
CREATE INDEX comercial_contratacoes_status_data ON public.comercial_contratacoes(status,criado_em DESC);
CREATE INDEX comercial_documentos_ct ON public.comercial_documentos(contratacao_id,versao);
CREATE INDEX comercial_documentos_consumo ON public.comercial_documentos(ambiente,tentado_em) WHERE estado NOT IN ('preparado','falha');
CREATE INDEX comercial_historico_ct ON public.comercial_historico(contratacao_id,criado_em DESC);
CREATE FUNCTION comercial_privado.ver(alvo uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.is_interno_ativo(auth.uid()) AND EXISTS(SELECT 1 FROM public.comercial_contratacoes c WHERE c.id=alvo AND (public.is_gestor(auth.uid()) OR
 (comercial_privado.pode('visualizar') AND (c.responsavel_id=auth.uid() OR c.criado_por=auth.uid() OR comercial_privado.pode('ver_todos')) AND (c.cliente_id IS NULL OR public.usuario_ve_cliente(auth.uid(),c.cliente_id))) OR
 (public.has_permission(auth.uid(),'controladoria','visualizar') AND c.status='formalizado' AND EXISTS(SELECT 1 FROM public.controladoria_itens t WHERE t.id=c.tarefa_operacional_id AND (t.responsavel_id=auth.uid() OR t.executor_id=auth.uid()))) OR
 (public.has_permission(auth.uid(),'financeiro','visualizar') AND c.status='formalizado' AND public.usuario_ve_cliente(auth.uid(),c.cliente_id))))
$$;
CREATE FUNCTION comercial_privado.auditar(alvo uuid,acao text,dados jsonb DEFAULT '{}') RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 INSERT INTO public.comercial_historico(contratacao_id,usuario_id,acao,dados) VALUES(alvo,auth.uid(),acao,dados)
$$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['comercial_acessos','comercial_config','comercial_modelos','comercial_contratacoes','comercial_condicoes_comissao','comercial_documentos','comercial_historico'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);
 EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
END $$;
-- Escritas passam exclusivamente pelo orquestrador autenticado.
GRANT SELECT ON public.comercial_config,public.comercial_modelos,public.comercial_documentos,public.comercial_contratacoes,public.comercial_historico,public.comercial_condicoes_comissao,public.comercial_acessos TO authenticated;
CREATE POLICY comercial_acessos_ler ON public.comercial_acessos FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.is_gestor(auth.uid()));
CREATE POLICY comercial_config_ler ON public.comercial_config FOR SELECT TO authenticated USING(comercial_privado.pode('visualizar') OR public.has_permission(auth.uid(),'financeiro','visualizar'));
CREATE POLICY comercial_modelos_ler ON public.comercial_modelos FOR SELECT TO authenticated USING(comercial_privado.pode('gerenciar') OR (comercial_privado.pode('visualizar') AND estado='aprovado'));
CREATE POLICY comercial_contratacoes_ler ON public.comercial_contratacoes FOR SELECT TO authenticated USING(comercial_privado.ver(id));
CREATE POLICY comercial_docs_ler ON public.comercial_documentos FOR SELECT TO authenticated USING(comercial_privado.ver(contratacao_id));
CREATE POLICY comercial_comissao_ler ON public.comercial_condicoes_comissao FOR SELECT TO authenticated USING(comercial_privado.ver(contratacao_id) AND (public.is_gestor(auth.uid()) OR comercial_privado.pode('alterar_comissao') OR public.has_permission(auth.uid(),'financeiro','visualizar') OR (comercial_privado.pode('ver_comissao') AND beneficiario_id=auth.uid())));
CREATE POLICY comercial_historico_ler ON public.comercial_historico FOR SELECT TO authenticated USING(comercial_privado.ver(contratacao_id) AND (acao<>'comissao_alterada' OR public.is_gestor(auth.uid()) OR public.has_permission(auth.uid(),'financeiro','visualizar')));
CREATE FUNCTION comercial_privado.escapar(v text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT replace(replace(replace(replace(coalesce(v,''),'&','&amp;'),'<','&lt;'),'>','&gt;'),'"','&quot;') $$;
CREATE FUNCTION comercial_privado.valores(c public.comercial_contratacoes) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((SELECT jsonb_object_agg('cliente.'||x.key,x.value) FROM public.clientes cl CROSS JOIN LATERAL jsonb_each(to_jsonb(cl)) x WHERE cl.id=c.cliente_id AND x.key IN ('nome','cpf_cnpj','rg','estado_civil','profissao','whatsapp','email','endereco','numero','complemento','bairro','cep','cidade','estado','responsavel_legal_nome','responsavel_legal_cpf','responsavel_legal_parentesco')),'{}')
 ||c.dados||jsonb_build_object('objeto',c.objeto,'honorarios.iniciais',CASE WHEN c.honorarios_iniciais THEN 'Com honorários iniciais' ELSE 'Sem honorários iniciais' END,'honorarios.total',to_char(coalesce((c.condicoes->>'total_centavos')::numeric,0)/100,'FM999999999990D00'),'honorarios.entrada',to_char(coalesce((c.condicoes->>'entrada_centavos')::numeric,0)/100,'FM999999999990D00'),'honorarios.parcelamento',coalesce(c.condicoes->>'descricao_parcelamento',''),'honorarios.forma_pagamento',c.condicoes->>'forma_pagamento','honorarios.exito',c.condicoes->>'exito_descricao','data',coalesce(c.dados->>'data',to_char(c.criado_em AT TIME ZONE 'America/Cuiaba','DD/MM/YYYY')))
$$;
CREATE FUNCTION comercial_privado.hash(c public.comercial_contratacoes) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT md5(comercial_privado.valores(c)::text||c.condicoes::text||c.signatarios::text||c.versao::text||coalesce(c.modelo_id::text,''))
$$;
CREATE FUNCTION comercial_privado.validar(c public.comercial_contratacoes) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE total bigint; entrada bigint; soma bigint; parcela jsonb; m public.comercial_modelos; valores jsonb; campo text; tipo text; papel text; signer jsonb;
BEGIN
 IF nullif(c.dados->'cadastro_pendente','null'::jsonb) IS NOT NULL THEN RAISE EXCEPTION 'Salve as alterações do cliente no cadastro central antes da conferência'; END IF;
 IF c.cliente_id IS NULL OR c.modelo_id IS NULL OR c.servico_id IS NULL OR length(trim(c.objeto))<3 OR c.honorarios_iniciais IS NULL THEN RAISE EXCEPTION 'Preencha cliente, serviço, modelo, objeto e classificação dos honorários'; END IF;
 SELECT * INTO m FROM public.comercial_modelos WHERE id=c.modelo_id;
 IF m.estado<>'aprovado' OR m.snapshot IS NULL THEN RAISE EXCEPTION 'Modelo aprovado necessário'; END IF;
 IF (m.servico_id IS NOT NULL AND m.servico_id<>c.servico_id) OR (m.tese_id IS NOT NULL AND m.tese_id IS DISTINCT FROM c.tese_id) THEN RAISE EXCEPTION 'Modelo não corresponde ao serviço/tese'; END IF;
 IF c.incluir_declaracao AND m.declaracao_modelo_id IS NULL THEN RAISE EXCEPTION 'Declaração não configurada neste modelo'; END IF;
 total:=coalesce((c.condicoes->>'total_centavos')::bigint,0);entrada:=coalesce((c.condicoes->>'entrada_centavos')::bigint,0);soma:=entrada;
 IF total<0 OR entrada<0 OR entrada>total THEN RAISE EXCEPTION 'Valores de honorários inconsistentes'; END IF;
 IF jsonb_typeof(coalesce(c.condicoes->'parcelas','[]'))<>'array' THEN RAISE EXCEPTION 'Parcelamento inválido'; END IF;
 IF jsonb_array_length(coalesce(c.condicoes->'parcelas','[]'))>120 THEN RAISE EXCEPTION 'Máximo de 120 parcelas'; END IF;
 FOR parcela IN SELECT * FROM jsonb_array_elements(coalesce(c.condicoes->'parcelas','[]')) LOOP
  IF coalesce((parcela->>'centavos')::bigint,0)<=0 OR nullif(parcela->>'vencimento','') IS NULL THEN RAISE EXCEPTION 'Informe valor e vencimento de cada parcela'; END IF;
  PERFORM (parcela->>'vencimento')::date;soma:=soma+(parcela->>'centavos')::bigint;
 END LOOP;
 IF c.honorarios_iniciais AND (total<=0 OR total<>soma OR nullif(c.condicoes->>'forma_pagamento','') IS NULL) THEN RAISE EXCEPTION 'Total deve ser igual à entrada mais parcelas; informe forma de pagamento'; END IF;
 IF NOT c.honorarios_iniciais AND (total<>0 OR entrada<>0 OR soma<>0) THEN RAISE EXCEPTION 'Sem honorários iniciais não pode haver cobrança inicial'; END IF;
 IF NOT c.honorarios_iniciais AND length(trim(coalesce(c.condicoes->>'exito_descricao','')))<5 THEN RAISE EXCEPTION 'Descreva honorários futuros, percentual e base de cálculo aplicáveis'; END IF;
 valores:=comercial_privado.valores(c);
 FOR campo IN SELECT jsonb_array_elements_text(m.campos_obrigatorios) LOOP IF nullif(trim(valores->>campo),'') IS NULL THEN RAISE EXCEPTION 'Campo obrigatório: %',campo; END IF; END LOOP;
 FOR tipo IN SELECT key FROM jsonb_each(m.signatarios) LOOP
  IF tipo='procuracao_declaracao' AND m.procuracao_modelo_id IS NULL THEN CONTINUE; END IF;
  IF jsonb_array_length(m.signatarios->tipo)=0 THEN RAISE EXCEPTION 'Configure signatários de cada documento'; END IF;
  FOR papel IN SELECT jsonb_array_elements_text(m.signatarios->tipo) LOOP
   signer:=c.signatarios->papel;
   IF length(trim(coalesce(signer->>'nome','')))<3 THEN RAISE EXCEPTION 'Informe o signatário: %',papel; END IF;
   IF coalesce(signer->>'email','')<>'' AND (signer->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Email inválido do signatário'; END IF;
  END LOOP;
 END LOOP;
END $$;
CREATE FUNCTION comercial_privado.render(html text,valores jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE k text;v jsonb;texto text:=html; BEGIN
 FOR k,v IN SELECT * FROM jsonb_each(valores) LOOP IF position('{{'||k||'}}' in texto)>0 AND nullif(trim(v#>>'{}'),'') IS NULL THEN RAISE EXCEPTION 'Campo usado no documento está vazio: %',k;END IF;texto:=replace(texto,'{{'||k||'}}',comercial_privado.escapar(v#>>'{}')); END LOOP;
 IF texto ~ '\{\{[^}]+\}\}' THEN RAISE EXCEPTION 'Modelo contém variável sem preenchimento: %',substring(texto from '\{\{[^}]+\}\}'); END IF;
 RETURN texto;
END $$;
CREATE FUNCTION comercial_privado.preparar(c public.comercial_contratacoes) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.comercial_modelos;valores jsonb;v_tipo text;html text;signers jsonb;papel text;cfg public.comercial_config;
BEGIN
 PERFORM comercial_privado.validar(c);SELECT * INTO m FROM public.comercial_modelos WHERE id=c.modelo_id;SELECT * INTO cfg FROM public.comercial_config WHERE id;
 valores:=comercial_privado.valores(c);
 FOR v_tipo IN SELECT unnest(ARRAY['contrato','procuracao_declaracao']) LOOP
  IF v_tipo='procuracao_declaracao' AND m.procuracao_modelo_id IS NULL THEN CONTINUE; END IF;
  html:=m.snapshot->>v_tipo;
  IF v_tipo='procuracao_declaracao' AND c.incluir_declaracao THEN html:=html||'<div style="page-break-before:always"></div>'||(m.snapshot->>'declaracao'); END IF;
  html:=comercial_privado.render(html,valores);signers:='[]';
  FOR papel IN SELECT jsonb_array_elements_text(m.signatarios->v_tipo) LOOP signers:=signers||jsonb_build_array((c.signatarios->papel)||jsonb_build_object('papel',papel)); END LOOP;
  INSERT INTO public.comercial_documentos(contratacao_id,versao,tipo,conteudo_html,conteudo_hash,signatarios,modelo_snapshot,ambiente)
  VALUES(c.id,c.versao,v_tipo,html,md5(html),signers,jsonb_build_object('id',m.id,'nome',m.nome,'versao',m.versao,'aprovado_por',m.aprovado_por,'aprovado_em',m.aprovado_em,'somente_teste',m.somente_teste),cfg.ambiente)
  ON CONFLICT(contratacao_id,versao,tipo) DO UPDATE SET conteudo_html=excluded.conteudo_html,conteudo_hash=excluded.conteudo_hash,signatarios=excluded.signatarios,modelo_snapshot=excluded.modelo_snapshot WHERE comercial_documentos.estado='preparado';
 END LOOP;
END $$;
CREATE FUNCTION comercial_privado.encaminhar(alvo uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.comercial_contratacoes;cfg public.comercial_config;m public.comercial_modelos;novo uuid;descricao text; BEGIN
 SELECT * INTO c FROM public.comercial_contratacoes WHERE id=alvo FOR UPDATE;
 IF c.status<>'formalizado' THEN RETURN; END IF;
 SELECT * INTO cfg FROM public.comercial_config WHERE id;SELECT * INTO m FROM public.comercial_modelos WHERE id=c.modelo_id;
 descricao:='Contratação: '||c.id||E'\nObjeto: '||c.objeto||E'\nServiço: '||coalesce((SELECT nome FROM public.catalogo_servicos WHERE id=c.servico_id),'')||E'\nPendências documentais: '||c.pendencias_documentais||E'\nChecklist: '||m.checklist::text||E'\nConsultar documentos assinados e condições: /comercial/contratacoes?contratacao='||c.id;
 -- Exceções são isoladas para nunca desfazer a assinatura confirmada.
 BEGIN
  IF c.tarefa_operacional_id IS NULL THEN
   IF cfg.responsavel_operacional IS NULL OR NOT public.is_interno_ativo(cfg.responsavel_operacional) THEN RAISE EXCEPTION 'Configure responsável operacional ativo'; END IF;
   IF EXISTS(SELECT 1 FROM public.comercial_documentos WHERE contratacao_id=c.id AND versao=c.versao AND arquivo_assinado_path IS NULL) THEN RAISE EXCEPTION 'Preservação dos arquivos assinados pendente'; END IF;
   IF m.exigir_pagamento_inicio AND NOT EXISTS(SELECT 1 FROM public.honorarios_pagamentos p WHERE p.contrato_id=c.financeiro_referencia_id AND p.valor_recebido>0) THEN
    UPDATE public.comercial_contratacoes SET operacional_status='aguardando_pagamento',encaminhamento_erro='Serviço exige recebimento confirmado no Financeiro antes da entrada operacional' WHERE id=c.id;
   ELSE
    INSERT INTO public.controladoria_itens(titulo,tipo,status,prioridade,data_vencimento,cliente_id,responsavel_id,executor_id,criado_por,origem,descricao)
    VALUES('Conferir contratação e organizar documentação inicial','tarefa','pendente','media',now()+make_interval(days=>cfg.prazo_interno_dias),c.cliente_id,cfg.responsavel_operacional,cfg.responsavel_operacional,c.responsavel_id,'fluxo_automatico',descricao) RETURNING id INTO novo;
    INSERT INTO public.user_client_links(user_id,cliente_id,criado_por) VALUES(cfg.responsavel_operacional,c.cliente_id,c.responsavel_id) ON CONFLICT DO NOTHING;
    UPDATE public.comercial_contratacoes SET tarefa_operacional_id=novo,operacional_status='encaminhado',encaminhamento_erro=NULL WHERE id=c.id;
    PERFORM comercial_privado.auditar(c.id,'encaminhamento_operacional',jsonb_build_object('tarefa_id',novo));
   END IF;
  END IF;
 EXCEPTION WHEN OTHERS THEN UPDATE public.comercial_contratacoes SET operacional_status='pendente',encaminhamento_erro=SQLERRM WHERE id=c.id; END;
 BEGIN
  IF c.honorarios_iniciais AND c.tarefa_financeira_id IS NULL THEN
   IF cfg.responsavel_financeiro IS NULL OR NOT public.is_interno_ativo(cfg.responsavel_financeiro) THEN RAISE EXCEPTION 'Configure responsável financeiro ativo'; END IF;
   INSERT INTO public.controladoria_itens(titulo,tipo,status,prioridade,data_vencimento,cliente_id,responsavel_id,executor_id,criado_por,origem,descricao)
   VALUES('Preparar cobrança da contratação','tarefa','pendente','media',now()+make_interval(days=>cfg.prazo_interno_dias),c.cliente_id,cfg.responsavel_financeiro,cfg.responsavel_financeiro,c.responsavel_id,'fluxo_automatico',descricao||E'\nPreparar cobrança no Financeiro. Esta pendência não é uma receita nem pagamento recebido.') RETURNING id INTO novo;
   INSERT INTO public.user_client_links(user_id,cliente_id,criado_por) VALUES(cfg.responsavel_financeiro,c.cliente_id,c.responsavel_id) ON CONFLICT DO NOTHING;
   UPDATE public.comercial_contratacoes SET tarefa_financeira_id=novo,financeiro_status='pendente' WHERE id=c.id;
   PERFORM comercial_privado.auditar(c.id,'pendencia_financeira_criada',jsonb_build_object('tarefa_id',novo));
  END IF;
 EXCEPTION WHEN OTHERS THEN UPDATE public.comercial_contratacoes SET financeiro_status='pendente',encaminhamento_erro=concat_ws('; ',encaminhamento_erro,SQLERRM) WHERE id=c.id; END;
END $$;
CREATE FUNCTION comercial_privado.recalcular(alvo uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.comercial_contratacoes;m public.comercial_modelos;n integer;assinados integer;criados integer;parcial boolean;novostatus text;
BEGIN
 SELECT * INTO c FROM public.comercial_contratacoes WHERE id=alvo FOR UPDATE;IF c.status IN ('formalizado','cancelado','teste_concluido') THEN RETURN; END IF;
 SELECT * INTO m FROM public.comercial_modelos WHERE id=c.modelo_id;
 SELECT count(*),count(*) FILTER(WHERE estado='assinado'),count(*) FILTER(WHERE externo_id IS NOT NULL),bool_or(estado IN ('assinado','parcialmente_assinado')) INTO n,assinados,criados,parcial FROM public.comercial_documentos WHERE contratacao_id=c.id AND versao=c.versao;
 IF n=(CASE WHEN m.procuracao_modelo_id IS NULL THEN 1 ELSE 2 END) AND assinados=n THEN
  IF EXISTS(SELECT 1 FROM public.comercial_documentos WHERE contratacao_id=c.id AND versao=c.versao AND ambiente='sandbox') THEN UPDATE public.comercial_contratacoes SET status='teste_concluido',encaminhamento_erro='Teste sandbox concluído, sem formalização jurídica e sem tarefas reais' WHERE id=c.id;RETURN;END IF;
  UPDATE public.comercial_contratacoes SET status='formalizado',formalizado_em=now(),formalizacao_origem='zapsign',operacional_status='pendente',financeiro_status=CASE WHEN honorarios_iniciais THEN 'pendente' ELSE 'nao_aplicavel' END,atualizado_em=now() WHERE id=c.id;
  PERFORM comercial_privado.auditar(c.id,'formalizado_zapsign',jsonb_build_object('arquivos',n));
  PERFORM comercial_privado.encaminhar(c.id);RETURN;
 END IF;
 IF EXISTS(SELECT 1 FROM public.comercial_documentos WHERE contratacao_id=c.id AND versao=c.versao AND estado IN ('falha','incerto','recusado','cancelado')) THEN novostatus:='envio_parcial_falha';
 ELSIF EXISTS(SELECT 1 FROM public.comercial_documentos WHERE contratacao_id=c.id AND versao=c.versao AND estado='expirado') THEN novostatus:='expirado';
 ELSIF parcial THEN novostatus:='parcialmente_assinado';ELSIF criados=n AND n>0 THEN novostatus:='aguardando_assinatura';ELSE novostatus:='envio_parcial_falha';END IF;
 UPDATE public.comercial_contratacoes SET status=novostatus,atualizado_em=now() WHERE id=c.id;
END $$;
CREATE FUNCTION comercial_privado.operar(operacao text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid();alvo uuid; c public.comercial_contratacoes;m public.comercial_modelos;cfg public.comercial_config;cl public.clientes;novo uuid;campo text;html text;snap jsonb;papel text;tipo text;doc record;v jsonb;total integer;precisa integer;lease uuid;arquivo text;com public.comercial_condicoes_comissao;termo text;
BEGIN
 IF uid IS NULL OR NOT public.is_interno_ativo(uid) THEN RAISE EXCEPTION 'Sessão interna ativa necessária'; END IF;
 IF operacao='contexto' THEN
  IF NOT comercial_privado.pode('visualizar') AND NOT public.has_permission(uid,'financeiro','visualizar') AND NOT public.has_permission(uid,'controladoria','visualizar') THEN RAISE EXCEPTION 'Sem acesso comercial'; END IF;
  RETURN jsonb_build_object('permissoes',jsonb_build_object('visualizar',comercial_privado.pode('visualizar'),'preparar',comercial_privado.pode('preparar'),'conferir',comercial_privado.pode('conferir'),'enviar',comercial_privado.pode('enviar'),'gerenciar',comercial_privado.pode('gerenciar'),'formalizar_manual',comercial_privado.pode('formalizar_manual'),'alterar_comissao',comercial_privado.pode('alterar_comissao'),'financeiro',public.has_permission(uid,'financeiro','editar'),'financeiro_visualizar',public.has_permission(uid,'financeiro','visualizar'),'gestor',public.is_gestor(uid)),
   'config',CASE WHEN comercial_privado.pode('visualizar') OR public.has_permission(uid,'financeiro','visualizar') THEN (SELECT to_jsonb(x) FROM public.comercial_config x WHERE id) ELSE NULL END,
   'usuarios',CASE WHEN comercial_privado.pode('visualizar') OR public.has_permission(uid,'financeiro','visualizar') THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'nome',nome)),'[]') FROM public.profiles WHERE ativo AND coalesce(tipo_portal,'interno')='interno') ELSE '[]'::jsonb END,
   'servicos',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'nome',nome)),'[]') FROM public.catalogo_servicos WHERE classificacao='servico_juridico'),
   'teses',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'nome',nome,'servico_principal_id',servico_principal_id)),'[]') FROM public.juridico_teses WHERE ativo));
 END IF;
 IF operacao='configurar' THEN
  IF NOT comercial_privado.pode('gerenciar') THEN RAISE EXCEPTION 'Sem permissão de configuração'; END IF;
  IF nullif(payload->>'responsavel_operacional','') IS NOT NULL AND NOT public.is_interno_ativo((payload->>'responsavel_operacional')::uuid) THEN RAISE EXCEPTION 'Responsável operacional inválido'; END IF;
  IF nullif(payload->>'responsavel_financeiro','') IS NOT NULL AND NOT public.is_interno_ativo((payload->>'responsavel_financeiro')::uuid) THEN RAISE EXCEPTION 'Responsável financeiro inválido'; END IF;
  UPDATE public.comercial_config SET envio_habilitado=coalesce((payload->>'envio_habilitado')::boolean,false),ambiente=payload->>'ambiente',ciclo_inicio=(payload->>'ciclo_inicio')::date,ciclo_fim=(payload->>'ciclo_fim')::date,limite_documentos=(payload->>'limite_documentos')::integer,alerta_documentos=(payload->>'alerta_documentos')::integer,responsavel_operacional=nullif(payload->>'responsavel_operacional','')::uuid,responsavel_financeiro=nullif(payload->>'responsavel_financeiro','')::uuid,prazo_interno_dias=(payload->>'prazo_interno_dias')::integer WHERE id;
  PERFORM comercial_privado.auditar(NULL,'configuracao_alterada',payload);RETURN '{}';
 END IF;
 IF operacao='acesso' THEN
  IF NOT public.is_gestor(uid) THEN RAISE EXCEPTION 'Somente a gestora pode conceder permissões'; END IF;
  alvo:=(payload->>'user_id')::uuid;IF NOT public.is_interno_ativo(alvo) THEN RAISE EXCEPTION 'Usuário interno inválido'; END IF;
  INSERT INTO public.comercial_acessos(user_id,preparar,conferir,enviar,gerenciar,ver_todos,formalizar_manual,ver_comissao,alterar_comissao)
  VALUES(alvo,coalesce((payload->>'preparar')::boolean,false),coalesce((payload->>'conferir')::boolean,false),coalesce((payload->>'enviar')::boolean,false),coalesce((payload->>'gerenciar')::boolean,false),coalesce((payload->>'ver_todos')::boolean,false),coalesce((payload->>'formalizar_manual')::boolean,false),coalesce((payload->>'ver_comissao')::boolean,false),coalesce((payload->>'alterar_comissao')::boolean,false))
  ON CONFLICT(user_id) DO UPDATE SET preparar=excluded.preparar,conferir=excluded.conferir,enviar=excluded.enviar,gerenciar=excluded.gerenciar,ver_todos=excluded.ver_todos,formalizar_manual=excluded.formalizar_manual,ver_comissao=excluded.ver_comissao,alterar_comissao=excluded.alterar_comissao;
  PERFORM comercial_privado.auditar(NULL,'acesso_alterado',payload);RETURN '{}';
 END IF;
 IF operacao IN ('buscar_clientes','cliente') THEN
  IF NOT comercial_privado.pode('preparar') OR NOT public.has_permission(uid,'clientes','visualizar') THEN RAISE EXCEPTION 'Sem permissão para consultar clientes'; END IF;
  IF operacao='buscar_clientes' THEN
   termo:=trim(payload->>'termo');IF length(termo)<3 THEN RETURN '[]'; END IF;
   RETURN (SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT id,nome,right(regexp_replace(coalesce(cpf_cnpj,''),'\D','','g'),4) cpf_final,whatsapp,cidade,estado FROM public.clientes WHERE public.usuario_ve_cliente(uid,id) AND (nome ILIKE '%'||replace(replace(termo,'%',''),'_','')||'%' OR regexp_replace(coalesce(whatsapp,''),'\D','','g') LIKE '%'||nullif(regexp_replace(termo,'\D','','g'),'')||'%' OR regexp_replace(coalesce(cpf_cnpj,''),'\D','','g')=regexp_replace(termo,'\D','','g')) ORDER BY nome LIMIT 20) x);
  END IF;
  alvo:=nullif(payload->>'id','')::uuid;
  IF nullif(payload->>'rascunho_id','') IS NOT NULL THEN
   IF NOT comercial_privado.ver((payload->>'rascunho_id')::uuid) THEN RAISE EXCEPTION 'Rascunho fora do acesso'; END IF;
   SELECT * INTO c FROM public.comercial_contratacoes WHERE id=(payload->>'rascunho_id')::uuid FOR UPDATE;
   IF c.status NOT IN ('rascunho','aguardando_conferencia','pronto_envio') THEN RAISE EXCEPTION 'Não pode trocar cliente de pacote enviado'; END IF;
   IF alvo IS NULL AND c.cliente_id IS NOT NULL THEN alvo:=c.cliente_id;payload:=payload||jsonb_build_object('somente_leitura',true);END IF;
  END IF;
  IF alvo IS NULL THEN
   IF NOT public.has_permission(uid,'clientes','criar') THEN RAISE EXCEPTION 'Sem permissão para cadastrar cliente'; END IF;
   IF length(trim(payload->>'nome'))<3 THEN RAISE EXCEPTION 'Nome completo necessário'; END IF;
   PERFORM pg_advisory_xact_lock(hashtext(coalesce(nullif(regexp_replace(payload->>'cpf_cnpj','\D','','g'),''),lower(payload->>'nome'))));
   IF nullif(regexp_replace(payload->>'cpf_cnpj','\D','','g'),'') IS NOT NULL AND EXISTS(SELECT 1 FROM public.clientes WHERE regexp_replace(cpf_cnpj,'\D','','g')=regexp_replace(payload->>'cpf_cnpj','\D','','g')) THEN RAISE EXCEPTION 'CPF já cadastrado. Localize e reutilize o cadastro central'; END IF;
   PERFORM set_config('app.comercial_cadastro_sem_automacoes','on',true);
   INSERT INTO public.clientes(nome,cpf_cnpj,whatsapp,email,endereco,numero,complemento,bairro,cep,cidade,estado,profissao,estado_civil,rg,criado_por)
   VALUES(trim(payload->>'nome'),nullif(payload->>'cpf_cnpj',''),nullif(payload->>'whatsapp',''),nullif(payload->>'email',''),payload->>'endereco',payload->>'numero',payload->>'complemento',payload->>'bairro',payload->>'cep',payload->>'cidade',upper(payload->>'estado'),payload->>'profissao',payload->>'estado_civil',payload->>'rg',uid) RETURNING id INTO alvo;
   PERFORM set_config('app.comercial_cadastro_sem_automacoes','off',true);
   INSERT INTO public.user_client_links(user_id,cliente_id,criado_por) VALUES(uid,alvo,uid) ON CONFLICT DO NOTHING;
  ELSE
   IF NOT public.usuario_ve_cliente(uid,alvo) THEN RAISE EXCEPTION 'Cliente fora da carteira'; END IF;
   IF (payload->>'somente_leitura') IS DISTINCT FROM 'true' THEN
    IF NOT public.has_permission(uid,'clientes','editar') THEN RAISE EXCEPTION 'Sem permissão para editar cliente'; END IF;
    UPDATE public.clientes SET nome=payload->>'nome',cpf_cnpj=nullif(payload->>'cpf_cnpj',''),whatsapp=payload->>'whatsapp',email=payload->>'email',endereco=payload->>'endereco',numero=payload->>'numero',complemento=payload->>'complemento',bairro=payload->>'bairro',cep=payload->>'cep',cidade=payload->>'cidade',estado=upper(payload->>'estado'),profissao=payload->>'profissao',estado_civil=payload->>'estado_civil',rg=payload->>'rg' WHERE id=alvo;
   END IF;
  END IF;
  IF c.id IS NOT NULL THEN UPDATE public.comercial_contratacoes SET cliente_id=alvo,dados=dados-'cadastro_pendente',versao=versao+1,conferida_versao=NULL,conferida_por=NULL,conferida_em=NULL,conferencia_hash=NULL,status='rascunho' WHERE id=c.id RETURNING * INTO c;END IF;
  SELECT * INTO cl FROM public.clientes WHERE id=alvo;
  RETURN jsonb_build_object('contratacao_versao',c.versao,'id',cl.id,'nome',cl.nome,'cpf_cnpj',cl.cpf_cnpj,'whatsapp',cl.whatsapp,'email',cl.email,'endereco',cl.endereco,'numero',cl.numero,'complemento',cl.complemento,'bairro',cl.bairro,'cep',cl.cep,'cidade',cl.cidade,'estado',cl.estado,'profissao',cl.profissao,'estado_civil',cl.estado_civil,'rg',cl.rg);
 END IF;
 IF operacao IN ('documento_modelo','catalogo_modelos') THEN
  IF NOT comercial_privado.pode('gerenciar') THEN RAISE EXCEPTION 'Sem permissão para modelos'; END IF;
  IF operacao='catalogo_modelos' THEN RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'titulo',titulo,'categoria',categoria,'conteudo_html',conteudo_html)),'[]') FROM public.doc_modelos WHERE ativo); END IF;
  IF length(trim(coalesce(payload->>'titulo','')))<3 OR length(trim(coalesce(payload->>'conteudo_html','')))<20 THEN RAISE EXCEPTION 'Título e conteúdo necessários'; END IF;
  INSERT INTO public.doc_modelos(titulo,categoria,conteudo_html,criado_por) VALUES(payload->>'titulo',coalesce(payload->>'categoria','contrato')::public.doc_categoria,payload->>'conteudo_html',uid) RETURNING id INTO novo;
  RETURN jsonb_build_object('id',novo);
 END IF;
 IF operacao='exemplo_teste' THEN
  IF NOT comercial_privado.pode('gerenciar') THEN RAISE EXCEPTION 'Sem permissão para modelos'; END IF;
  INSERT INTO public.doc_modelos(titulo,categoria,conteudo_html,criado_por) VALUES('EXEMPLO FICTÍCIO — contrato sem validade','contrato','<h1>EXEMPLO FICTÍCIO — SEM VALIDADE JURÍDICA</h1><p>Cliente: {{cliente.nome}}</p><p>Objeto de teste: {{objeto}}</p><p>Total fixo de teste: {{honorarios.total}}</p>',uid) RETURNING id INTO novo;
  INSERT INTO public.doc_modelos(titulo,categoria,conteudo_html,criado_por) VALUES('EXEMPLO FICTÍCIO — procuração sem validade','procuracao','<h1>EXEMPLO FICTÍCIO — SEM VALIDADE JURÍDICA</h1><p>Cliente: {{cliente.nome}}</p><p>Objeto de teste: {{objeto}}</p>',uid) RETURNING id INTO alvo;
  INSERT INTO public.comercial_modelos(nome,contrato_modelo_id,procuracao_modelo_id,campos_obrigatorios,somente_teste) VALUES('EXEMPLO TESTE '||left(gen_random_uuid()::text,8),novo,alvo,'["cliente.nome","objeto"]',true) RETURNING * INTO m;
  RETURN to_jsonb(m);
 END IF;
 IF operacao IN ('modelo_salvar','modelo_aprovar','modelo_inativar') THEN
  IF NOT comercial_privado.pode('gerenciar') THEN RAISE EXCEPTION 'Sem permissão para administrar modelos'; END IF;
  alvo:=nullif(payload->>'id','')::uuid;
  IF operacao='modelo_salvar' THEN
   IF alvo IS NOT NULL THEN SELECT * INTO m FROM public.comercial_modelos WHERE id=alvo FOR UPDATE;IF m.estado<>'rascunho' THEN RAISE EXCEPTION 'Crie nova versão; modelo aprovado é imutável'; END IF; END IF;
   INSERT INTO public.comercial_modelos(id,nome,versao,servico_id,tese_id,contrato_modelo_id,procuracao_modelo_id,declaracao_modelo_id,campos_obrigatorios,signatarios,checklist,exigir_pagamento_inicio,somente_teste)
   VALUES(coalesce(alvo,gen_random_uuid()),payload->>'nome',coalesce((payload->>'versao')::integer,1),nullif(payload->>'servico_id','')::uuid,nullif(payload->>'tese_id','')::uuid,(payload->>'contrato_modelo_id')::uuid,nullif(payload->>'procuracao_modelo_id','')::uuid,nullif(payload->>'declaracao_modelo_id','')::uuid,coalesce(payload->'campos_obrigatorios','["cliente.nome","objeto"]'),coalesce(payload->'signatarios','{"contrato":["cliente"],"procuracao_declaracao":["cliente"]}'),coalesce(payload->'checklist','[]'),coalesce((payload->>'exigir_pagamento_inicio')::boolean,false),coalesce((payload->>'somente_teste')::boolean,true))
   ON CONFLICT(id) DO UPDATE SET nome=excluded.nome,versao=excluded.versao,servico_id=excluded.servico_id,tese_id=excluded.tese_id,contrato_modelo_id=excluded.contrato_modelo_id,procuracao_modelo_id=excluded.procuracao_modelo_id,declaracao_modelo_id=excluded.declaracao_modelo_id,campos_obrigatorios=excluded.campos_obrigatorios,signatarios=excluded.signatarios,checklist=excluded.checklist,exigir_pagamento_inicio=excluded.exigir_pagamento_inicio,somente_teste=excluded.somente_teste RETURNING * INTO m;
   IF m.nome ILIKE 'EXEMPLO TESTE%' AND NOT m.somente_teste THEN RAISE EXCEPTION 'Exemplo fictício deve permanecer somente para teste';END IF;
  ELSIF operacao='modelo_aprovar' THEN
   SELECT * INTO m FROM public.comercial_modelos WHERE id=alvo FOR UPDATE;
   IF m.estado<>'rascunho' THEN RAISE EXCEPTION 'Modelo não está em rascunho'; END IF;
   IF m.declaracao_modelo_id IS NOT NULL AND m.procuracao_modelo_id IS NULL THEN RAISE EXCEPTION 'Declaração deve ser reunida com uma procuração no segundo arquivo';END IF;
   FOR tipo IN SELECT unnest(ARRAY['contrato','procuracao_declaracao']) LOOP
    IF tipo='procuracao_declaracao' AND m.procuracao_modelo_id IS NULL THEN CONTINUE;END IF;
    IF coalesce(jsonb_typeof(m.signatarios->tipo),'null')<>'array' OR jsonb_array_length(m.signatarios->tipo)=0 OR jsonb_array_length(m.signatarios->tipo)>10 THEN RAISE EXCEPTION 'Configure os signatários de cada arquivo';END IF;
    IF (SELECT count(DISTINCT x) FROM jsonb_array_elements_text(m.signatarios->tipo) x)<>jsonb_array_length(m.signatarios->tipo) THEN RAISE EXCEPTION 'Papéis de signatários duplicados';END IF;
   END LOOP;
   SELECT jsonb_build_object('contrato',(SELECT conteudo_html FROM public.doc_modelos WHERE id=m.contrato_modelo_id),'procuracao_declaracao',(SELECT conteudo_html FROM public.doc_modelos WHERE id=m.procuracao_modelo_id),'declaracao',(SELECT conteudo_html FROM public.doc_modelos WHERE id=m.declaracao_modelo_id)) INTO snap;
   IF length(trim(coalesce(snap->>'contrato','')))<20 OR (m.procuracao_modelo_id IS NOT NULL AND length(trim(coalesce(snap->>'procuracao_declaracao','')))<20) OR (m.declaracao_modelo_id IS NOT NULL AND length(trim(coalesce(snap->>'declaracao','')))<20) THEN RAISE EXCEPTION 'Documentos completos necessários para aprovação'; END IF;
   IF jsonb_typeof(m.campos_obrigatorios)<>'array' OR jsonb_typeof(m.signatarios)<>'object' THEN RAISE EXCEPTION 'Configuração de modelo inválida'; END IF;
   UPDATE public.comercial_modelos SET estado='aprovado',snapshot=snap,aprovado_por=uid,aprovado_em=now() WHERE id=alvo RETURNING * INTO m;
  ELSE UPDATE public.comercial_modelos SET estado='inativo' WHERE id=alvo RETURNING * INTO m;
  END IF;
  PERFORM comercial_privado.auditar(NULL,operacao,jsonb_build_object('modelo_id',m.id,'versao',m.versao));RETURN to_jsonb(m);
 END IF;
 IF operacao='salvar' THEN
  IF NOT comercial_privado.pode('preparar') THEN RAISE EXCEPTION 'Sem permissão para preparar contratação'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(coalesce(payload->'dados','{}')) k WHERE k LIKE 'cliente.%') THEN RAISE EXCEPTION 'Dados de cliente devem ser atualizados no cadastro central'; END IF;
  alvo:=nullif(payload->>'id','')::uuid;
  IF alvo IS NOT NULL THEN
   IF NOT comercial_privado.ver(alvo) THEN RAISE EXCEPTION 'Contratação fora do seu acesso'; END IF;
   SELECT * INTO c FROM public.comercial_contratacoes WHERE id=alvo FOR UPDATE;
   IF c.status IN ('formalizado','cancelado','expirado') OR EXISTS(SELECT 1 FROM public.comercial_documentos WHERE contratacao_id=alvo AND estado NOT IN ('preparado','falha')) THEN RAISE EXCEPTION 'Documentos em assinatura: não é permitido alterar o pacote enviado'; END IF;
   IF (payload->>'versao')::integer IS DISTINCT FROM c.versao THEN RAISE EXCEPTION 'Versão alterada em outra aba; recarregue a contratação'; END IF;
  END IF;
  IF nullif(payload->>'cliente_id','') IS NOT NULL AND NOT public.usuario_ve_cliente(uid,(payload->>'cliente_id')::uuid) THEN RAISE EXCEPTION 'Cliente fora da carteira'; END IF;
  IF nullif(payload->>'responsavel_id','')::uuid IS DISTINCT FROM uid AND NOT comercial_privado.pode('ver_todos') THEN RAISE EXCEPTION 'Não pode atribuir contratação a outro responsável'; END IF;
  IF nullif(payload->>'responsavel_id','') IS NOT NULL AND NOT public.is_interno_ativo((payload->>'responsavel_id')::uuid) THEN RAISE EXCEPTION 'Responsável deve ser usuário interno ativo'; END IF;
  INSERT INTO public.comercial_contratacoes(id,cliente_id,modelo_id,servico_id,tese_id,objeto,uf_atuacao,responsavel_id,criado_por,dados,signatarios,incluir_declaracao,honorarios_iniciais,condicoes,observacoes,pendencias_documentais)
  VALUES(coalesce(alvo,gen_random_uuid()),nullif(payload->>'cliente_id','')::uuid,nullif(payload->>'modelo_id','')::uuid,nullif(payload->>'servico_id','')::uuid,nullif(payload->>'tese_id','')::uuid,coalesce(payload->>'objeto',''),nullif(payload->>'uf_atuacao',''),coalesce(nullif(payload->>'responsavel_id','')::uuid,uid),uid,coalesce(payload->'dados','{}'),coalesce(payload->'signatarios','{}'),coalesce((payload->>'incluir_declaracao')::boolean,false),nullif(payload->>'honorarios_iniciais','')::boolean,coalesce(payload->'condicoes','{}'),coalesce(payload->>'observacoes',''),coalesce(payload->>'pendencias_documentais',''))
  ON CONFLICT(id) DO UPDATE SET cliente_id=excluded.cliente_id,modelo_id=excluded.modelo_id,servico_id=excluded.servico_id,tese_id=excluded.tese_id,objeto=excluded.objeto,uf_atuacao=excluded.uf_atuacao,responsavel_id=excluded.responsavel_id,dados=excluded.dados,signatarios=excluded.signatarios,incluir_declaracao=excluded.incluir_declaracao,honorarios_iniciais=excluded.honorarios_iniciais,condicoes=excluded.condicoes,observacoes=excluded.observacoes,pendencias_documentais=excluded.pendencias_documentais,versao=comercial_contratacoes.versao+1,conferida_versao=NULL,conferida_por=NULL,conferida_em=NULL,conferencia_hash=NULL,status='rascunho',atualizado_em=now() RETURNING * INTO c;
  PERFORM comercial_privado.auditar(c.id,'rascunho_salvo',jsonb_build_object('versao',c.versao));RETURN to_jsonb(c);
 END IF;
 alvo:=nullif(payload->>'id','')::uuid;
 IF alvo IS NULL OR NOT comercial_privado.ver(alvo) THEN RAISE EXCEPTION 'Contratação fora do seu acesso'; END IF;
 SELECT * INTO c FROM public.comercial_contratacoes WHERE id=alvo FOR UPDATE;
 IF operacao='comissao' THEN
  IF NOT comercial_privado.pode('alterar_comissao') THEN RAISE EXCEPTION 'Sem permissão para alterar comissão'; END IF;
  INSERT INTO public.comercial_condicoes_comissao(contratacao_id,tem_comissao,percentual,condicao,beneficiario_id,atualizado_por)
  VALUES(c.id,coalesce((payload->>'tem_comissao')::boolean,false),coalesce((payload->>'percentual')::numeric,0),coalesce(payload->>'condicao',''),nullif(payload->>'beneficiario_id','')::uuid,uid)
  ON CONFLICT(contratacao_id) DO UPDATE SET tem_comissao=excluded.tem_comissao,percentual=excluded.percentual,condicao=excluded.condicao,beneficiario_id=excluded.beneficiario_id,atualizado_por=uid,atualizado_em=now() RETURNING * INTO com;
  PERFORM comercial_privado.auditar(c.id,'comissao_alterada',to_jsonb(com));RETURN to_jsonb(com);
 ELSIF operacao IN ('previsualizar','solicitar_conferencia','conferir') THEN
  IF NOT comercial_privado.pode(CASE WHEN operacao='conferir' THEN 'conferir' ELSE 'preparar' END) THEN RAISE EXCEPTION 'Sem permissão para esta etapa'; END IF;
  IF c.status NOT IN ('rascunho','aguardando_conferencia','pronto_envio') THEN RAISE EXCEPTION 'Etapa não permite gerar nova prévia'; END IF;
  IF (payload->>'versao')::integer IS DISTINCT FROM c.versao THEN RAISE EXCEPTION 'Versão desatualizada'; END IF;
  PERFORM comercial_privado.preparar(c);
  IF operacao='conferir' THEN
   IF (payload->>'confirmado') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Confirme dados, condições, arquivos e signatários'; END IF;
   UPDATE public.comercial_contratacoes SET status='pronto_envio',conferida_versao=versao,conferida_por=uid,conferida_em=now(),conferencia_hash=comercial_privado.hash(c),atualizado_em=now() WHERE id=c.id;
  ELSIF operacao='solicitar_conferencia' THEN UPDATE public.comercial_contratacoes SET status='aguardando_conferencia',atualizado_em=now() WHERE id=c.id;
  END IF;
  PERFORM comercial_privado.auditar(c.id,operacao,jsonb_build_object('versao',c.versao));
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(d)),'[]') FROM public.comercial_documentos d WHERE contratacao_id=c.id AND versao=c.versao);
 ELSIF operacao='reservar_envio' THEN
  IF NOT comercial_privado.pode('enviar') OR (payload->>'confirmado') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Confirmação explícita e permissão de envio necessárias'; END IF;
  IF c.status='formalizado' THEN RETURN '[]'; END IF;
  IF c.status NOT IN ('pronto_envio','envio_parcial_falha','aguardando_assinatura','parcialmente_assinado') OR c.conferida_versao IS DISTINCT FROM c.versao OR c.conferencia_hash IS DISTINCT FROM comercial_privado.hash(c) THEN RAISE EXCEPTION 'Dados alterados ou não conferidos. Confira novamente antes do envio'; END IF;
  PERFORM comercial_privado.validar(c);SELECT * INTO m FROM public.comercial_modelos WHERE id=c.modelo_id;
  PERFORM pg_advisory_xact_lock(79341022);SELECT * INTO cfg FROM public.comercial_config WHERE id FOR UPDATE;
  IF NOT cfg.envio_habilitado OR current_date<cfg.ciclo_inicio OR current_date>=cfg.ciclo_fim THEN RAISE EXCEPTION 'Integração desativada ou ciclo não configurado'; END IF;
  IF cfg.ambiente='producao' AND m.somente_teste THEN RAISE EXCEPTION 'Modelo de teste não pode ser enviado em produção'; END IF;
  IF EXISTS(SELECT 1 FROM public.comercial_documentos WHERE contratacao_id=c.id AND versao=c.versao AND ambiente<>cfg.ambiente) THEN RAISE EXCEPTION 'Ambiente alterado; refaça a preparação em uma nova versão'; END IF;
  UPDATE public.comercial_documentos SET estado='incerto',erro_codigo='envio_interrompido_reconciliar' WHERE contratacao_id=c.id AND estado='em_envio' AND lease_ate<now();
  IF EXISTS(SELECT 1 FROM public.comercial_documentos WHERE contratacao_id=c.id AND versao=c.versao AND estado IN ('incerto','em_envio')) THEN RAISE EXCEPTION 'Envio pendente ou incerto: consulte/reconcilie antes de tentar novamente'; END IF;
  SELECT count(*) INTO precisa FROM public.comercial_documentos WHERE contratacao_id=c.id AND versao=c.versao AND estado IN ('preparado','falha') AND externo_id IS NULL;
  SELECT count(*) INTO total FROM public.comercial_documentos WHERE ambiente=cfg.ambiente AND tentado_em>=cfg.ciclo_inicio::timestamptz AND tentado_em<cfg.ciclo_fim::timestamptz AND estado NOT IN ('preparado','falha');
  IF total+precisa>cfg.limite_documentos THEN RAISE EXCEPTION 'Limite local do ciclo insuficiente para os arquivos faltantes'; END IF;
  lease:=gen_random_uuid();
  UPDATE public.comercial_documentos SET estado='em_envio',lease_id=lease,lease_ate=now()+interval '4 minutes',tentado_em=now(),erro_codigo=NULL WHERE contratacao_id=c.id AND versao=c.versao AND estado IN ('preparado','falha') AND externo_id IS NULL;
  PERFORM comercial_privado.auditar(c.id,'envio_confirmado',jsonb_build_object('arquivos',precisa,'versao',c.versao,'ambiente',cfg.ambiente));
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(d)),'[]') FROM public.comercial_documentos d WHERE contratacao_id=c.id AND lease_id=lease AND estado='em_envio');
 ELSIF operacao='formalizar_manual' THEN
  IF NOT comercial_privado.pode('formalizar_manual') OR (payload->>'confirmado') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Formalização manual exige permissão e conferência explícita'; END IF;
  SELECT * INTO cfg FROM public.comercial_config WHERE id;
  IF cfg.envio_habilitado THEN RAISE EXCEPTION 'Integração configurada: utilize confirmação pelo provedor'; END IF;
  IF c.status='formalizado' THEN RETURN to_jsonb(c); END IF;
  IF c.status<>'pronto_envio' OR c.conferida_versao IS DISTINCT FROM c.versao OR c.conferencia_hash IS DISTINCT FROM comercial_privado.hash(c) THEN RAISE EXCEPTION 'Confira a versão atual antes de formalizar'; END IF;
  SELECT * INTO m FROM public.comercial_modelos WHERE id=c.modelo_id;IF m.somente_teste THEN RAISE EXCEPTION 'Modelo de teste não pode formalizar contratação real'; END IF;
  FOR doc IN SELECT * FROM public.comercial_documentos WHERE contratacao_id=c.id AND versao=c.versao LOOP
   arquivo:=payload->'arquivos'->>doc.id::text;
   IF arquivo IS NULL OR split_part(arquivo,'/',1)<>uid::text OR split_part(arquivo,'/',2)<>c.id::text OR split_part(arquivo,'/',3)<>doc.id::text OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='contratacoes' AND name=arquivo AND metadata->>'mimetype'='application/pdf') THEN RAISE EXCEPTION 'Anexe o PDF assinado de cada arquivo obrigatório'; END IF;
   UPDATE public.comercial_documentos SET estado='assinado',arquivo_assinado_path=arquivo,assinado_em=now(),assinaturas=jsonb_build_array(jsonb_build_object('origem','manual','conferido_por',uid)) WHERE id=doc.id;
  END LOOP;
  UPDATE public.comercial_contratacoes SET status='formalizado',formalizado_em=now(),formalizado_por=uid,formalizacao_origem='manual',operacional_status='pendente',financeiro_status=CASE WHEN honorarios_iniciais THEN 'pendente' ELSE 'nao_aplicavel' END WHERE id=c.id;
  PERFORM comercial_privado.auditar(c.id,'formalizado_manual',jsonb_build_object('conferido_por',uid,'versao',c.versao));PERFORM comercial_privado.encaminhar(c.id);
 ELSIF operacao='recuperar_encaminhamento' THEN
  IF NOT comercial_privado.pode('preparar') AND NOT public.has_permission(uid,'financeiro','editar') THEN RAISE EXCEPTION 'Sem permissão para recuperar encaminhamento'; END IF;
  PERFORM comercial_privado.encaminhar(c.id);
 ELSIF operacao='financeiro' THEN
  IF NOT public.has_permission(uid,'financeiro','editar') THEN RAISE EXCEPTION 'Sem permissão financeira'; END IF;
  IF c.status<>'formalizado' OR NOT c.honorarios_iniciais THEN RAISE EXCEPTION 'Não há pendência financeira inicial formalizada'; END IF;
  alvo:=nullif(payload->>'referencia_id','')::uuid;
  IF alvo IS NULL OR NOT EXISTS(SELECT 1 FROM public.honorarios_contratos WHERE id=alvo AND cliente_id=c.cliente_id) THEN RAISE EXCEPTION 'Selecione referência do Financeiro pertencente ao cliente'; END IF;
  IF nullif(payload->>'link_pagamento','') IS NOT NULL AND (payload->>'link_pagamento') !~ '^https://[^[:space:]]+$' THEN RAISE EXCEPTION 'Link de pagamento deve usar HTTPS'; END IF;
  UPDATE public.comercial_contratacoes SET financeiro_referencia_id=alvo,link_pagamento=nullif(payload->>'link_pagamento',''),financeiro_status='cobranca_preparada' WHERE id=c.id;
  PERFORM comercial_privado.auditar(c.id,'cobranca_preparada',jsonb_build_object('referencia_id',alvo));PERFORM comercial_privado.encaminhar(c.id);
 ELSIF operacao='cancelar' THEN
  IF NOT comercial_privado.pode('preparar') OR c.status='formalizado' OR EXISTS(SELECT 1 FROM public.comercial_documentos WHERE contratacao_id=c.id AND estado NOT IN ('preparado','falha')) THEN RAISE EXCEPTION 'Cancele os documentos já enviados no provedor e consulte o status; não há cancelamento automático'; END IF;
  UPDATE public.comercial_contratacoes SET status='cancelado' WHERE id=c.id;PERFORM comercial_privado.auditar(c.id,'cancelado');
 ELSE RAISE EXCEPTION 'Operação não suportada';
 END IF;
 RETURN (SELECT to_jsonb(x) FROM public.comercial_contratacoes x WHERE id=c.id);
END $$;
CREATE FUNCTION public.comercial_operar(operacao text,payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT comercial_privado.operar(operacao,payload) $$;
CREATE FUNCTION comercial_privado.consumo() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg public.comercial_config; BEGIN
 IF NOT comercial_privado.pode('visualizar') THEN RAISE EXCEPTION 'Sem acesso comercial'; END IF;
 SELECT * INTO cfg FROM public.comercial_config WHERE id;
 RETURN (SELECT jsonb_build_object('criados_localmente',count(*) FILTER(WHERE externo_id IS NOT NULL),'reservados_ou_incertos',count(*) FILTER(WHERE estado IN ('em_envio','incerto')),'limite',cfg.limite_documentos,'alerta',cfg.alerta_documentos,'contagem_provedor_confirmada',false,'parcial',true,'ambiente',cfg.ambiente,'ciclo_inicio',cfg.ciclo_inicio,'ciclo_fim',cfg.ciclo_fim) FROM public.comercial_documentos WHERE ambiente=cfg.ambiente AND tentado_em>=cfg.ciclo_inicio::timestamptz AND tentado_em<cfg.ciclo_fim::timestamptz AND estado NOT IN ('preparado','falha'));
END $$;
CREATE FUNCTION public.comercial_consumo() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT comercial_privado.consumo() $$;
-- Atualização exclusiva do backend, após consulta autenticada à API do provedor.
CREATE FUNCTION public.comercial_registrar_provedor(p_documento uuid,p_lease uuid,p_dados jsonb) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.comercial_documentos;novo_estado text;assinados integer;esperados integer;s jsonb;esperado jsonb;token text;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Somente backend'; END IF;
 SELECT * INTO d FROM public.comercial_documentos WHERE id=p_documento FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Documento inexistente'; END IF;
 IF p_lease IS NOT NULL AND p_lease IS DISTINCT FROM d.lease_id THEN RAISE EXCEPTION 'Tentativa de envio desatualizada'; END IF;
 token:=nullif(p_dados->>'externo_id','');
 IF d.externo_id IS NOT NULL AND token IS NOT NULL AND d.externo_id<>token THEN RAISE EXCEPTION 'Identificador externo divergente'; END IF;
 novo_estado:=p_dados->>'estado';
 IF novo_estado NOT IN ('falha','incerto','criado','parcialmente_assinado','assinado','cancelado','expirado','recusado') THEN RAISE EXCEPTION 'Status não suportado'; END IF;
 IF novo_estado IN ('assinado','parcialmente_assinado') THEN
  IF token IS NULL OR p_dados->>'external_id' IS DISTINCT FROM d.id::text THEN RAISE EXCEPTION 'Documento externo não corresponde ao pacote'; END IF;
  esperados:=jsonb_array_length(d.signatarios);assinados:=0;
  FOR esperado IN SELECT * FROM jsonb_array_elements(d.signatarios) LOOP
   SELECT x INTO s FROM jsonb_array_elements(coalesce(p_dados->'assinaturas','[]')) x WHERE x->>'external_id'=esperado->>'papel' LIMIT 1;
   IF s->>'status' IN ('signed','assinou') AND nullif(s->>'signed_at','') IS NOT NULL THEN assinados:=assinados+1; END IF;
  END LOOP;
  IF estado='assinado' AND (assinados<>esperados OR esperados=0 OR (p_dados->>'provider_status') IS DISTINCT FROM 'signed') THEN RAISE EXCEPTION 'Todas as assinaturas exigidas devem estar confirmadas'; END IF;
 END IF;
 -- Assinatura concluída não regride por um webhook antigo.
 IF d.estado='assinado' AND novo_estado<>'assinado' THEN RETURN; END IF;
 UPDATE public.comercial_documentos SET estado=novo_estado,externo_id=coalesce(token,externo_id),links_assinatura=coalesce(p_dados->'links_assinatura',links_assinatura),assinaturas=coalesce(p_dados->'assinaturas',assinaturas),arquivo_assinado_path=coalesce(nullif(p_dados->>'arquivo_assinado_path',''),arquivo_assinado_path),criado_provedor_em=CASE WHEN token IS NOT NULL THEN coalesce(criado_provedor_em,now()) ELSE criado_provedor_em END,assinado_em=CASE WHEN novo_estado='assinado' THEN coalesce(assinado_em,now()) ELSE assinado_em END,erro_codigo=nullif(p_dados->>'erro_codigo',''),lease_ate=NULL WHERE id=d.id;
 PERFORM comercial_privado.auditar(d.contratacao_id,'status_documento',jsonb_build_object('documento_id',d.id,'estado',novo_estado,'ambiente',d.ambiente));
 PERFORM comercial_privado.recalcular(d.contratacao_id);
 -- Pode haver download tardio do PDF após uma formalização já reconhecida.
 PERFORM comercial_privado.encaminhar(d.contratacao_id);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA comercial_privado FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION comercial_privado.pode(text),comercial_privado.ver(uuid),comercial_privado.operar(text,jsonb),comercial_privado.consumo() TO authenticated;
REVOKE ALL ON FUNCTION public.comercial_operar(text,jsonb),public.comercial_consumo(),public.comercial_registrar_provedor(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.comercial_operar(text,jsonb),public.comercial_consumo() TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA comercial_privado TO service_role;
GRANT EXECUTE ON FUNCTION public.comercial_registrar_provedor(uuid,uuid,jsonb) TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.comercial_historico_id_seq TO service_role;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('contratacoes','contratacoes',false,10485760,ARRAY['application/pdf']) ON CONFLICT(id) DO NOTHING;
CREATE POLICY comercial_pdf_ler ON storage.objects FOR SELECT TO authenticated USING(bucket_id='contratacoes' AND EXISTS(SELECT 1 FROM public.comercial_documentos d WHERE d.arquivo_assinado_path=name AND comercial_privado.ver(d.contratacao_id)));
CREATE POLICY comercial_pdf_manual_inserir ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='contratacoes' AND comercial_privado.pode('formalizar_manual') AND split_part(name,'/',1)=auth.uid()::text AND EXISTS(SELECT 1 FROM public.comercial_documentos d JOIN public.comercial_contratacoes c ON c.id=d.contratacao_id WHERE c.id::text=split_part(name,'/',2) AND d.id::text=split_part(name,'/',3) AND d.versao=c.versao AND c.status='pronto_envio' AND comercial_privado.ver(c.id)));
-- Nenhuma automação antiga de comissão/IA deve disparar ao criar cliente neste novo fluxo.
-- Preserva o corpo original e o comportamento dos demais cadastros.
DO $$ DECLARE fn regprocedure;def text; BEGIN
 FOREACH fn IN ARRAY ARRAY['public.trg_criar_comissao_fechamento()'::regprocedure,'public.trg_ia_analisar_novo_cliente()'::regprocedure] LOOP
  def:=pg_get_functiondef(fn);
  IF position('app.comercial_cadastro_sem_automacoes' in def)=0 THEN
   def:=regexp_replace(def,'\mBEGIN\M',E'BEGIN\n IF current_setting(''app.comercial_cadastro_sem_automacoes'',true)=''on'' THEN RETURN NEW; END IF;','i');
   EXECUTE def;
  END IF;
 END LOOP;
END $$;
CREATE FUNCTION comercial_privado.listar(filtros jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE limite integer:=50;pagina integer:=greatest(0,least(coalesce((filtros->>'pagina')::integer,0),2000));r jsonb;
BEGIN
 IF NOT comercial_privado.pode('visualizar') AND NOT public.has_permission(auth.uid(),'financeiro','visualizar') THEN RAISE EXCEPTION 'Sem acesso às contratações'; END IF;
 WITH base AS (
 SELECT c.*,cl.nome as cliente_nome,cl.whatsapp as cliente_contato,cl.cidade as cliente_cidade,cl.estado as cliente_uf,s.nome as servico_nome,t.nome as tese_nome,p.nome as responsavel_nome,
 op.status::text as tarefa_operacional_status,fin.status::text as tarefa_financeira_status,
 (SELECT count(*) FROM public.comercial_documentos d WHERE d.contratacao_id=c.id AND d.versao=c.versao AND d.externo_id IS NOT NULL) as arquivos_enviados,
 (SELECT min(d.criado_provedor_em) FROM public.comercial_documentos d WHERE d.contratacao_id=c.id AND d.versao=c.versao) as primeiro_envio_em
 FROM public.comercial_contratacoes c LEFT JOIN public.clientes cl ON cl.id=c.cliente_id LEFT JOIN public.catalogo_servicos s ON s.id=c.servico_id LEFT JOIN public.juridico_teses t ON t.id=c.tese_id LEFT JOIN public.profiles p ON p.id=c.responsavel_id LEFT JOIN public.controladoria_itens op ON op.id=c.tarefa_operacional_id LEFT JOIN public.controladoria_itens fin ON fin.id=c.tarefa_financeira_id
 WHERE comercial_privado.ver(c.id)
 AND (nullif(filtros->>'inicio','') IS NULL OR c.criado_em>=(filtros->>'inicio')::date)
 AND (nullif(filtros->>'fim','') IS NULL OR c.criado_em<((filtros->>'fim')::date+1))
 AND (nullif(filtros->>'servico_id','') IS NULL OR c.servico_id=(filtros->>'servico_id')::uuid)
 AND (nullif(filtros->>'tese_id','') IS NULL OR c.tese_id=(filtros->>'tese_id')::uuid)
 AND (nullif(filtros->>'responsavel_id','') IS NULL OR c.responsavel_id=(filtros->>'responsavel_id')::uuid)
 AND (nullif(filtros->>'status','') IS NULL OR c.status=filtros->>'status')
 AND (nullif(filtros->>'cidade','') IS NULL OR cl.cidade ILIKE '%'||replace(replace(filtros->>'cidade','%',''),'_','')||'%')
 AND (nullif(filtros->>'uf','') IS NULL OR cl.estado=upper(filtros->>'uf'))
 AND (nullif(filtros->>'iniciais','') IS NULL OR c.honorarios_iniciais=(filtros->>'iniciais')::boolean)
 AND (nullif(filtros->>'operacional','') IS NULL OR c.operacional_status=filtros->>'operacional' OR op.status::text=filtros->>'operacional')
 AND (nullif(filtros->>'financeiro','') IS NULL OR c.financeiro_status=filtros->>'financeiro')
 AND (nullif(filtros->>'assinatura','') IS NULL OR EXISTS(SELECT 1 FROM public.comercial_documentos d WHERE d.contratacao_id=c.id AND d.versao=c.versao AND d.estado=filtros->>'assinatura'))
 AND (nullif(filtros->>'busca','') IS NULL OR cl.nome ILIKE '%'||replace(replace(filtros->>'busca','%',''),'_','')||'%' OR regexp_replace(coalesce(cl.whatsapp,''),'\D','','g') LIKE '%'||nullif(regexp_replace(filtros->>'busca','\D','','g'),'')||'%')
 ), pagina_itens AS (SELECT * FROM base ORDER BY criado_em DESC,id LIMIT limite OFFSET pagina*limite)
 SELECT jsonb_build_object('itens',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM pagina_itens x),'total',(SELECT count(*) FROM base),'pagina',pagina,
 'indicadores',CASE WHEN public.is_gestor(auth.uid()) OR comercial_privado.pode('ver_todos') THEN
 (SELECT jsonb_build_object('preparadas',count(*),'pacotes_enviados',count(*) FILTER(WHERE arquivos_enviados>0),'arquivos_enviados',coalesce(sum(arquivos_enviados),0),'aguardando_assinatura',count(*) FILTER(WHERE status IN ('aguardando_assinatura','parcialmente_assinado')),'formalizados',count(*) FILTER(WHERE status='formalizado'),'com_iniciais',count(*) FILTER(WHERE honorarios_iniciais),'sem_iniciais',count(*) FILTER(WHERE honorarios_iniciais=false),'valor_fixo_contratado_centavos',coalesce(sum((condicoes->>'total_centavos')::bigint) FILTER(WHERE status='formalizado'),0),'pendencias_financeiras',count(*) FILTER(WHERE financeiro_status='pendente'),'operacionais_pendentes',count(*) FILTER(WHERE operacional_status IN ('pendente','aguardando_pagamento')),'tempo_medio_horas',round(avg(extract(epoch from(formalizado_em-primeiro_envio_em))/3600) FILTER(WHERE status='formalizado' AND primeiro_envio_em IS NOT NULL)::numeric,2)) FROM base)
 ||jsonb_build_object('por_servico',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT coalesce(servico_nome,'Não informado') nome,count(*) quantidade FROM base GROUP BY servico_nome)x),'por_uf',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT coalesce(cliente_uf,'Não informada') nome,count(*) quantidade FROM base GROUP BY cliente_uf)x),'por_tese',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT coalesce(tese_nome,'Não informada') nome,count(*) quantidade FROM base GROUP BY tese_nome)x),'por_responsavel',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT coalesce(responsavel_nome,'Não informado') nome,count(*) quantidade FROM base GROUP BY responsavel_nome)x))
 ELSE NULL END) INTO r;
 RETURN r;
END $$;
CREATE FUNCTION public.comercial_listar(filtros jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT comercial_privado.listar(filtros) $$;
REVOKE ALL ON FUNCTION comercial_privado.listar(jsonb),public.comercial_listar(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION comercial_privado.listar(jsonb),public.comercial_listar(jsonb) TO authenticated;
