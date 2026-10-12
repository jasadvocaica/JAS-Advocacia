DROP POLICY mkt_itens_ler ON public.mkt_itens;
CREATE POLICY mkt_itens_ler ON public.mkt_itens FOR SELECT TO authenticated USING(marketing_privado.pode('visualizar') AND (tipo NOT IN ('tarefa','rotina') OR responsavel_id=auth.uid() OR criado_por=auth.uid() OR marketing_privado.pode('gerenciar')));
-- Históricos seguem o escopo de leitura do registro.
DROP POLICY mkt_versoes_ler ON public.mkt_versoes;
CREATE POLICY mkt_versoes_ler ON public.mkt_versoes FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.mkt_itens i WHERE i.id=item_id));
DROP POLICY mkt_comentarios_ler ON public.mkt_comentarios;
CREATE POLICY mkt_comentarios_ler ON public.mkt_comentarios FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.mkt_itens i WHERE i.id=item_id));
CREATE OR REPLACE FUNCTION marketing_privado.estendido(operacao text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE modelo public.mkt_modelos; pauta public.mkt_itens; pacote public.mkt_pacotes; mat jsonb; novo jsonb; id_modelo uuid; resultado jsonb:='[]'; destino text; existente public.mkt_itens;
BEGIN
 IF NOT public.is_interno_ativo(auth.uid()) THEN RAISE EXCEPTION 'Sessão ativa necessária'; END IF;
 IF nullif(payload->>'id','') IS NOT NULL THEN
  SELECT * INTO existente FROM public.mkt_itens WHERE id=(payload->>'id')::uuid;
  IF existente.tipo IN ('tarefa','rotina') AND existente.responsavel_id IS DISTINCT FROM auth.uid() AND existente.criado_por IS DISTINCT FROM auth.uid() AND NOT marketing_privado.pode('gerenciar') THEN RAISE EXCEPTION 'Sem acesso à atividade de outro colaborador'; END IF;
 END IF;
 IF operacao='salvar' AND payload->>'tipo' IN ('tarefa','rotina') AND nullif(payload->>'responsavel_id','') IS NOT NULL AND (payload->>'responsavel_id')::uuid<>auth.uid() AND NOT marketing_privado.pode('gerenciar') THEN RAISE EXCEPTION 'Distribuir atividades exige supervisão autorizada'; END IF;
 IF operacao='modelo_salvar' THEN
  IF NOT public.is_gestor(auth.uid()) THEN RAISE EXCEPTION 'Somente a direção pode manter modelos'; END IF;
  IF payload->'dados' ?| ARRAY['cliente_id','cpf','orcamento','gasto','valor_contrato'] THEN RAISE EXCEPTION 'Modelo contém campos privados'; END IF;
  id_modelo:=coalesce(nullif(payload->>'id','')::uuid,gen_random_uuid());
  INSERT INTO public.mkt_modelos(id,nome,tipo,formato,dados,ativo) VALUES(id_modelo,payload->>'nome',payload->>'tipo',payload->>'formato',coalesce(payload->'dados','{}'),coalesce((payload->>'ativo')::boolean,true)) ON CONFLICT(id) DO UPDATE SET nome=excluded.nome,tipo=excluded.tipo,formato=excluded.formato,dados=excluded.dados,ativo=excluded.ativo,versao=public.mkt_modelos.versao+1,atualizado_em=now();
  PERFORM marketing_privado.auditar('modelo',id_modelo,'salvar',NULL,payload); RETURN jsonb_build_object('id',id_modelo);
 ELSIF operacao='modelo_usar' THEN
  IF NOT marketing_privado.pode('criar') THEN RAISE EXCEPTION 'Sem permissão para criar'; END IF;
  SELECT * INTO modelo FROM public.mkt_modelos WHERE id=(payload->>'modelo_id')::uuid AND ativo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Modelo indisponível'; END IF;
  novo:=marketing_privado.operar('salvar',jsonb_build_object('tipo',modelo.tipo,'titulo',coalesce(nullif(payload->>'titulo',''),modelo.nome),'formato',modelo.formato,'dados',modelo.dados-ARRAY['checklist','link_publicacao','publicado_em','publicado_por','metricas'],'responsavel_id',auth.uid()));
  UPDATE public.mkt_itens SET modelo_id=modelo.id WHERE id=(novo->>'id')::uuid; RETURN novo;
 ELSIF operacao='pacote' THEN
  IF NOT marketing_privado.pode('criar') OR NOT marketing_privado.pode('editar') THEN RAISE EXCEPTION 'Sem permissão para gerar pacote'; END IF;
  SELECT * INTO pacote FROM public.mkt_pacotes WHERE chave=(payload->>'chave')::uuid;
  IF FOUND THEN RETURN jsonb_build_object('id',pacote.id,'existente',true); END IF;
  SELECT * INTO pauta FROM public.mkt_itens WHERE id=(payload->>'pauta_id')::uuid AND tipo='pauta' FOR UPDATE;
  IF NOT FOUND OR pauta.status<>'aprovado' OR pauta.versao_aprovada IS DISTINCT FROM pauta.versao THEN RAISE EXCEPTION 'Selecione pauta com versão aprovada'; END IF;
  IF jsonb_array_length(payload->'materiais') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Selecione de 1 a 20 materiais'; END IF;
  INSERT INTO public.mkt_pacotes(pauta_id,nome,chave) VALUES(pauta.id,coalesce(nullif(payload->>'nome',''),pauta.titulo),(payload->>'chave')::uuid) RETURNING * INTO pacote;
  FOR mat IN SELECT jsonb_array_elements(payload->'materiais') LOOP
   destino:=CASE mat->>'formato' WHEN 'reels' THEN 'roteiro' WHEN 'blog_post' THEN 'artigo' ELSE 'conteudo' END;
   novo:=marketing_privado.operar('converter',jsonb_build_object('id',pauta.id,'tipo_destino',destino));
   novo:=marketing_privado.operar('salvar',novo||jsonb_build_object('titulo',pauta.titulo||' — '||coalesce(mat->>'nome',mat->>'formato'),'formato',mat->>'formato','responsavel_id',mat->>'responsavel_id','prazo',mat->>'prazo'));
   UPDATE public.mkt_itens SET pacote_id=pacote.id WHERE id=(novo->>'id')::uuid;
   resultado:=resultado||jsonb_build_array(novo);
  END LOOP;
  PERFORM marketing_privado.auditar('pacote',pacote.id,'gerar',NULL,payload); RETURN jsonb_build_object('id',pacote.id,'materiais',resultado);
 ELSE
  IF operacao='salvar' AND payload->>'tipo' IN ('pesquisa','concorrente') THEN RAISE EXCEPTION 'Pesquisa de concorrentes não integra esta versão'; END IF;
  IF operacao='salvar' AND payload->>'tipo'='rotina' AND lower(coalesce(payload->>'titulo','')) LIKE '%concorrente%' THEN RAISE EXCEPTION 'Rotinas de concorrência não integram esta versão'; END IF;
  RETURN marketing_privado.operar(operacao,payload);
 END IF;
END $$;
