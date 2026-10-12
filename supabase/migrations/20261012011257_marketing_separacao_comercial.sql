-- Separa o CRM do acesso às demandas dos próprios clientes.
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid,_modulo public.modulo,_acao public.acao_permissao) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.is_gestor(_user_id) OR (EXISTS(SELECT 1 FROM public.user_permissions WHERE user_id=_user_id AND modulo=_modulo AND acao=_acao AND permitido)
 AND (_modulo<>'marketing' OR EXISTS(SELECT 1 FROM public.mkt_acessos WHERE user_id=_user_id AND comercial)
 OR EXISTS(SELECT 1 FROM public.configuracoes_sistema WHERE secao='comercial' AND chave='responsavel_comunicacao_user_id' AND valor=_user_id::text)))
$$;
CREATE OR REPLACE FUNCTION marketing_privado.comercial(acao text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.is_interno_ativo(auth.uid()) AND (public.is_gestor(auth.uid()) OR EXISTS(SELECT 1 FROM public.mkt_acessos a WHERE a.user_id=auth.uid() AND a.comercial AND EXISTS(SELECT 1 FROM public.user_permissions p WHERE p.user_id=a.user_id AND p.modulo='marketing' AND p.acao::text=$1 AND p.permitido)) OR EXISTS(SELECT 1 FROM public.configuracoes_sistema WHERE secao='comercial' AND chave='responsavel_comunicacao_user_id' AND valor=auth.uid()::text))
$$;
CREATE FUNCTION marketing_privado.demanda_permitida(acao text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT public.is_interno_ativo(auth.uid()) AND (marketing_privado.comercial(acao) OR public.has_permission(auth.uid(),'clientes'::public.modulo,acao::public.acao_permissao)) $$;
REVOKE ALL ON FUNCTION marketing_privado.demanda_permitida(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION marketing_privado.demanda_permitida(text) TO authenticated;
DROP POLICY demandas_ler ON public.comercial_demandas;
CREATE POLICY demandas_ler ON public.comercial_demandas FOR SELECT TO authenticated USING(marketing_privado.demanda_permitida('visualizar') AND ((cliente_id IS NULL AND marketing_privado.comercial('visualizar')) OR public.usuario_ve_cliente(auth.uid(),cliente_id)));

CREATE OR REPLACE FUNCTION marketing_privado.operar(operacao text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i public.mkt_itens; anterior jsonb; uid uuid:=auth.uid(); alvo uuid; novo_status text; etapa text; chave text; v text; child record; r public.mkt_itens; demanda public.comercial_demandas; tese uuid; gasto jsonb; id_user uuid;
BEGIN
 IF uid IS NULL OR NOT public.is_interno_ativo(uid) THEN RAISE EXCEPTION 'Sessão interna ativa necessária'; END IF;
 IF operacao='permissao' THEN
  IF NOT public.is_gestor(uid) THEN RAISE EXCEPTION 'Somente a direção pode conceder acesso'; END IF;
  id_user:=(payload->>'user_id')::uuid;
  IF NOT public.is_interno_ativo(id_user) THEN RAISE EXCEPTION 'Selecione usuário interno ativo'; END IF;
  INSERT INTO public.mkt_acessos(user_id,aprovar,financeiro,gerenciar,atualizado_por) VALUES(id_user,coalesce((payload->>'aprovar')::boolean,false),coalesce((payload->>'financeiro')::boolean,false),coalesce((payload->>'gerenciar')::boolean,false),uid)
  ON CONFLICT(user_id) DO UPDATE SET aprovar=excluded.aprovar,financeiro=excluded.financeiro,gerenciar=excluded.gerenciar,atualizado_por=uid,atualizado_em=now();
  FOREACH chave IN ARRAY ARRAY['visualizar','criar','editar','exportar'] LOOP
   INSERT INTO public.user_permissions(user_id,modulo,acao,permitido) VALUES(id_user,'marketing'::public.modulo,chave::public.acao_permissao,coalesce((payload->>chave)::boolean,false))
   ON CONFLICT(user_id,modulo,acao) DO UPDATE SET permitido=excluded.permitido;
  END LOOP;
  PERFORM marketing_privado.auditar('permissao',id_user,'alterar',NULL,payload); RETURN '{}'::jsonb;
 END IF;
 IF operacao IN ('area','tese','servico') THEN
  IF NOT public.is_gestor(uid) THEN RAISE EXCEPTION 'Somente a direção pode manter o catálogo'; END IF;
  IF nullif(trim(payload->>'nome'),'') IS NULL THEN RAISE EXCEPTION 'Informe nome'; END IF;
  alvo:=coalesce(nullif(payload->>'id','')::uuid,gen_random_uuid());
  IF operacao='area' THEN
   INSERT INTO public.juridico_areas(id,nome,descricao,ativo) VALUES(alvo,payload->>'nome',payload->>'descricao',coalesce((payload->>'ativo')::boolean,true))
   ON CONFLICT(id) DO UPDATE SET nome=excluded.nome,descricao=excluded.descricao,ativo=excluded.ativo;
  ELSIF operacao='tese' THEN
   INSERT INTO public.juridico_teses(id,nome,descricao,area_id,servico_principal_id,observacoes,ativo) VALUES(alvo,payload->>'nome',payload->>'descricao',nullif(payload->>'area_id','')::uuid,nullif(payload->>'servico_id','')::uuid,payload->>'observacoes',coalesce((payload->>'ativo')::boolean,true))
   ON CONFLICT(id) DO UPDATE SET nome=excluded.nome,descricao=excluded.descricao,area_id=excluded.area_id,servico_principal_id=excluded.servico_principal_id,ativo=excluded.ativo;
   DELETE FROM public.juridico_tese_servicos WHERE tese_id=alvo;
   FOR v IN SELECT jsonb_array_elements_text(coalesce(payload->'servicos','[]')) LOOP INSERT INTO public.juridico_tese_servicos VALUES(alvo,v::uuid) ON CONFLICT DO NOTHING; END LOOP;
  ELSE
   IF EXISTS(SELECT 1 FROM public.catalogo_servicos WHERE nome_norm=public.catalogo_norm(payload->>'nome') AND id<>alvo) THEN RAISE EXCEPTION 'Já existe serviço com esse nome no catálogo'; END IF;
   INSERT INTO public.catalogo_servicos(id,nome,area,area_id,descricao,publico,status_homologacao,classificacao) VALUES(alvo,payload->>'nome',coalesce((SELECT nome FROM public.juridico_areas WHERE id=nullif(payload->>'area_id','')::uuid),'geral'),nullif(payload->>'area_id','')::uuid,payload->>'descricao','ambos','a_confirmar','servico_juridico')
   ON CONFLICT(id) DO UPDATE SET nome=excluded.nome,descricao=excluded.descricao,area_id=excluded.area_id,area=excluded.area;
  END IF;
  PERFORM marketing_privado.auditar('catalogo',alvo,operacao,NULL,payload); RETURN jsonb_build_object('id',alvo);
 END IF;
 IF operacao='demanda' THEN
  IF NOT marketing_privado.demanda_permitida('editar') THEN RAISE EXCEPTION 'Sem acesso comercial'; END IF;
  alvo:=nullif(payload->>'id','')::uuid;
  IF alvo IS NOT NULL THEN SELECT * INTO demanda FROM public.comercial_demandas WHERE id=alvo FOR UPDATE; IF NOT FOUND OR (demanda.cliente_id IS NOT NULL AND NOT public.usuario_ve_cliente(uid,demanda.cliente_id)) THEN RAISE EXCEPTION 'Demanda fora do seu escopo'; END IF; END IF;
  IF NOT marketing_privado.comercial('editar') AND (nullif(payload->>'cliente_id','') IS NULL OR (nullif(payload->>'lead_id','')::uuid IS DISTINCT FROM demanda.lead_id)) THEN RAISE EXCEPTION 'Sem acesso aos leads comerciais'; END IF;
  IF nullif(payload->>'cliente_id','') IS NOT NULL AND NOT public.usuario_ve_cliente(uid,(payload->>'cliente_id')::uuid) THEN RAISE EXCEPTION 'Cliente fora do seu escopo'; END IF;
  IF nullif(payload->>'contrato_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.honorarios_contratos h WHERE h.id=(payload->>'contrato_id')::uuid AND h.cliente_id=(payload->>'cliente_id')::uuid) THEN RAISE EXCEPTION 'Contrato não pertence ao cliente'; END IF;
  IF nullif(payload->>'processo_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.processos p WHERE p.id=(payload->>'processo_id')::uuid AND p.cliente_id=(payload->>'cliente_id')::uuid) THEN RAISE EXCEPTION 'Processo não pertence ao cliente'; END IF;
  alvo:=coalesce(alvo,gen_random_uuid()); anterior:=to_jsonb(demanda);
  INSERT INTO public.comercial_demandas(id,cliente_id,lead_id,servico_id,status,aberto_em,contratado_em,origem,campanha_id,responsavel_id,contrato_id,processo_id,observacoes)
  VALUES(alvo,nullif(payload->>'cliente_id','')::uuid,nullif(payload->>'lead_id','')::uuid,(payload->>'servico_id')::uuid,payload->>'status',coalesce(nullif(payload->>'aberto_em','')::date,current_date),nullif(payload->>'contratado_em','')::date,payload->>'origem',nullif(payload->>'campanha_id','')::uuid,nullif(payload->>'responsavel_id','')::uuid,nullif(payload->>'contrato_id','')::uuid,nullif(payload->>'processo_id','')::uuid,payload->>'observacoes')
  ON CONFLICT(id) DO UPDATE SET status=excluded.status,contratado_em=excluded.contratado_em,origem=excluded.origem,campanha_id=excluded.campanha_id,contrato_id=excluded.contrato_id,processo_id=excluded.processo_id,observacoes=excluded.observacoes;
  DELETE FROM public.comercial_demanda_teses WHERE demanda_id=alvo;
  FOR v IN SELECT jsonb_array_elements_text(coalesce(payload->'teses','[]')) LOOP INSERT INTO public.comercial_demanda_teses VALUES(alvo,v::uuid); END LOOP;
  PERFORM marketing_privado.auditar('demanda',alvo,'salvar',anterior,payload); RETURN jsonb_build_object('id',alvo);
 END IF;
 IF NOT marketing_privado.pode('visualizar') THEN RAISE EXCEPTION 'Sem acesso ao marketing'; END IF;
 alvo:=nullif(payload->>'id','')::uuid;
 IF alvo IS NOT NULL THEN SELECT * INTO i FROM public.mkt_itens WHERE id=alvo FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Registro inexistente'; END IF; END IF;
 anterior:=to_jsonb(i);
 IF operacao='comentario' THEN
  IF NOT marketing_privado.pode('editar') OR alvo IS NULL THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  INSERT INTO public.mkt_comentarios(item_id,texto,usuario_id) VALUES(alvo,payload->>'texto',uid);
  PERFORM marketing_privado.notificar(i.responsavel_id,'Novo comentário no marketing',alvo); RETURN '{}'::jsonb;
 END IF;
 IF operacao='financeiro' THEN
  IF i.tipo<>'campanha' OR NOT marketing_privado.pode('financeiro') THEN RAISE EXCEPTION 'Sem permissão financeira'; END IF;
  INSERT INTO public.mkt_campanha_financeiro VALUES(alvo,coalesce((payload->>'orcamento')::numeric,0),coalesce((payload->>'gasto')::numeric,0)) ON CONFLICT(campanha_id) DO UPDATE SET orcamento=excluded.orcamento,gasto=excluded.gasto;
  PERFORM marketing_privado.auditar('financeiro',alvo,'salvar',NULL,payload); RETURN '{}'::jsonb;
 END IF;
 IF operacao='salvar' THEN
  IF NOT marketing_privado.pode(CASE WHEN alvo IS NULL THEN 'criar' ELSE 'editar' END) THEN RAISE EXCEPTION 'Sem permissão para salvar'; END IF;
  IF i.arquivado_em IS NOT NULL THEN RAISE EXCEPTION 'Registro arquivado'; END IF;
  IF i.status='publicado' THEN RAISE EXCEPTION 'Conteúdo publicado é imutável; crie uma nova revisão'; END IF;
  IF alvo IS NOT NULL AND (payload->>'versao')::integer IS DISTINCT FROM i.versao THEN RAISE EXCEPTION 'O registro foi alterado. Recarregue antes de salvar'; END IF;
  alvo:=coalesce(alvo,gen_random_uuid());
  IF NOT marketing_privado.link_valido(payload->'dados'->>'link_drive',true) THEN RAISE EXCEPTION 'Informe um link HTTPS válido do Google Drive'; END IF;
  FOR chave,v IN SELECT key,value FROM jsonb_each_text(coalesce(payload->'dados','{}')) LOOP
   IF chave LIKE 'link_%' OR chave IN ('site','instagram','facebook','tiktok','youtube') THEN IF NOT marketing_privado.link_valido(v,chave='link_drive') THEN RAISE EXCEPTION 'Link inválido: %',chave; END IF; END IF;
  END LOOP;
  IF nullif(payload->>'responsavel_id','') IS NOT NULL AND NOT public.is_interno_ativo((payload->>'responsavel_id')::uuid) THEN RAISE EXCEPTION 'Responsável deve ser interno e ativo'; END IF;
  IF payload->'dados' ?| ARRAY['orcamento','gasto','cliente_id','cpf','valor_contrato'] THEN RAISE EXCEPTION 'Dados privados não pertencem ao conteúdo de marketing'; END IF;
  IF i.tipo IS NOT NULL AND payload->>'tipo'<>i.tipo THEN RAISE EXCEPTION 'Tipo não pode ser alterado'; END IF;
  IF nullif(payload->>'pauta_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.mkt_itens WHERE id=(payload->>'pauta_id')::uuid AND tipo='pauta' AND status='aprovado' AND versao_aprovada=versao) THEN RAISE EXCEPTION 'Pauta deve estar aprovada'; END IF;
  IF payload->>'tipo'='material' AND nullif(payload->'dados'->>'link_drive','') IS NULL THEN RAISE EXCEPTION 'Material exige link do Drive'; END IF;
  IF payload->>'tipo'='rotina' AND (payload->'dados'->>'frequencia' NOT IN ('diaria','semanal','mensal') OR nullif(payload->>'data_prevista','') IS NULL) THEN RAISE EXCEPTION 'Rotina exige frequência e data de início'; END IF;
  INSERT INTO public.mkt_itens(id,tipo,titulo,descricao,prioridade,responsavel_id,area_id,servico_id,tese_id,origem_id,campanha_id,planejamento_id,pauta_id,canal,formato,prazo,data_prevista,dados)
  VALUES(alvo,payload->>'tipo',payload->>'titulo',coalesce(payload->>'descricao',''),coalesce(payload->>'prioridade','normal'),nullif(payload->>'responsavel_id','')::uuid,nullif(payload->>'area_id','')::uuid,nullif(payload->>'servico_id','')::uuid,nullif(payload->>'tese_id','')::uuid,nullif(payload->>'origem_id','')::uuid,nullif(payload->>'campanha_id','')::uuid,nullif(payload->>'planejamento_id','')::uuid,nullif(payload->>'pauta_id','')::uuid,payload->>'canal',payload->>'formato',nullif(payload->>'prazo','')::timestamptz,nullif(payload->>'data_prevista','')::timestamptz,coalesce(payload->'dados','{}'))
  ON CONFLICT(id) DO UPDATE SET titulo=excluded.titulo,descricao=excluded.descricao,prioridade=excluded.prioridade,responsavel_id=excluded.responsavel_id,area_id=excluded.area_id,servico_id=excluded.servico_id,tese_id=excluded.tese_id,campanha_id=excluded.campanha_id,planejamento_id=excluded.planejamento_id,pauta_id=excluded.pauta_id,canal=excluded.canal,formato=excluded.formato,prazo=excluded.prazo,data_prevista=excluded.data_prevista,dados=excluded.dados,versao=public.mkt_itens.versao+1,versao_aprovada=NULL,roteiro_aprovado=CASE WHEN public.mkt_itens.tipo='roteiro' AND (public.mkt_itens.titulo IS DISTINCT FROM excluded.titulo OR public.mkt_itens.descricao IS DISTINCT FROM excluded.descricao OR (public.mkt_itens.dados-ARRAY['link_drive','versao_arquivo','checklist']) IS DISTINCT FROM (excluded.dados-ARRAY['link_drive','versao_arquivo','checklist'])) THEN NULL ELSE public.mkt_itens.roteiro_aprovado END,status=CASE WHEN public.mkt_itens.status='rascunho' THEN 'rascunho' ELSE 'ajustes' END,atualizado_em=now()
  RETURNING * INTO i;
 ELSIF operacao='submeter' THEN
  IF NOT marketing_privado.pode('editar') OR i.status NOT IN ('rascunho','producao','revisao','ajustes','edicao','gravado') THEN RAISE EXCEPTION 'Material não pode ser submetido neste estado'; END IF;
  IF i.tipo IN ('conteudo','artigo','roteiro') AND NOT (coalesce((i.dados->'checklist'->>'informacoes')::boolean,false) AND coalesce((i.dados->'checklist'->>'sem_promessas')::boolean,false) AND coalesce((i.dados->'checklist'->>'linguagem')::boolean,false) AND coalesce((i.dados->'checklist'->>'privacidade')::boolean,false) AND coalesce((i.dados->'checklist'->>'referencias')::boolean,false) AND coalesce((i.dados->'checklist'->>'autoria')::boolean,false) AND coalesce((i.dados->'checklist'->>'cta')::boolean,false)) THEN RAISE EXCEPTION 'Preencha o checklist de revisão humana'; END IF;
  etapa:=CASE WHEN i.tipo='roteiro' AND i.roteiro_aprovado IS NULL THEN 'roteiro' ELSE 'material' END;
  IF i.tipo='roteiro' AND etapa='material' AND nullif(i.dados->>'link_drive','') IS NULL THEN RAISE EXCEPTION 'Vídeo final exige link do Drive'; END IF;
  INSERT INTO public.mkt_versoes(item_id,versao,etapa,snapshot,criado_por) VALUES(alvo,i.versao,etapa,to_jsonb(i),uid) ON CONFLICT(item_id,versao) DO NOTHING;
  UPDATE public.mkt_itens SET status='aguardando_aprovacao',atualizado_em=now() WHERE id=alvo RETURNING * INTO i;
  FOR id_user IN SELECT p.id FROM public.profiles p WHERE p.ativo AND (public.is_gestor(p.id) OR EXISTS(SELECT 1 FROM public.mkt_acessos a WHERE a.user_id=p.id AND a.aprovar)) LOOP PERFORM marketing_privado.notificar(id_user,'Material aguardando aprovação',alvo); END LOOP;
 ELSIF operacao='decidir' THEN
  IF NOT marketing_privado.pode('aprovar') OR i.status<>'aguardando_aprovacao' THEN RAISE EXCEPTION 'Sem aprovação pendente ou sem permissão'; END IF;
  IF (payload->>'versao')::integer IS DISTINCT FROM i.versao THEN RAISE EXCEPTION 'Versão mudou; analise a versão atual'; END IF;
  novo_status:=payload->>'resultado';
  IF novo_status NOT IN ('aprovado','rejeitado','ajustes') THEN RAISE EXCEPTION 'Decisão inválida'; END IF;
  IF novo_status<>'aprovado' AND nullif(trim(payload->>'justificativa'),'') IS NULL THEN RAISE EXCEPTION 'Justificativa obrigatória'; END IF;
  SELECT v.etapa INTO etapa FROM public.mkt_versoes v WHERE v.item_id=alvo AND v.versao=i.versao;
  INSERT INTO public.mkt_decisoes(item_id,versao,etapa,resultado,justificativa,usuario_id) VALUES(alvo,i.versao,etapa,novo_status,payload->>'justificativa',uid);
  UPDATE public.mkt_itens SET status=CASE WHEN novo_status='aprovado' AND etapa='roteiro' THEN 'aguardando_gravacao' ELSE novo_status END,
   roteiro_aprovado=CASE WHEN novo_status='aprovado' AND etapa='roteiro' THEN versao ELSE roteiro_aprovado END,
   versao_aprovada=CASE WHEN novo_status='aprovado' AND etapa<>'roteiro' THEN versao ELSE NULL END,atualizado_em=now() WHERE id=alvo RETURNING * INTO i;
  PERFORM marketing_privado.notificar(i.responsavel_id,'Decisão da direção: '||novo_status,alvo);
  IF i.tipo='planejamento' AND novo_status='aprovado' THEN
   FOR r IN SELECT * FROM public.mkt_itens WHERE planejamento_id=alvo AND status='aguardando_aprovacao' LOOP
    INSERT INTO public.mkt_decisoes(item_id,versao,etapa,resultado,justificativa,usuario_id) VALUES(r.id,r.versao,'material','aprovado','Planejamento aprovado integralmente',uid);
    UPDATE public.mkt_itens SET status='aprovado',versao_aprovada=versao WHERE id=r.id;
   END LOOP;
  END IF;
 ELSIF operacao='status' THEN
  IF NOT marketing_privado.pode('editar') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  novo_status:=payload->>'status';
  IF NOT ((i.status IN ('rascunho','ajustes') AND novo_status='producao') OR (i.status='producao' AND novo_status='revisao') OR (i.status='aprovado' AND novo_status='pronto') OR (i.tipo='roteiro' AND i.status='aguardando_gravacao' AND novo_status='gravado') OR (i.tipo='roteiro' AND i.status='gravado' AND novo_status='edicao') OR (i.tipo='campanha' AND ((i.status='aprovado' AND novo_status='ativa' AND i.versao_aprovada=i.versao) OR (i.status='ativa' AND novo_status IN ('pausada','encerrada')) OR (i.status='pausada' AND novo_status IN ('ativa','encerrada')))) OR (i.tipo IN ('tarefa','pesquisa','gravacao') AND novo_status='concluido' AND i.status<>'arquivado')) THEN RAISE EXCEPTION 'Transição não permitida'; END IF;
  UPDATE public.mkt_itens SET status=novo_status,versao=CASE WHEN tipo='roteiro' AND novo_status='edicao' THEN versao+1 ELSE versao END,atualizado_em=now() WHERE id=alvo RETURNING * INTO i;
 ELSIF operacao='publicar' THEN
  IF NOT marketing_privado.pode('editar') OR i.tipo NOT IN ('conteudo','roteiro','artigo') OR i.status NOT IN ('aprovado','pronto') OR i.versao_aprovada IS DISTINCT FROM i.versao THEN RAISE EXCEPTION 'A versão atual exige aprovação final'; END IF;
  IF NOT marketing_privado.link_valido(payload->>'link_publicacao') OR nullif(payload->>'link_publicacao','') IS NULL OR nullif(payload->>'publicado_em','') IS NULL THEN RAISE EXCEPTION 'Informe data/hora e URL HTTPS da publicação'; END IF;
  UPDATE public.mkt_itens SET status='publicado',dados=dados||jsonb_build_object('link_publicacao',payload->>'link_publicacao','publicado_em',payload->>'publicado_em','publicado_por',uid,'plataforma_publicada',coalesce(payload->>'plataforma',canal),'observacoes_publicacao',payload->>'observacoes'),atualizado_em=now() WHERE id=alvo RETURNING * INTO i;
 ELSIF operacao='metricas' THEN
  IF NOT marketing_privado.pode('editar') OR i.status<>'publicado' AND i.tipo<>'campanha' THEN RAISE EXCEPTION 'Métricas exigem publicação ou campanha'; END IF;
  FOR chave,v IN SELECT key,value FROM jsonb_each_text(payload->'metricas') LOOP
   IF chave NOT IN ('alcance','visualizacoes','interacoes','contatos','oportunidades','curtidas','comentarios','compartilhamentos','salvamentos') OR v !~ '^\d+$' THEN RAISE EXCEPTION 'Métrica inválida'; END IF;
  END LOOP;
  UPDATE public.mkt_itens SET dados=jsonb_set(dados,'{metricas}',payload->'metricas'),atualizado_em=now() WHERE id=alvo RETURNING * INTO i;
 ELSIF operacao='arquivar' THEN
  IF NOT marketing_privado.pode('editar') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  UPDATE public.mkt_itens SET status='arquivado',arquivado_em=now(),atualizado_em=now() WHERE id=alvo RETURNING * INTO i;
 ELSIF operacao='converter' THEN
  IF NOT marketing_privado.pode('criar') OR NOT ((i.tipo='pesquisa' AND payload->>'tipo_destino'='ideia') OR (i.tipo='ideia' AND i.status='aprovado' AND payload->>'tipo_destino'='pauta') OR (i.tipo='pauta' AND i.status='aprovado' AND payload->>'tipo_destino' IN ('conteudo','artigo','roteiro')) OR (i.status='publicado' AND i.tipo='artigo' AND payload->>'tipo_destino'='artigo')) THEN RAISE EXCEPTION 'Conversão exige origem e aprovação adequadas'; END IF;
  IF i.tipo='ideia' THEN UPDATE public.mkt_itens SET status='convertida',atualizado_em=now() WHERE id=i.id; END IF;
  alvo:=gen_random_uuid();
  INSERT INTO public.mkt_itens(id,tipo,titulo,descricao,prioridade,responsavel_id,area_id,servico_id,tese_id,origem_id,pauta_id,campanha_id,canal,formato,dados)
  VALUES(alvo,payload->>'tipo_destino',i.titulo,i.descricao,i.prioridade,i.responsavel_id,i.area_id,i.servico_id,i.tese_id,i.id,CASE WHEN i.tipo='pauta' THEN i.id ELSE i.pauta_id END,i.campanha_id,i.canal,i.formato,i.dados-ARRAY['link_publicacao','publicado_em','publicado_por','metricas']) RETURNING * INTO i;
 ELSIF operacao='gravacao' THEN
  IF NOT marketing_privado.pode('editar') OR i.tipo<>'gravacao' THEN RAISE EXCEPTION 'Selecione sessão de gravação'; END IF;
  DELETE FROM public.mkt_gravacao_itens WHERE sessao_id=alvo AND status='aguardando' AND NOT (roteiro_id::text IN (SELECT jsonb_array_elements_text(payload->'roteiros')));
  FOR child IN SELECT value, ordinality FROM jsonb_array_elements_text(payload->'roteiros') WITH ORDINALITY LOOP
   IF NOT EXISTS(SELECT 1 FROM public.mkt_itens WHERE id=child.value::uuid AND tipo='roteiro' AND roteiro_aprovado IS NOT NULL AND status IN ('aguardando_gravacao','gravado','edicao')) THEN RAISE EXCEPTION 'Roteiro ainda não aprovado'; END IF;
   INSERT INTO public.mkt_gravacao_itens VALUES(alvo,child.value::uuid,child.ordinality::integer,'aguardando') ON CONFLICT(sessao_id,roteiro_id) DO UPDATE SET ordem=excluded.ordem;
  END LOOP; PERFORM marketing_privado.auditar('item',i.id,'gravacao',NULL,payload); RETURN to_jsonb(i);
 ELSE RAISE EXCEPTION 'Operação desconhecida'; END IF;
 -- Escrita atômica nas tabelas originais; o envelope não cria campanhas paralelas.
 IF i.tipo='campanha' THEN
  INSERT INTO public.mkt_campanhas(id,nome,canal,objetivo,data_inicio,status,criado_por) VALUES(i.id,i.titulo,CASE WHEN i.canal IN ('meta_ads','google_ads','tiktok_ads','outro_pago') THEN i.canal ELSE 'outro_pago' END,coalesce(i.dados->>'objetivo_campanha','leads'),coalesce(i.data_prevista::date,current_date),CASE WHEN i.status IN ('ativa','pausada','encerrada') THEN i.status ELSE 'planejada' END,uid)
  ON CONFLICT(id) DO UPDATE SET nome=excluded.nome,objetivo=excluded.objetivo,status=excluded.status;
 ELSIF i.tipo IN ('conteudo','roteiro','artigo') THEN
  INSERT INTO public.mkt_conteudo(id,titulo,canal,formato,pauta,legenda,link_material,data_planejada,status,responsavel_id,criado_por)
  VALUES(i.id,i.titulo,coalesce(i.canal,'instagram'),CASE WHEN i.tipo='artigo' THEN 'blog_post' WHEN i.tipo='roteiro' THEN 'reels' ELSE coalesce(i.formato,'feed_foto') END,i.descricao,i.dados->>'legenda',i.dados->>'link_drive',i.data_prevista::date,CASE WHEN i.status='publicado' THEN 'publicado' WHEN i.status='aprovado' THEN 'aprovado' ELSE 'producao' END,i.responsavel_id,uid)
  ON CONFLICT(id) DO UPDATE SET titulo=excluded.titulo,pauta=excluded.pauta,legenda=excluded.legenda,link_material=excluded.link_material,data_planejada=excluded.data_planejada,status=excluded.status;
 END IF;
 IF operacao IN ('salvar','converter') THEN
  INSERT INTO public.mkt_versoes(item_id,versao,etapa,snapshot,criado_por) VALUES(i.id,i.versao,CASE WHEN i.tipo='roteiro' AND i.roteiro_aprovado IS NULL THEN 'roteiro' ELSE 'material' END,to_jsonb(i),uid) ON CONFLICT DO NOTHING;
 END IF;
 PERFORM marketing_privado.auditar('item',i.id,operacao,anterior,to_jsonb(i)); RETURN to_jsonb(i);
END $$;
CREATE OR REPLACE FUNCTION marketing_privado.contexto() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE demandas boolean; comercial boolean; financeiro boolean;
BEGIN
 IF NOT marketing_privado.pode('visualizar') AND NOT marketing_privado.demanda_permitida('visualizar') AND NOT public.has_permission(auth.uid(),'processos'::public.modulo,'visualizar'::public.acao_permissao) THEN RAISE EXCEPTION 'Sem acesso'; END IF;
 demandas:=marketing_privado.demanda_permitida('visualizar'); comercial:=marketing_privado.comercial('visualizar'); financeiro:=marketing_privado.pode('financeiro');
 RETURN jsonb_build_object(
 'permissoes',jsonb_build_object('visualizar',marketing_privado.pode('visualizar'),'criar',marketing_privado.pode('criar'),'editar',marketing_privado.pode('editar'),'aprovar',marketing_privado.pode('aprovar'),'financeiro',financeiro,'gerenciar',marketing_privado.pode('gerenciar'),'exportar',marketing_privado.pode('exportar'),'comercial',comercial,'demandas',demandas,'gestor',public.is_gestor(auth.uid())),
 'usuarios',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'nome',nome)),'[]') FROM public.profiles WHERE ativo AND coalesce(tipo_portal,'interno')='interno'),
 'areas',(SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]') FROM public.juridico_areas a),
 'teses',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM public.juridico_teses t),
 'tese_servicos',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM public.juridico_tese_servicos t),
 'servicos',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'nome',nome,'area_id',area_id,'area',area,'descricao',descricao,'status',status_homologacao)),'[]') FROM public.catalogo_servicos WHERE classificacao='servico_juridico'),
 'clientes',CASE WHEN demandas THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'nome',nome)),'[]') FROM public.clientes WHERE public.usuario_ve_cliente(auth.uid(),id)) ELSE '[]'::jsonb END,
 'leads',CASE WHEN comercial THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'nome',nome)),'[]') FROM public.mkt_leads) ELSE '[]'::jsonb END,
 'contratos',CASE WHEN demandas THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'cliente_id',cliente_id,'status',status)),'[]') FROM public.honorarios_contratos WHERE public.usuario_ve_cliente(auth.uid(),cliente_id)) ELSE '[]'::jsonb END,
 'campanhas',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'nome',nome)),'[]') FROM public.mkt_campanhas),
 'acessos',CASE WHEN public.is_gestor(auth.uid()) THEN (SELECT coalesce(jsonb_agg(to_jsonb(a)||coalesce((SELECT jsonb_object_agg(p.acao::text,p.permitido) FROM public.user_permissions p WHERE p.user_id=a.user_id AND p.modulo='marketing'::public.modulo),'{}'::jsonb)),'[]') FROM public.mkt_acessos a) ELSE '[]'::jsonb END);
END $$;
CREATE OR REPLACE FUNCTION marketing_privado.demanda_historico(id_demanda uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.comercial_demandas;
BEGIN
 IF NOT marketing_privado.demanda_permitida('visualizar') THEN RAISE EXCEPTION 'Sem acesso comercial'; END IF;
 SELECT * INTO d FROM public.comercial_demandas WHERE id=id_demanda;
 IF NOT FOUND OR (d.cliente_id IS NULL AND NOT marketing_privado.comercial('visualizar')) OR d.cliente_id IS NOT NULL AND NOT public.usuario_ve_cliente(auth.uid(),d.cliente_id) THEN RAISE EXCEPTION 'Demanda fora do seu escopo'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'quando',a.criado_em,'usuario',p.nome,'acao',a.acao,'situacao_anterior',a.antes->>'status','situacao_atual',a.depois->>'status','contratado_em',a.depois->>'contratado_em') ORDER BY a.id DESC),'[]') FROM public.mkt_auditoria a LEFT JOIN public.profiles p ON p.id=a.usuario_id WHERE a.entidade='demanda' AND a.entidade_id=id_demanda);
END $$;