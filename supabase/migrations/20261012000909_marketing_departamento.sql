-- Departamento de marketing. Migração aditiva; nenhum cadastro existente é removido.
CREATE SCHEMA IF NOT EXISTS marketing_privado;
REVOKE ALL ON SCHEMA marketing_privado FROM PUBLIC;
GRANT USAGE ON SCHEMA marketing_privado TO authenticated, service_role;

CREATE TABLE public.mkt_acessos (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id), aprovar boolean NOT NULL DEFAULT false,
 financeiro boolean NOT NULL DEFAULT false, gerenciar boolean NOT NULL DEFAULT false,
 atualizado_em timestamptz NOT NULL DEFAULT now(), atualizado_por uuid REFERENCES public.profiles(id)
);
CREATE FUNCTION marketing_privado.pode(acao text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.is_interno_ativo(auth.uid()) AND (
 public.is_gestor(auth.uid()) OR CASE
 WHEN acao IN ('aprovar','financeiro','gerenciar') THEN EXISTS (
 SELECT 1 FROM public.mkt_acessos a WHERE a.user_id=auth.uid() AND CASE acao WHEN 'aprovar' THEN a.aprovar WHEN 'financeiro' THEN a.financeiro ELSE a.gerenciar END)
 ELSE public.has_permission(auth.uid(),'marketing'::public.modulo,acao::public.acao_permissao) END)
$$;
CREATE FUNCTION marketing_privado.comercial(acao text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.is_interno_ativo(auth.uid()) AND (public.is_gestor(auth.uid()) OR (
 public.has_permission(auth.uid(),'clientes'::public.modulo,acao::public.acao_permissao)) OR EXISTS (
 SELECT 1 FROM public.configuracoes_sistema WHERE secao='comercial' AND chave='responsavel_comunicacao_user_id' AND valor=auth.uid()::text))
$$;

CREATE TABLE public.juridico_areas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL UNIQUE, descricao text, ativo boolean NOT NULL DEFAULT true);
INSERT INTO public.juridico_areas(nome) SELECT DISTINCT area FROM public.catalogo_servicos WHERE nullif(trim(area),'') IS NOT NULL ON CONFLICT DO NOTHING;
CREATE TABLE public.juridico_teses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL, descricao text, area_id uuid REFERENCES public.juridico_areas(id),
 servico_principal_id uuid REFERENCES public.catalogo_servicos(id), ativo boolean NOT NULL DEFAULT true,
 observacoes text, criado_em timestamptz NOT NULL DEFAULT now(), criado_por uuid REFERENCES public.profiles(id) DEFAULT auth.uid()
);
CREATE TABLE public.juridico_tese_servicos (tese_id uuid REFERENCES public.juridico_teses(id), servico_id uuid REFERENCES public.catalogo_servicos(id), PRIMARY KEY(tese_id,servico_id));
ALTER TABLE public.catalogo_servicos ADD COLUMN area_id uuid REFERENCES public.juridico_areas(id);
UPDATE public.catalogo_servicos s SET area_id=a.id FROM public.juridico_areas a WHERE a.nome=s.area;

-- Envelope de trabalho: campanhas/conteúdos mantêm IDs e tabelas originais.
CREATE TABLE public.mkt_itens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tipo text NOT NULL CHECK(tipo IN ('tarefa','rotina','concorrente','pesquisa','ideia','planejamento','pauta','conteudo','roteiro','artigo','gravacao','material','campanha')),
 titulo text NOT NULL CHECK(length(trim(titulo)) BETWEEN 1 AND 250), descricao text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'rascunho', prioridade text NOT NULL DEFAULT 'normal' CHECK(prioridade IN ('baixa','normal','alta','urgente')),
 responsavel_id uuid REFERENCES public.profiles(id), area_id uuid REFERENCES public.juridico_areas(id),
 servico_id uuid REFERENCES public.catalogo_servicos(id), tese_id uuid REFERENCES public.juridico_teses(id),
 origem_id uuid REFERENCES public.mkt_itens(id), campanha_id uuid REFERENCES public.mkt_campanhas(id),
 planejamento_id uuid REFERENCES public.mkt_itens(id), pauta_id uuid REFERENCES public.mkt_itens(id),
 canal text, formato text, prazo timestamptz, data_prevista timestamptz,
 dados jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(dados)='object'),
 versao integer NOT NULL DEFAULT 1, versao_aprovada integer, roteiro_aprovado integer,
 arquivado_em timestamptz, criado_por uuid REFERENCES public.profiles(id) DEFAULT auth.uid(),
 criado_em timestamptz NOT NULL DEFAULT now(), atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mkt_itens_rotina_idx ON public.mkt_itens(tipo,status,prazo) WHERE arquivado_em IS NULL;
