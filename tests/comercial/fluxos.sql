-- Dados fictícios; nenhum envio HTTP. Sempre ROLLBACK.
BEGIN;
DO $$
DECLARE g uuid:=gen_random_uuid();u uuid:=gen_random_uuid();cl uuid;s uuid;cm uuid;pm uuid;modelo uuid;c jsonb;c2 jsonb;docs jsonb;d jsonb;reserva jsonb;negado boolean;id1 uuid;id2 uuid;v integer;novo uuid;total_antes integer;comissoes_antes integer;paths jsonb;
BEGIN
 INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data) VALUES(g,'authenticated','authenticated','contratacao-test-'||g||'@example.invalid','{"nome":"Teste Direção"}'),(u,'authenticated','authenticated','contratacao-test-'||u||'@example.invalid','{"nome":"Teste Equipe"}');
 INSERT INTO public.profiles(id,nome,ativo,tipo_portal) VALUES(g,'Teste Direção',true,'interno'),(u,'Teste Equipe',true,'interno') ON CONFLICT(id) DO UPDATE SET ativo=true,tipo_portal='interno';
 INSERT INTO public.user_access_scopes(user_id,clientes_scope,processos_scope) VALUES(g,'todos','todos'),(u,'vinculados','vinculados') ON CONFLICT(user_id) DO UPDATE SET clientes_scope=excluded.clientes_scope,processos_scope=excluded.processos_scope;
 DELETE FROM public.user_roles WHERE user_id IN (g,u);INSERT INTO public.user_roles(user_id,role) VALUES(g,'gestor');
 PERFORM set_config('request.jwt.claim.sub',g::text,true);
 PERFORM set_config('test.comercial_gestor',g::text,true);PERFORM set_config('test.comercial_equipe',u::text,true);
 SELECT count(*) INTO total_antes FROM public.honorarios_contratos;SELECT count(*) INTO comissoes_antes FROM public.clientes_comissoes_fechamento;
 c:=public.comercial_operar('cliente',jsonb_build_object('nome','Pessoa Fictícia de Teste','cpf_cnpj','','whatsapp','65999999999','endereco','Endereço fictício','cidade','Cidade teste','estado','MT'));cl:=(c->>'id')::uuid;
 IF (SELECT count(*) FROM public.clientes_comissoes_fechamento)<>comissoes_antes THEN RAISE EXCEPTION 'Cadastro comercial disparou comissão antiga';END IF;
 PERFORM set_config('test.comercial_cliente',cl::text,true);
 INSERT INTO public.catalogo_servicos(nome,classificacao) VALUES('Serviço TESTE SEM VALIDADE','servico_juridico') RETURNING id INTO s;
 cm:=(public.comercial_operar('documento_modelo','{"titulo":"Contrato TESTE SEM VALIDADE","categoria":"contrato","conteudo_html":"<p>TESTE SEM VALIDADE: {{cliente.nome}} / {{objeto}} / {{honorarios.total}}</p>"}')->>'id')::uuid;
 pm:=(public.comercial_operar('documento_modelo','{"titulo":"Procuração TESTE SEM VALIDADE","categoria":"procuracao","conteudo_html":"<p>TESTE SEM VALIDADE: {{cliente.nome}} / {{objeto}}</p>"}')->>'id')::uuid;
 modelo:=(public.comercial_operar('modelo_salvar',jsonb_build_object('nome','Pacote TESTE SEM VALIDADE','contrato_modelo_id',cm,'procuracao_modelo_id',pm,'somente_teste',false,'campos_obrigatorios',jsonb_build_array('cliente.nome','objeto'),'signatarios',jsonb_build_object('contrato',jsonb_build_array('cliente','escritorio'),'procuracao_declaracao',jsonb_build_array('cliente'))))->>'id')::uuid;
 PERFORM public.comercial_operar('modelo_aprovar',jsonb_build_object('id',modelo));
 -- Drafts não produzem documentos nem tarefas.
 c:=public.comercial_operar('salvar',jsonb_build_object('cliente_id',cl,'servico_id',s,'modelo_id',modelo,'objeto','OBJETO FICTÍCIO DE TESTE','honorarios_iniciais',true,'condicoes',jsonb_build_object('total_centavos',200000,'entrada_centavos',0,'parcelas',(SELECT jsonb_agg(jsonb_build_object('centavos',20000,'vencimento',(current_date+i)::text)) FROM generate_series(1,10)i),'forma_pagamento','boleto'),'signatarios',jsonb_build_object('cliente',jsonb_build_object('nome','Pessoa Fictícia de Teste'),'escritorio',jsonb_build_object('nome','Escritório de Teste'))));
 id1:=(c->>'id')::uuid;PERFORM set_config('test.comercial_ct',id1::text,true);
 IF EXISTS(SELECT 1 FROM public.comercial_documentos WHERE contratacao_id=id1) THEN RAISE EXCEPTION 'Rascunho criou arquivos para envio'; END IF;
 c2:=public.comercial_operar('salvar',c||jsonb_build_object('id',NULL,'objeto','SEGUNDA CONTRATAÇÃO FICTÍCIA'));
 IF c2->>'id'=c->>'id' OR (SELECT count(*) FROM public.clientes WHERE id=cl)<>1 THEN RAISE EXCEPTION 'Nova contratação duplicou cliente ou sobrescreveu demanda'; END IF;
 -- Dados incompletos e centavos incoerentes impedem preparação.
 negado:=false;BEGIN PERFORM public.comercial_operar('previsualizar',jsonb_build_object('id',c2->>'id','versao',1));EXCEPTION WHEN OTHERS THEN negado:=true;END;
 -- A segunda cópia também é completa; testa inconsistência de centavos separadamente.
 c2:=public.comercial_operar('salvar',c2||jsonb_build_object('condicoes',jsonb_build_object('total_centavos',200001,'entrada_centavos',0,'parcelas',jsonb_build_array(jsonb_build_object('centavos',200000,'vencimento',current_date)),'forma_pagamento','boleto')));
 negado:=false;BEGIN PERFORM public.comercial_operar('previsualizar',jsonb_build_object('id',c2->>'id','versao',c2->'versao'));EXCEPTION WHEN OTHERS THEN negado:=true;END;IF NOT negado THEN RAISE EXCEPTION 'Centavos inconsistentes aceitos';END IF;
 docs:=public.comercial_operar('previsualizar',jsonb_build_object('id',id1,'versao',1));
 IF jsonb_array_length(docs)<>2 OR EXISTS(SELECT 1 FROM public.comercial_documentos WHERE contratacao_id=id1 AND estado<>'preparado') THEN RAISE EXCEPTION 'Prévia criou envio definitivo'; END IF;
 IF jsonb_array_length((SELECT signatarios FROM public.comercial_documentos WHERE contratacao_id=id1 AND tipo='contrato'))<>2 OR jsonb_array_length((SELECT signatarios FROM public.comercial_documentos WHERE contratacao_id=id1 AND tipo='procuracao_declaracao'))<>1 THEN RAISE EXCEPTION 'Signatários incorretos por arquivo';END IF;
 PERFORM public.comercial_operar('conferir',jsonb_build_object('id',id1,'versao',1,'confirmado',true));
 -- Edição invalida conferência e exige conferir a nova versão.
 c:=public.comercial_operar('salvar',c||jsonb_build_object('objeto','OBJETO FICTÍCIO ALTERADO'));
 IF c->>'conferida_versao' IS NOT NULL OR c->>'status'<>'rascunho' THEN RAISE EXCEPTION 'Conferência não invalidada';END IF;
 v:=(c->>'versao')::integer;
 PERFORM public.comercial_operar('conferir',jsonb_build_object('id',id1,'versao',v,'confirmado',true));
 UPDATE public.comercial_config SET ambiente='producao',envio_habilitado=true,responsavel_operacional=g,responsavel_financeiro=g WHERE id;
 -- Mudar de sandbox para produção exige nova versão.
 negado:=false;BEGIN PERFORM public.comercial_operar('reservar_envio',jsonb_build_object('id',id1,'confirmado',true));EXCEPTION WHEN OTHERS THEN negado:=true;END;IF NOT negado THEN RAISE EXCEPTION 'Mistura de ambientes aceita';END IF;
 c:=public.comercial_operar('salvar',c||jsonb_build_object('observacoes','NOVA VERSÃO PARA TESTE DE ENVIO SEM HTTP'));
 v:=(c->>'versao')::integer;PERFORM public.comercial_operar('conferir',jsonb_build_object('id',id1,'versao',v,'confirmado',true));
 reserva:=public.comercial_operar('reservar_envio',jsonb_build_object('id',id1,'confirmado',true));
 IF jsonb_array_length(reserva)<>2 THEN RAISE EXCEPTION 'Reserva não possui dois arquivos';END IF;
 negado:=false;BEGIN PERFORM public.comercial_operar('reservar_envio',jsonb_build_object('id',id1,'confirmado',true));EXCEPTION WHEN OTHERS THEN negado:=true;END;IF NOT negado THEN RAISE EXCEPTION 'Clique duplicado criou nova reserva';END IF;
 -- Simula uma confirmação e uma falha certa. O retry deve retornar só o faltante.
 UPDATE public.comercial_documentos SET estado='criado',externo_id='token-teste-'||id,criado_provedor_em=now() WHERE contratacao_id=id1 AND versao=v AND tipo='contrato';
 UPDATE public.comercial_documentos SET estado='falha' WHERE contratacao_id=id1 AND versao=v AND tipo='procuracao_declaracao';
 PERFORM comercial_privado.recalcular(id1);
 reserva:=public.comercial_operar('reservar_envio',jsonb_build_object('id',id1,'confirmado',true));IF jsonb_array_length(reserva)<>1 THEN RAISE EXCEPTION 'Retry recriou arquivo já existente';END IF;
 -- Comissão é somente condição, não uma liberação financeira.
 PERFORM public.comercial_operar('comissao',jsonb_build_object('id',id1,'tem_comissao',true,'percentual',10,'beneficiario_id',u));
 IF (SELECT count(*) FROM public.honorarios_contratos)<>total_antes THEN RAISE EXCEPTION 'Fluxo criou conta a receber';END IF;
 -- Um arquivo assinado não formaliza o pacote.
 UPDATE public.comercial_documentos SET estado='assinado',arquivo_assinado_path='arquivo-ficticio-1.pdf' WHERE contratacao_id=id1 AND versao=v AND tipo='contrato';
 PERFORM comercial_privado.recalcular(id1);IF (SELECT status FROM public.comercial_contratacoes WHERE id=id1)='formalizado' THEN RAISE EXCEPTION 'Pacote incompleto formalizado';END IF;
 UPDATE public.comercial_documentos SET estado='assinado',arquivo_assinado_path='arquivo-ficticio-2.pdf' WHERE contratacao_id=id1 AND versao=v AND tipo='procuracao_declaracao';
 PERFORM comercial_privado.recalcular(id1);PERFORM comercial_privado.recalcular(id1);PERFORM comercial_privado.encaminhar(id1);
 SELECT tarefa_operacional_id,tarefa_financeira_id INTO id1,id2 FROM public.comercial_contratacoes WHERE id=(c->>'id')::uuid;
 IF id1 IS NULL OR id2 IS NULL THEN RAISE EXCEPTION 'Tarefas operacional/financeira ausentes';END IF;
 IF (SELECT count(*) FROM public.controladoria_itens WHERE id IN (id1,id2))<>2 THEN RAISE EXCEPTION 'Tarefas duplicadas';END IF;
 -- Sem iniciais: formaliza por via manual de teste em transação, não cria pendência inicial.
 UPDATE public.comercial_config SET envio_habilitado=false WHERE id;
 c2:=public.comercial_operar('salvar',c2||jsonb_build_object('honorarios_iniciais',false,'condicoes',jsonb_build_object('total_centavos',0,'entrada_centavos',0,'parcelas','[]'::jsonb,'exito_descricao','TESTE: percentual e base futura a conferir')));
 PERFORM public.comercial_operar('conferir',jsonb_build_object('id',c2->>'id','versao',c2->'versao','confirmado',true));
 paths:='{}';
 FOR d IN SELECT to_jsonb(x) FROM public.comercial_documentos x WHERE contratacao_id=(c2->>'id')::uuid AND versao=(c2->>'versao')::integer LOOP
  INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('contratacoes',g||'/'||(c2->>'id')||'/'||(d->>'id')||'/teste.pdf','{"mimetype":"application/pdf"}');
  paths:=paths||jsonb_build_object(d->>'id',g||'/'||(c2->>'id')||'/'||(d->>'id')||'/teste.pdf');
 END LOOP;
 UPDATE public.comercial_config SET responsavel_operacional=NULL WHERE id;
 PERFORM public.comercial_operar('formalizar_manual',jsonb_build_object('id',c2->>'id','confirmado',true,'arquivos',paths));
 IF NOT EXISTS(SELECT 1 FROM public.comercial_contratacoes WHERE id=(c2->>'id')::uuid AND status='formalizado' AND operacional_status='pendente' AND tarefa_operacional_id IS NULL AND tarefa_financeira_id IS NULL AND financeiro_status='nao_aplicavel') THEN RAISE EXCEPTION 'Falha de encaminhamento desfez assinatura ou criou cobrança sem iniciais';END IF;
 UPDATE public.comercial_config SET responsavel_operacional=g WHERE id;
 PERFORM public.comercial_operar('recuperar_encaminhamento',jsonb_build_object('id',c2->>'id'));
 PERFORM public.comercial_operar('recuperar_encaminhamento',jsonb_build_object('id',c2->>'id'));
 IF NOT EXISTS(SELECT 1 FROM public.comercial_contratacoes WHERE id=(c2->>'id')::uuid AND tarefa_operacional_id IS NOT NULL AND tarefa_financeira_id IS NULL) THEN RAISE EXCEPTION 'Recuperação operacional sem iniciais incorreta';END IF;
 IF (SELECT count(*) FROM public.controladoria_itens WHERE descricao LIKE '%Contratação: '||(c2->>'id')||'%')<>1 THEN RAISE EXCEPTION 'Recuperação duplicou tarefa';END IF;
 IF (SELECT count(*) FROM public.clientes_comissoes_fechamento)<>comissoes_antes THEN RAISE EXCEPTION 'Formalização liberou comissão antiga';END IF;
 IF (SELECT count(*) FROM public.honorarios_contratos)<>total_antes THEN RAISE EXCEPTION 'Formalização gerou conta financeira indevida';END IF;
 -- Filtros: serviço, UF, responsável, classificação de honorários e tese não confundem endereço com atuação.
 IF (public.comercial_listar(jsonb_build_object('servico_id',s,'uf','MT','responsavel_id',g,'iniciais',true))->>'total')::integer<>1 THEN RAISE EXCEPTION 'Filtros de contratação incorretos';END IF;
 PERFORM public.comercial_operar('acesso',jsonb_build_object('user_id',u,'preparar',true));
 PERFORM set_config('request.jwt.claim.sub',u::text,true);

