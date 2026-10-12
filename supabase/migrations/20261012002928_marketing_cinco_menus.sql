-- Preserva operadores comerciais já autorizados, separando novos membros do departamento.
ALTER TABLE public.mkt_acessos ADD COLUMN comercial boolean NOT NULL DEFAULT false;
INSERT INTO public.mkt_acessos(user_id,comercial) SELECT DISTINCT user_id,true FROM public.user_permissions WHERE modulo='marketing' AND acao='visualizar' AND permitido ON CONFLICT(user_id) DO UPDATE SET comercial=true;
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid,_modulo public.modulo,_acao public.acao_permissao) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.is_gestor(_user_id) OR (EXISTS(SELECT 1 FROM public.user_permissions WHERE user_id=_user_id AND modulo=_modulo AND acao=_acao AND permitido)
 AND (_modulo<>'marketing' OR EXISTS(SELECT 1 FROM public.mkt_acessos WHERE user_id=_user_id AND comercial)
 OR EXISTS(SELECT 1 FROM public.user_permissions WHERE user_id=_user_id AND modulo='clientes' AND acao='visualizar' AND permitido)
 OR EXISTS(SELECT 1 FROM public.configuracoes_sistema WHERE secao='comercial' AND chave='responsavel_comunicacao_user_id' AND valor=_user_id::text)))