CREATE INDEX mkt_itens_responsavel_idx ON public.mkt_itens(responsavel_id,prazo);
CREATE INDEX mkt_itens_origem_idx ON public.mkt_itens(origem_id);
CREATE INDEX mkt_itens_campanha_idx ON public.mkt_itens(campanha_id);
CREATE INDEX mkt_itens_planejamento_idx ON public.mkt_itens(planejamento_id);
CREATE TABLE public.mkt_versoes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), item_id uuid NOT NULL REFERENCES public.mkt_itens(id), versao integer NOT NULL,
 etapa text NOT NULL DEFAULT 'material', snapshot jsonb NOT NULL, criado_por uuid REFERENCES public.profiles(id), criado_em timestamptz NOT NULL DEFAULT now(), UNIQUE(item_id,versao)
);
CREATE TABLE public.mkt_decisoes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), item_id uuid NOT NULL REFERENCES public.mkt_itens(id), versao integer NOT NULL,
 etapa text NOT NULL, resultado text NOT NULL CHECK(resultado IN ('aprovado','rejeitado','ajustes')), justificativa text,
 usuario_id uuid REFERENCES public.profiles(id), criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mkt_decisoes_item_idx ON public.mkt_decisoes(item_id,versao);
CREATE TABLE public.mkt_comentarios (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), item_id uuid NOT NULL REFERENCES public.mkt_itens(id), texto text NOT NULL CHECK(length(trim(texto)) BETWEEN 1 AND 10000),
 usuario_id uuid REFERENCES public.profiles(id) NOT NULL DEFAULT auth.uid(), criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mkt_comentarios_item_idx ON public.mkt_comentarios(item_id,criado_em);
CREATE TABLE public.mkt_auditoria (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, item_id uuid REFERENCES public.mkt_itens(id), entidade text NOT NULL,
 entidade_id uuid, acao text NOT NULL, usuario_id uuid, antes jsonb, depois jsonb, criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mkt_auditoria_item_idx ON public.mkt_auditoria(item_id,criado_em);
CREATE TABLE public.mkt_campanha_financeiro (
 campanha_id uuid PRIMARY KEY REFERENCES public.mkt_campanhas(id), orcamento numeric NOT NULL DEFAULT 0 CHECK(orcamento>=0), gasto numeric NOT NULL DEFAULT 0 CHECK(gasto>=0)
);
CREATE TABLE public.mkt_rotina_ocorrencias (
 rotina_id uuid NOT NULL REFERENCES public.mkt_itens(id), data date NOT NULL, tarefa_id uuid NOT NULL REFERENCES public.mkt_itens(id), PRIMARY KEY(rotina_id,data)
);
CREATE TABLE public.mkt_gravacao_itens (
 sessao_id uuid NOT NULL REFERENCES public.mkt_itens(id), roteiro_id uuid NOT NULL REFERENCES public.mkt_itens(id), ordem integer NOT NULL,
 status text NOT NULL DEFAULT 'aguardando' CHECK(status IN ('aguardando','gravado','edicao')), PRIMARY KEY(sessao_id,roteiro_id)
);
CREATE TABLE public.comercial_demandas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cliente_id uuid REFERENCES public.clientes(id), lead_id uuid REFERENCES public.mkt_leads(id),
 servico_id uuid NOT NULL REFERENCES public.catalogo_servicos(id), status text NOT NULL DEFAULT 'oportunidade' CHECK(status IN ('oportunidade','negociacao','contratado','perdido','arquivado')),
 aberto_em date NOT NULL DEFAULT current_date, contratado_em date, origem text, campanha_id uuid REFERENCES public.mkt_campanhas(id),
 responsavel_id uuid REFERENCES public.profiles(id), contrato_id uuid REFERENCES public.honorarios_contratos(id), processo_id uuid REFERENCES public.processos(id),
 observacoes text, criado_por uuid REFERENCES public.profiles(id) DEFAULT auth.uid(), criado_em timestamptz NOT NULL DEFAULT now(),
 CHECK(cliente_id IS NOT NULL OR lead_id IS NOT NULL), CHECK(status<>'contratado' OR (cliente_id IS NOT NULL AND contratado_em IS NOT NULL))
);
CREATE INDEX comercial_demandas_cliente_idx ON public.comercial_demandas(cliente_id);
CREATE INDEX comercial_demandas_servico_idx ON public.comercial_demandas(servico_id,aberto_em);
CREATE INDEX comercial_demandas_campanha_idx ON public.comercial_demandas(campanha_id);
CREATE TABLE public.comercial_demanda_teses (demanda_id uuid REFERENCES public.comercial_demandas(id), tese_id uuid REFERENCES public.juridico_teses(id), PRIMARY KEY(demanda_id,tese_id));