END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE negado boolean:=false; BEGIN
 IF EXISTS(SELECT 1 FROM public.comercial_contratacoes) THEN RAISE EXCEPTION 'Contratações de outra carteira expostas';END IF;
 BEGIN PERFORM public.comercial_operar('configurar','{}');EXCEPTION WHEN OTHERS THEN negado:=true;END;
 IF NOT negado THEN RAISE EXCEPTION 'Usuário alterou regras sem permissão';END IF;
 negado:=false;BEGIN INSERT INTO public.comercial_contratacoes(responsavel_id,criado_por) VALUES(auth.uid(),auth.uid());EXCEPTION WHEN insufficient_privilege THEN negado:=true;END;
 IF NOT negado THEN RAISE EXCEPTION 'Escrita direta contornou o fluxo';END IF;
 negado:=false;BEGIN PERFORM public.comercial_registrar_provedor(gen_random_uuid(),NULL,'{}');EXCEPTION WHEN insufficient_privilege THEN negado:=true;END;
 IF NOT negado THEN RAISE EXCEPTION 'Cliente conseguiu forjar assinatura';END IF;
 negado:=false;BEGIN PERFORM public.comercial_operar('salvar',jsonb_build_object('cliente_id',current_setting('test.comercial_cliente'),'objeto','tentativa de acesso'));EXCEPTION WHEN OTHERS THEN negado:=true;END;
 IF NOT negado THEN RAISE EXCEPTION 'Cliente de outra carteira reutilizado indevidamente';END IF;
END $$;
RESET ROLE;
ROLLBACK;