$$;
CREATE OR REPLACE FUNCTION marketing_privado.pode(acao text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.is_interno_ativo(auth.uid()) AND (public.is_gestor(auth.uid()) OR CASE WHEN acao IN ('aprovar','financeiro','gerenciar') THEN EXISTS(SELECT 1 FROM public.mkt_acessos a WHERE a.user_id=auth.uid() AND CASE acao WHEN 'aprovar' THEN a.aprovar WHEN 'financeiro' THEN a.financeiro ELSE a.gerenciar END)
 ELSE EXISTS(SELECT 1 FROM public.user_permissions p WHERE p.user_id=auth.uid() AND p.modulo='marketing' AND p.acao::text=$1 AND p.permitido) END)
$$;
CREATE OR REPLACE FUNCTION marketing_privado.comercial(acao text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.is_interno_ativo(auth.uid()) AND (public.is_gestor(auth.uid()) OR public.has_permission(auth.uid(),'clientes'::public.modulo,acao::public.acao_permissao) OR EXISTS(SELECT 1 FROM public.mkt_acessos a WHERE a.user_id=auth.uid() AND a.comercial AND EXISTS(SELECT 1 FROM public.user_permissions p WHERE p.user_id=a.user_id AND p.modulo='marketing' AND p.acao::text=$1 AND p.permitido)) OR EXISTS(SELECT 1 FROM public.configuracoes_sistema WHERE secao='comercial' AND chave='responsavel_comunicacao_user_id' AND valor=auth.uid()::text))
$$;

CREATE TABLE public.mkt_modelos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL CHECK(length(trim(nome)) BETWEEN 1 AND 250), tipo text NOT NULL CHECK(tipo IN ('conteudo','roteiro','artigo')),
 formato text, dados jsonb NOT NULL DEFAULT '{}', ativo boolean NOT NULL DEFAULT true, versao integer NOT NULL DEFAULT 1,
 criado_por uuid REFERENCES public.profiles(id) DEFAULT auth.uid(), criado_em timestamptz NOT NULL DEFAULT now(), atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.mkt_pacotes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pauta_id uuid NOT NULL REFERENCES public.mkt_itens(id), nome text NOT NULL,
 chave uuid NOT NULL UNIQUE, criado_por uuid REFERENCES public.profiles(id) DEFAULT auth.uid(), criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mkt_itens ADD COLUMN pacote_id uuid REFERENCES public.mkt_pacotes(id), ADD COLUMN modelo_id uuid REFERENCES public.mkt_modelos(id);
CREATE INDEX mkt_itens_pacote_idx ON public.mkt_itens(pacote_id);
ALTER TABLE public.mkt_modelos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_pacotes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mkt_modelos, public.mkt_pacotes FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.mkt_modelos, public.mkt_pacotes TO authenticated;
CREATE POLICY modelos_ler ON public.mkt_modelos FOR SELECT TO authenticated USING(marketing_privado.pode('visualizar'));
CREATE POLICY pacotes_ler ON public.mkt_pacotes FOR SELECT TO authenticated USING(marketing_privado.pode('visualizar'));
CREATE FUNCTION marketing_privado.estendido(operacao text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE modelo public.mkt_modelos; pauta public.mkt_itens; pacote public.mkt_pacotes; mat jsonb; novo jsonb; id_modelo uuid; resultado jsonb:='[]'; destino text;
BEGIN
 IF NOT public.is_interno_ativo(auth.uid()) THEN RAISE EXCEPTION 'Sessão ativa necessária'; END IF;
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
CREATE OR REPLACE FUNCTION public.mkt_operar(operacao text,payload jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT marketing_privado.estendido(operacao,payload) $$;
REVOKE ALL ON FUNCTION marketing_privado.estendido(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION marketing_privado.estendido(text,jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION marketing_privado.operar(text,jsonb) FROM authenticated;
DROP POLICY mkt_auditoria_ler ON public.mkt_auditoria;
CREATE POLICY mkt_auditoria_ler ON public.mkt_auditoria FOR SELECT TO authenticated USING(marketing_privado.pode('gerenciar') AND (entidade<>'financeiro' OR marketing_privado.pode('financeiro')) AND (entidade NOT IN ('demanda','lead') OR marketing_privado.comercial('visualizar')));
CREATE FUNCTION marketing_privado.demanda_historico(id_demanda uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.comercial_demandas;
BEGIN
 IF NOT marketing_privado.comercial('visualizar') THEN RAISE EXCEPTION 'Sem acesso comercial'; END IF;
 SELECT * INTO d FROM public.comercial_demandas WHERE id=id_demanda;
 IF NOT FOUND OR d.cliente_id IS NOT NULL AND NOT public.usuario_ve_cliente(auth.uid(),d.cliente_id) THEN RAISE EXCEPTION 'Demanda fora do seu escopo'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'quando',a.criado_em,'usuario',p.nome,'acao',a.acao,'situacao_anterior',a.antes->>'status','situacao_atual',a.depois->>'status','contratado_em',a.depois->>'contratado_em') ORDER BY a.id DESC),'[]') FROM public.mkt_auditoria a LEFT JOIN public.profiles p ON p.id=a.usuario_id WHERE a.entidade='demanda' AND a.entidade_id=id_demanda);
END $$;
CREATE FUNCTION public.mkt_demanda_historico(id_demanda uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT marketing_privado.demanda_historico(id_demanda) $$;
REVOKE ALL ON FUNCTION public.mkt_demanda_historico(uuid),marketing_privado.demanda_historico(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mkt_demanda_historico(uuid),marketing_privado.demanda_historico(uuid) TO authenticated;

CREATE FUNCTION marketing_privado.indicadores() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE gestor boolean; fonte jsonb;
BEGIN
 fonte:=marketing_privado.demanda(); gestor:=public.is_gestor(auth.uid());
 RETURN fonte||jsonb_build_object(
 'areas',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT a.nome,count(DISTINCT d.cliente_id) clientes,count(*) demandas,count(*) FILTER(WHERE d.status='contratado') contratacoes FROM public.juridico_areas a JOIN public.catalogo_servicos s ON s.area_id=a.id JOIN public.comercial_demandas d ON d.servico_id=s.id AND d.status<>'arquivado' GROUP BY a.id,a.nome HAVING gestor OR (count(DISTINCT d.cliente_id)>=5 AND count(*) FILTER(WHERE d.status='contratado')>=5 AND count(*) FILTER(WHERE d.status<>'contratado')>=5))x),
 'servicos_mensal',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT servico_id,to_char(aberto_em,'YYYY-MM') mes,count(*) demandas FROM public.comercial_demandas WHERE aberto_em<date_trunc('month',current_date)::date AND status<>'arquivado' GROUP BY servico_id,to_char(aberto_em,'YYYY-MM') HAVING gestor OR count(DISTINCT cliente_id)>=5)x));
END $$;
CREATE OR REPLACE FUNCTION public.mkt_demanda() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT marketing_privado.indicadores() $$;
REVOKE ALL ON FUNCTION marketing_privado.indicadores() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION marketing_privado.indicadores() TO authenticated;

-- Limita backlog por execução e cria lembretes de revisão de artigos publicados.
CREATE OR REPLACE FUNCTION marketing_privado.rotinas() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.mkt_itens; dia date; tarefa uuid; total integer:=0; gerados integer;
BEGIN
 FOR r IN SELECT * FROM public.mkt_itens WHERE tipo='rotina' AND arquivado_em IS NULL AND lower(titulo) NOT LIKE '%concorrente%' FOR UPDATE LOOP
  dia:=r.data_prevista::date; gerados:=0;
  IF dia IS NULL THEN CONTINUE; END IF;
  WHILE dia<=current_date AND gerados<31 LOOP
   IF NOT EXISTS(SELECT 1 FROM public.mkt_rotina_ocorrencias WHERE rotina_id=r.id AND data=dia) THEN
    tarefa:=gen_random_uuid(); INSERT INTO public.mkt_itens(id,tipo,titulo,descricao,responsavel_id,prioridade,prazo,origem_id,criado_por) VALUES(tarefa,'tarefa',r.titulo,r.descricao,r.responsavel_id,r.prioridade,dia::timestamptz+interval '23 hours',r.id,r.criado_por);
    INSERT INTO public.mkt_rotina_ocorrencias VALUES(r.id,dia,tarefa); total:=total+1;
    PERFORM marketing_privado.notificar(r.responsavel_id,'Nova tarefa recorrente',tarefa);
   END IF;
   gerados:=gerados+1; dia:=CASE r.dados->>'frequencia' WHEN 'diaria' THEN dia+1 WHEN 'semanal' THEN dia+7 ELSE (dia+interval '1 month')::date END;
  END LOOP;
  UPDATE public.mkt_itens SET data_prevista=dia::timestamptz WHERE id=r.id;
 END LOOP;
 FOR r IN SELECT * FROM public.mkt_itens WHERE arquivado_em IS NULL AND ((prazo<now() AND status NOT IN ('concluido','publicado','rejeitado','convertida','encerrada')) OR (tipo='artigo' AND status='publicado' AND nullif(dados->>'revisar_em','')::date<=current_date)) LOOP
  IF NOT EXISTS(SELECT 1 FROM public.notificacoes n WHERE n.user_id=r.responsavel_id AND n.tipo='marketing_atraso' AND n.link='/marketing?item='||r.id::text AND n.criado_em::date=current_date) THEN
   INSERT INTO public.notificacoes(user_id,tipo,titulo,descricao,link) SELECT r.responsavel_id,'marketing_atraso',CASE WHEN r.tipo='artigo' AND r.status='publicado' THEN 'Revisão jurídica do artigo prevista' ELSE 'Atividade de marketing atrasada' END,r.titulo,'/marketing?item='||r.id::text WHERE r.responsavel_id IS NOT NULL;
  END IF;
 END LOOP; RETURN total;
END $$;
-- Índices dos vínculos novos, incluindo referências usadas nas políticas de acesso.
DO $$ DECLARE fk record; col text; BEGIN
 FOR fk IN SELECT c.conrelid::regclass tabela,a.attname coluna FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1] WHERE c.contype='f' AND c.conrelid IN ('public.mkt_itens'::regclass,'public.mkt_modelos'::regclass,'public.mkt_pacotes'::regclass,'public.mkt_versoes'::regclass,'public.mkt_decisoes'::regclass,'public.mkt_comentarios'::regclass,'public.mkt_auditoria'::regclass,'public.mkt_rotina_ocorrencias'::regclass,'public.mkt_gravacao_itens'::regclass,'public.comercial_demandas'::regclass,'public.comercial_demanda_teses'::regclass,'public.juridico_teses'::regclass,'public.juridico_tese_servicos'::regclass) LOOP
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (%I)','mk_fk_'||replace(fk.tabela::text,'public.','')||'_'||fk.coluna,fk.tabela,fk.coluna);
 END LOOP;
END $$;