-- Importação apenas de envelopes para registros existentes, sem duplicar cadastros.
INSERT INTO public.mkt_itens(id,tipo,titulo,descricao,status,canal,data_prevista,criado_por,criado_em)
 SELECT id,'campanha',nome,coalesce(objetivo,''),'rascunho',canal,data_inicio::timestamptz,criado_por,criado_em FROM public.mkt_campanhas;
INSERT INTO public.mkt_itens(id,tipo,titulo,descricao,status,canal,formato,data_prevista,responsavel_id,dados,criado_por,criado_em)
 SELECT id,'conteudo',titulo,coalesce(pauta,''),CASE WHEN status='publicado' THEN 'publicado' ELSE 'rascunho' END,canal,formato,data_planejada::timestamptz,responsavel_id,
 jsonb_build_object('legenda',legenda,'link_drive',link_material,'legado',true),criado_por,criado_em FROM public.mkt_conteudo;
INSERT INTO public.mkt_campanha_financeiro SELECT id,coalesce(orcamento_total,0),coalesce(gasto_realizado,0) FROM public.mkt_campanhas;

-- RLS: nenhuma escrita direta no fluxo, decisões ou auditoria.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['mkt_acessos','juridico_areas','juridico_teses','juridico_tese_servicos','mkt_itens','mkt_versoes','mkt_decisoes','mkt_comentarios','mkt_auditoria','mkt_campanha_financeiro','mkt_rotina_ocorrencias','mkt_gravacao_itens','comercial_demandas','comercial_demanda_teses'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated',t);
 EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
 END LOOP;
END $$;
CREATE POLICY mkt_acesso_proprio ON public.mkt_acessos FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.is_gestor(auth.uid()));
CREATE POLICY mkt_itens_ler ON public.mkt_itens FOR SELECT TO authenticated USING(marketing_privado.pode('visualizar'));
CREATE POLICY mkt_versoes_ler ON public.mkt_versoes FOR SELECT TO authenticated USING(marketing_privado.pode('visualizar'));
CREATE POLICY mkt_decisoes_ler ON public.mkt_decisoes FOR SELECT TO authenticated USING(marketing_privado.pode('visualizar'));
CREATE POLICY mkt_comentarios_ler ON public.mkt_comentarios FOR SELECT TO authenticated USING(marketing_privado.pode('visualizar'));
CREATE POLICY mkt_auditoria_ler ON public.mkt_auditoria FOR SELECT TO authenticated USING(marketing_privado.pode('gerenciar'));
CREATE POLICY mkt_financeiro_ler ON public.mkt_campanha_financeiro FOR SELECT TO authenticated USING(marketing_privado.pode('financeiro') AND marketing_privado.pode('visualizar'));
CREATE POLICY mkt_ocorrencias_ler ON public.mkt_rotina_ocorrencias FOR SELECT TO authenticated USING(marketing_privado.pode('visualizar'));
CREATE POLICY mkt_gravacao_ler ON public.mkt_gravacao_itens FOR SELECT TO authenticated USING(marketing_privado.pode('visualizar'));
CREATE POLICY areas_ler ON public.juridico_areas FOR SELECT TO authenticated USING(public.is_interno_ativo(auth.uid()));
CREATE POLICY teses_ler ON public.juridico_teses FOR SELECT TO authenticated USING(public.is_interno_ativo(auth.uid()));
CREATE POLICY tese_servicos_ler ON public.juridico_tese_servicos FOR SELECT TO authenticated USING(public.is_interno_ativo(auth.uid()));
CREATE POLICY demandas_ler ON public.comercial_demandas FOR SELECT TO authenticated USING(marketing_privado.comercial('visualizar') AND (cliente_id IS NULL OR public.usuario_ve_cliente(auth.uid(),cliente_id) OR public.is_gestor(auth.uid())));
CREATE POLICY demanda_teses_ler ON public.comercial_demanda_teses FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.comercial_demandas d WHERE d.id=demanda_id));

-- Marketing operacional não concede acesso a contatos comerciais nem a valores.
DROP POLICY mkt_leads_select ON public.mkt_leads;
DROP POLICY mkt_leads_insert ON public.mkt_leads;
DROP POLICY mkt_leads_update ON public.mkt_leads;
DROP POLICY mkt_leads_delete ON public.mkt_leads;
CREATE POLICY mkt_leads_select ON public.mkt_leads FOR SELECT TO authenticated USING(marketing_privado.comercial('visualizar'));
CREATE POLICY mkt_leads_insert ON public.mkt_leads FOR INSERT TO authenticated WITH CHECK(marketing_privado.comercial('criar'));
CREATE POLICY mkt_leads_update ON public.mkt_leads FOR UPDATE TO authenticated USING(marketing_privado.comercial('editar')) WITH CHECK(marketing_privado.comercial('editar'));
CREATE POLICY mkt_leads_delete ON public.mkt_leads FOR DELETE TO authenticated USING(public.is_gestor(auth.uid()));
DROP POLICY mkt_camp_select ON public.mkt_campanhas;
CREATE POLICY mkt_camp_select ON public.mkt_campanhas FOR SELECT TO authenticated USING(marketing_privado.pode('financeiro') AND marketing_privado.pode('visualizar'));
-- Leitura do catálogo de marketing ocorre por projeção RPC, sem valores/regras internas.
DROP POLICY catalogo_servicos_select_internos ON public.catalogo_servicos;
CREATE POLICY catalogo_servicos_select_internos ON public.catalogo_servicos FOR SELECT TO authenticated USING(public.is_interno_ativo(auth.uid()) AND (public.is_gestor(auth.uid()) OR public.has_permission(auth.uid(),'clientes'::public.modulo,'visualizar'::public.acao_permissao) OR public.has_permission(auth.uid(),'processos'::public.modulo,'visualizar'::public.acao_permissao)));

CREATE FUNCTION marketing_privado.link_valido(link text,drive boolean DEFAULT false) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT link IS NULL OR trim(link)='' OR (link ~ '^https://[^[:space:]]+$' AND (NOT drive OR link ~ '^https://(drive|docs)\.google\.com/'))
$$;
CREATE FUNCTION marketing_privado.auditar(entidade text,entidade_id uuid,acao text,antes jsonb,depois jsonb) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 INSERT INTO public.mkt_auditoria(entidade,entidade_id,item_id,acao,usuario_id,antes,depois) VALUES(entidade,entidade_id,CASE WHEN entidade='item' THEN entidade_id ELSE NULL END,acao,auth.uid(),antes,depois)
$$;
CREATE FUNCTION marketing_privado.notificar(destino uuid,titulo text,item uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 INSERT INTO public.notificacoes(user_id,tipo,titulo,descricao,link) SELECT destino,'marketing',titulo,'Confira a atividade no departamento de marketing.','/marketing?item='||item::text WHERE destino IS NOT NULL
$$;

CREATE FUNCTION marketing_privado.operar(operacao text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
  IF NOT marketing_privado.comercial('editar') THEN RAISE EXCEPTION 'Sem acesso comercial'; END IF;
  alvo:=nullif(payload->>'id','')::uuid;
  IF alvo IS NOT NULL THEN SELECT * INTO demanda FROM public.comercial_demandas WHERE id=alvo FOR UPDATE; IF NOT FOUND OR (demanda.cliente_id IS NOT NULL AND NOT public.usuario_ve_cliente(uid,demanda.cliente_id)) THEN RAISE EXCEPTION 'Demanda fora do seu escopo'; END IF; END IF;
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
  ON CONFLICT(id) DO UPDATE SET titulo=excluded.titulo,descricao=excluded.descricao,prioridade=excluded.prioridade,responsavel_id=excluded.responsavel_id,area_id=excluded.area_id,servico_id=excluded.servico_id,tese_id=excluded.tese_id,campanha_id=excluded.campanha_id,planejamento_id=excluded.planejamento_id,pauta_id=excluded.pauta_id,canal=excluded.canal,formato=excluded.formato,prazo=excluded.prazo,data_prevista=excluded.data_prevista,dados=excluded.dados,versao=public.mkt_itens.versao+1,versao_aprovada=NULL,status=CASE WHEN public.mkt_itens.status='rascunho' THEN 'rascunho' ELSE 'ajustes' END,atualizado_em=now()
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
  IF NOT ((i.status IN ('rascunho','ajustes') AND novo_status='producao') OR (i.status='producao' AND novo_status='revisao') OR (i.status='aprovado' AND novo_status='pronto') OR (i.tipo='roteiro' AND i.status='aguardando_gravacao' AND novo_status='gravado') OR (i.tipo='roteiro' AND i.status='gravado' AND novo_status='edicao') OR (i.tipo IN ('tarefa','pesquisa','gravacao') AND novo_status='concluido' AND i.status<>'arquivado')) THEN RAISE EXCEPTION 'Transição não permitida'; END IF;
  UPDATE public.mkt_itens SET status=novo_status,atualizado_em=now() WHERE id=alvo RETURNING * INTO i;
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
  INSERT INTO public.mkt_campanhas(id,nome,canal,objetivo,data_inicio,status,criado_por) VALUES(i.id,i.titulo,CASE WHEN i.canal IN ('meta_ads','google_ads','tiktok_ads','outro_pago') THEN i.canal ELSE 'outro_pago' END,coalesce(i.dados->>'objetivo_campanha','leads'),coalesce(i.data_prevista::date,current_date),'planejada',uid)
  ON CONFLICT(id) DO UPDATE SET nome=excluded.nome,objetivo=excluded.objetivo;
 ELSIF i.tipo IN ('conteudo','roteiro','artigo') THEN
  INSERT INTO public.mkt_conteudo(id,titulo,canal,formato,pauta,legenda,link_material,data_planejada,status,responsavel_id,criado_por)
  VALUES(i.id,i.titulo,coalesce(i.canal,'instagram'),CASE WHEN i.tipo='artigo' THEN 'blog_post' WHEN i.tipo='roteiro' THEN 'reels' ELSE coalesce(i.formato,'feed_foto') END,i.descricao,i.dados->>'legenda',i.dados->>'link_drive',i.data_prevista::date,CASE WHEN i.status='publicado' THEN 'publicado' WHEN i.status='aprovado' THEN 'aprovado' ELSE 'producao' END,i.responsavel_id,uid)
  ON CONFLICT(id) DO UPDATE SET titulo=excluded.titulo,pauta=excluded.pauta,legenda=excluded.legenda,link_material=excluded.link_material,data_planejada=excluded.data_planejada,status=excluded.status;
 END IF;
 PERFORM marketing_privado.auditar('item',i.id,operacao,anterior,to_jsonb(i)); RETURN to_jsonb(i);
END $$;

CREATE FUNCTION public.mkt_operar(operacao text,payload jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT marketing_privado.operar(operacao,payload) $$;

CREATE FUNCTION marketing_privado.contexto() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE comercial boolean; financeiro boolean;
BEGIN
 IF NOT marketing_privado.pode('visualizar') AND NOT marketing_privado.comercial('visualizar') THEN RAISE EXCEPTION 'Sem acesso'; END IF;
 comercial:=marketing_privado.comercial('visualizar'); financeiro:=marketing_privado.pode('financeiro');
 RETURN jsonb_build_object(
 'permissoes',jsonb_build_object('visualizar',marketing_privado.pode('visualizar'),'criar',marketing_privado.pode('criar'),'editar',marketing_privado.pode('editar'),'aprovar',marketing_privado.pode('aprovar'),'financeiro',financeiro,'gerenciar',marketing_privado.pode('gerenciar'),'exportar',marketing_privado.pode('exportar'),'comercial',comercial,'gestor',public.is_gestor(auth.uid())),
 'usuarios',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'nome',nome)),'[]') FROM public.profiles WHERE ativo AND coalesce(tipo_portal,'interno')='interno'),
 'areas',(SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]') FROM public.juridico_areas a),
 'teses',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM public.juridico_teses t),
 'tese_servicos',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM public.juridico_tese_servicos t),
 'servicos',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'nome',nome,'area_id',area_id,'area',area,'descricao',descricao,'status',status_homologacao)),'[]') FROM public.catalogo_servicos WHERE classificacao='servico_juridico'),
 'clientes',CASE WHEN comercial THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'nome',nome)),'[]') FROM public.clientes WHERE public.usuario_ve_cliente(auth.uid(),id)) ELSE '[]'::jsonb END,
 'leads',CASE WHEN comercial THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'nome',nome)),'[]') FROM public.mkt_leads) ELSE '[]'::jsonb END,
 'contratos',CASE WHEN comercial THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'cliente_id',cliente_id,'status',status)),'[]') FROM public.honorarios_contratos WHERE public.usuario_ve_cliente(auth.uid(),cliente_id)) ELSE '[]'::jsonb END,
 'acessos',CASE WHEN public.is_gestor(auth.uid()) THEN (SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]') FROM public.mkt_acessos a) ELSE '[]'::jsonb END);
END $$;
CREATE FUNCTION public.mkt_contexto() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT marketing_privado.contexto() $$;

-- Agregados em meses fechados; limiar fixo e supressão complementar impedem dedução de pequenos grupos.
CREATE FUNCTION marketing_privado.demanda() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE gestor boolean;
BEGIN
 IF NOT marketing_privado.pode('visualizar') THEN RAISE EXCEPTION 'Sem acesso'; END IF; gestor:=public.is_gestor(auth.uid());
 RETURN jsonb_build_object('limiar',CASE WHEN gestor THEN 0 ELSE 5 END,'servicos',(
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (
 SELECT s.id,s.nome,a.nome area,count(DISTINCT d.cliente_id) clientes,count(d.id) demandas,
 count(d.id) FILTER(WHERE d.status IN ('oportunidade','negociacao')) oportunidades,count(d.id) FILTER(WHERE d.status='contratado') contratacoes,
 round(100.0*count(d.id) FILTER(WHERE d.status='contratado')/nullif(count(d.id),0),1) conversao
 FROM public.catalogo_servicos s LEFT JOIN public.juridico_areas a ON a.id=s.area_id LEFT JOIN public.comercial_demandas d ON d.servico_id=s.id AND d.status<>'arquivado'
 WHERE s.classificacao='servico_juridico' GROUP BY s.id,s.nome,a.nome
 HAVING gestor OR (count(DISTINCT d.cliente_id)>=5 AND count(d.id) FILTER(WHERE d.status='contratado')>=5 AND count(d.id) FILTER(WHERE d.status IN ('oportunidade','negociacao'))>=5)
 ) x),
 'mensal',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (
 SELECT to_char(aberto_em,'YYYY-MM') mes,count(DISTINCT cliente_id) clientes,count(*) demandas,count(*) FILTER(WHERE status='contratado') contratacoes FROM public.comercial_demandas
 WHERE aberto_em<date_trunc('month',current_date)::date AND status<>'arquivado' GROUP BY to_char(aberto_em,'YYYY-MM') HAVING gestor OR (count(DISTINCT cliente_id)>=5 AND count(*) FILTER(WHERE status='contratado')>=5 AND count(*) FILTER(WHERE status<>'contratado')>=5))x),
 'teses',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT t.nome,count(*) demandas FROM public.juridico_teses t JOIN public.comercial_demanda_teses dt ON dt.tese_id=t.id JOIN public.comercial_demandas d ON d.id=dt.demanda_id GROUP BY t.id,t.nome HAVING gestor OR count(DISTINCT d.cliente_id)>=5)x),
 'origens',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT coalesce(origem,'Não informada') origem,count(*) demandas FROM public.comercial_demandas GROUP BY origem HAVING gestor OR count(DISTINCT cliente_id)>=5)x),
 'campanhas',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT c.nome,count(*) demandas,count(*) FILTER(WHERE d.status='contratado') contratacoes FROM public.comercial_demandas d JOIN public.mkt_campanhas c ON c.id=d.campanha_id GROUP BY c.id,c.nome HAVING gestor OR (count(DISTINCT d.cliente_id)>=5 AND count(*) FILTER(WHERE d.status='contratado')>=5 AND count(*) FILTER(WHERE d.status<>'contratado')>=5))x),
 'resumo',CASE WHEN gestor THEN (SELECT jsonb_build_object('clientes',count(DISTINCT cliente_id),'demandas',count(*),'contratacoes',count(*) FILTER(WHERE status='contratado'),'media_servicos',round(count(*)::numeric/nullif(count(DISTINCT cliente_id),0),2),'adicionais',count(*) FILTER(WHERE status='contratado')-count(DISTINCT cliente_id) FILTER(WHERE status='contratado')) FROM public.comercial_demandas) ELSE NULL END);
END $$;
CREATE FUNCTION public.mkt_demanda() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT marketing_privado.demanda() $$;

CREATE FUNCTION marketing_privado.rotinas() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.mkt_itens; dia date; tarefa uuid; total integer:=0;
BEGIN
 FOR r IN SELECT * FROM public.mkt_itens WHERE tipo='rotina' AND arquivado_em IS NULL LOOP
  dia:=r.data_prevista::date;
  WHILE dia<=current_date LOOP
   IF NOT EXISTS(SELECT 1 FROM public.mkt_rotina_ocorrencias WHERE rotina_id=r.id AND data=dia) THEN
    tarefa:=gen_random_uuid(); INSERT INTO public.mkt_itens(id,tipo,titulo,descricao,responsavel_id,prioridade,prazo,origem_id,criado_por)
    VALUES(tarefa,'tarefa',r.titulo,r.descricao,r.responsavel_id,r.prioridade,dia::timestamptz+interval '23 hours',r.id,r.criado_por);
    INSERT INTO public.mkt_rotina_ocorrencias VALUES(r.id,dia,tarefa); total:=total+1;
    PERFORM marketing_privado.notificar(r.responsavel_id,'Nova tarefa recorrente',tarefa);
   END IF;
   dia:=CASE r.dados->>'frequencia' WHEN 'diaria' THEN dia+1 WHEN 'semanal' THEN dia+7 ELSE (dia+interval '1 month')::date END;
  END LOOP;
  UPDATE public.mkt_itens SET data_prevista=dia::timestamptz WHERE id=r.id;
 END LOOP;
 FOR r IN SELECT * FROM public.mkt_itens WHERE arquivado_em IS NULL AND prazo<now() AND status NOT IN ('concluido','publicado','rejeitado') LOOP
  IF NOT EXISTS(SELECT 1 FROM public.notificacoes n WHERE n.user_id=r.responsavel_id AND n.tipo='marketing_atraso' AND n.link='/marketing?item='||r.id::text AND n.criado_em::date=current_date) THEN
   INSERT INTO public.notificacoes(user_id,tipo,titulo,descricao,link) SELECT r.responsavel_id,'marketing_atraso','Atividade de marketing atrasada',r.titulo,'/marketing?item='||r.id::text WHERE r.responsavel_id IS NOT NULL;
  END IF;
 END LOOP; RETURN total;
END $$;
SELECT cron.schedule('marketing-rotinas','15 10 * * *','select marketing_privado.rotinas();');

-- Impede aprovação por escrita nas tabelas legadas.
CREATE FUNCTION marketing_privado.legado_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF current_user='authenticated' OR current_setting('role',true)='authenticated' THEN
  IF NOT EXISTS(SELECT 1 FROM public.mkt_itens WHERE id=NEW.id) THEN RAISE EXCEPTION 'Utilize o fluxo do departamento de marketing'; END IF;
  IF TG_TABLE_NAME='mkt_conteudo' AND NEW.status IN ('aprovado','publicado') AND NOT EXISTS(SELECT 1 FROM public.mkt_itens WHERE id=NEW.id AND versao_aprovada=versao) THEN RAISE EXCEPTION 'Aprovação final necessária'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER mkt_conteudo_aprovacao BEFORE INSERT OR UPDATE ON public.mkt_conteudo FOR EACH ROW EXECUTE FUNCTION marketing_privado.legado_guard();
-- Somente a RPC escreve tabelas originais; consultas antigas autorizadas continuam funcionando.
REVOKE INSERT, UPDATE, DELETE ON public.mkt_conteudo, public.mkt_campanhas FROM authenticated;
-- Converte clientes apenas no comercial; mantém assinatura existente e permite reutilizar cadastro.
CREATE FUNCTION marketing_privado.converter_lead(lead uuid,cliente uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE l public.mkt_leads; c uuid;
BEGIN
 IF NOT marketing_privado.comercial('editar') THEN RAISE EXCEPTION 'Sem acesso comercial'; END IF;
 SELECT * INTO l FROM public.mkt_leads WHERE id=lead FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Lead inexistente'; END IF;
 IF l.cliente_id IS NOT NULL THEN RETURN l.cliente_id; END IF;
 c:=cliente;
 IF c IS NOT NULL AND NOT public.usuario_ve_cliente(auth.uid(),c) THEN RAISE EXCEPTION 'Cliente fora do escopo'; END IF;
 IF c IS NULL AND (l.email IS NOT NULL OR l.whatsapp_normalizado IS NOT NULL) THEN
  SELECT id INTO c FROM public.clientes WHERE (l.email IS NOT NULL AND lower(email)=lower(l.email)) OR (l.whatsapp_normalizado IS NOT NULL AND regexp_replace(coalesce(whatsapp,''),'\D','','g')=l.whatsapp_normalizado) LIMIT 1;
  IF c IS NOT NULL THEN RAISE EXCEPTION 'Existe cadastro semelhante; confirme o vínculo ao cliente existente'; END IF;
 END IF;
 IF c IS NULL THEN INSERT INTO public.clientes(nome,whatsapp,email,cidade,estado,status,ativo,criado_por,origem) VALUES(l.nome,l.whatsapp,l.email,l.cidade,l.estado,'ativo',true,auth.uid(),'marketing') RETURNING id INTO c; END IF;
 UPDATE public.mkt_leads SET cliente_id=c,status='convertido',data_conversao=current_date WHERE id=lead;
 UPDATE public.comercial_demandas SET cliente_id=c WHERE lead_id=lead;
 PERFORM marketing_privado.auditar('lead',lead,'converter',NULL,jsonb_build_object('cliente_id',c)); RETURN c;
END $$;
CREATE FUNCTION public.mkt_converter_lead(lead uuid,cliente uuid DEFAULT NULL) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT marketing_privado.converter_lead(lead,cliente) $$;
CREATE OR REPLACE FUNCTION public.converter_lead_em_cliente(_lead_id uuid,_valor_contrato numeric DEFAULT NULL,_advogado_responsavel uuid DEFAULT NULL) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT marketing_privado.converter_lead(_lead_id,NULL) $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA marketing_privado FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION marketing_privado.pode(text),marketing_privado.comercial(text),marketing_privado.operar(text,jsonb),marketing_privado.contexto(),marketing_privado.demanda(),marketing_privado.converter_lead(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.mkt_operar(text,jsonb),public.mkt_contexto(),public.mkt_demanda(),public.mkt_converter_lead(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mkt_operar(text,jsonb),public.mkt_contexto(),public.mkt_demanda(),public.mkt_converter_lead(uuid,uuid) TO authenticated;
