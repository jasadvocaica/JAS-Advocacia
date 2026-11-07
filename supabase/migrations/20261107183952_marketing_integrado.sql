-- JAS é um escritório por projeto. O escopo é fixado no servidor, nunca aceito do navegador/webhook.
-- Cache existente preservado. Nenhuma coleta, anúncio, mensagem ou rotina é ativada nesta migration.
alter table public.mkt_leads add column if not exists integracao_teste boolean not null default false;
create table marketing_privado.lead_origens (
 escritorio text not null default 'jas' check (escritorio='jas'), provedor text not null,
 externo_id text not null, conta_id text not null, pagina_id text, formulario_id text,
 campanha_externa_id text, conjunto_externo_id text, anuncio_externo_id text,
 lead_id uuid not null references public.mkt_leads(id) on delete cascade, adquirido_em timestamptz not null,
 teste boolean not null default false, criado_em timestamptz not null default now(),
 primary key(escritorio,provedor,conta_id,externo_id), unique(lead_id)
);
create table marketing_privado.direct_vinculos (
 conta_id text not null, conversa_id text not null, lead_id uuid not null references public.mkt_leads(id) on delete cascade,
 confirmado_por uuid not null, confirmado_em timestamptz not null default now(), primary key(conta_id,conversa_id)
);
alter table marketing_privado.direct_vinculos enable row level security;
revoke all on marketing_privado.direct_vinculos from public,anon,authenticated;
grant all on marketing_privado.direct_vinculos to service_role;
create table marketing_privado.lead_eventos (
 evento_id text primary key, lead_id uuid references public.mkt_leads(id) on delete set null,
 conta_id text not null, recebido_em timestamptz not null default now()
);
-- Permissão verificada por Página/formulário; não basta haver uma conexão de anúncios.
create table marketing_privado.lead_formularios (
 conta_id text not null references marketing_privado.zernio_contas(externo_id), pagina_id text not null,
 formulario_id text not null, escopos_conferidos boolean not null default false,
 privacidade_conferida boolean not null default false, termos_conferidos boolean not null default false,
 ativo boolean not null default false, somente_teste boolean not null default true,
 conferido_por uuid, conferido_em timestamptz,
 primary key(conta_id,formulario_id)
);
alter table public.mkt_campanhas add column if not exists conta_externa_id text;
alter table public.mkt_campanhas add column if not exists campanha_externa_id text;
create unique index mkt_campanha_vinculo_externo on public.mkt_campanhas(conta_externa_id,campanha_externa_id)
 where campanha_externa_id is not null;
create table marketing_privado.campanha_rascunhos (
 campanha_id uuid primary key references public.mkt_campanhas(id), versao integer not null default 1,
 dados jsonb not null, aprovacao_id uuid references escritorio_privado.aprovacoes(id),
 estado text not null default 'rascunho' check(estado in ('rascunho','aguardando_aprovacao','simulada','incerta')),
 atualizado_por uuid, atualizado_em timestamptz not null default now()
);
alter table marketing_privado.lead_origens enable row level security;
alter table marketing_privado.lead_eventos enable row level security;
alter table marketing_privado.lead_formularios enable row level security;
alter table marketing_privado.campanha_rascunhos enable row level security;
revoke all on marketing_privado.lead_origens,marketing_privado.lead_eventos,marketing_privado.lead_formularios,marketing_privado.campanha_rascunhos from public,anon,authenticated;
grant all on marketing_privado.lead_origens,marketing_privado.lead_eventos,marketing_privado.lead_formularios,marketing_privado.campanha_rascunhos to service_role;

-- Ingestão atômica. Eventos diferentes do mesmo lead também convergem para a mesma origem.
create function public.mkt_receber_lead(_dados jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare alvo uuid; cfg marketing_privado.lead_formularios; camp uuid;
begin
 if current_user<>'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
 if coalesce(_dados->>'evento_id','')='' or coalesce(_dados->>'externo_id','')='' or coalesce(_dados->>'nome','')='' then raise exception 'Evento incompleto'; end if;
 select * into cfg from marketing_privado.lead_formularios where conta_id=_dados->>'conta_id' and formulario_id=_dados->>'formulario_id';
 if not found or not cfg.ativo or not cfg.escopos_conferidos or not cfg.privacidade_conferida or not cfg.termos_conferidos
 or (cfg.somente_teste and not coalesce((_dados->>'teste')::boolean,false))
 or not exists(select 1 from marketing_privado.zernio_contas where externo_id=cfg.conta_id and selecionada and ativa and not precisa_reconectar)
 then raise exception 'Página/formulário não homologado para esta conta' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('jas:evento:'||(_dados->>'evento_id'),0));
 perform pg_advisory_xact_lock(hashtextextended('jas:zernio:'||cfg.conta_id||':'||(_dados->>'externo_id'),0));
 select lead_id into alvo from marketing_privado.lead_eventos where evento_id=_dados->>'evento_id';
 if found then
  if not exists(select 1 from marketing_privado.lead_eventos where evento_id=_dados->>'evento_id' and conta_id=cfg.conta_id) then raise exception 'Identidade de evento divergente'; end if;
  return alvo;
 end if;
 select lead_id into alvo from marketing_privado.lead_origens where escritorio='jas' and provedor='zernio' and conta_id=cfg.conta_id and externo_id=_dados->>'externo_id';
 if alvo is null then
  select id into camp from public.mkt_campanhas where conta_externa_id=cfg.conta_id and campanha_externa_id=_dados->>'campanha_externa_id';
  insert into public.mkt_leads(nome,whatsapp,email,canal,campanha_id,criado_em,integracao_teste)
   values(left(_dados->>'nome',200),nullif(left(_dados->>'telefone',40),''),nullif(left(_dados->>'email',254),''),
    case when coalesce((_dados->>'organico')::boolean,false) then 'outro' else 'meta_ads' end,camp,(_dados->>'adquirido_em')::timestamptz,coalesce((_dados->>'teste')::boolean,false)) returning id into alvo;
  insert into marketing_privado.lead_origens(provedor,externo_id,conta_id,pagina_id,formulario_id,campanha_externa_id,conjunto_externo_id,anuncio_externo_id,lead_id,adquirido_em,teste)
   values('zernio',_dados->>'externo_id',cfg.conta_id,cfg.pagina_id,cfg.formulario_id,_dados->>'campanha_externa_id',_dados->>'conjunto_externo_id',_dados->>'anuncio_externo_id',alvo,(_dados->>'adquirido_em')::timestamptz,coalesce((_dados->>'teste')::boolean,false));
 end if;
 insert into marketing_privado.lead_eventos(evento_id,lead_id,conta_id) values(_dados->>'evento_id',alvo,cfg.conta_id) on conflict do nothing;
 return alvo;
end $$;
revoke all on function public.mkt_receber_lead(jsonb) from public,anon,authenticated;
grant execute on function public.mkt_receber_lead(jsonb) to service_role;

create function marketing_privado.integrado(_acao text,_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
<<filtro>>
declare de date; ate date; conta text:=nullif(_payload->>'conta',''); campanha text:=nullif(_payload->>'campanha','');
 canal text:=nullif(_payload->>'canal',''); teste boolean:=coalesce((_payload->>'teste')::boolean,false);
 alvo uuid; c marketing_privado.zernio_conversas; r marketing_privado.campanha_rascunhos; dados jsonb; p jsonb;
 aprov uuid; v integer; resumo jsonb; crm jsonb; usuario uuid:=auth.uid();
begin
 if usuario is null or not public.is_interno_ativo(usuario) then raise exception 'Sessão interna ativa necessária' using errcode='42501'; end if;
 if _acao in ('formularios','formulario_salvar') then
  if not public.is_gestor(usuario) then raise exception 'Somente a gestora configura formulários' using errcode='42501'; end if;
  if _acao='formularios' then return (select coalesce(jsonb_agg(to_jsonb(f)),'[]') from marketing_privado.lead_formularios f); end if;
  if coalesce(_payload->>'conta_id','')='' or coalesce(_payload->>'pagina_id','')='' or coalesce(_payload->>'formulario_id','')='' then raise exception 'Conta, Página e formulário obrigatórios'; end if;
  if not exists(select 1 from marketing_privado.zernio_contas where externo_id=_payload->>'conta_id' and ativa and selecionada and not precisa_reconectar) then raise exception 'Conta não conectada'; end if;
  insert into marketing_privado.lead_formularios(conta_id,pagina_id,formulario_id,escopos_conferidos,privacidade_conferida,termos_conferidos,ativo,somente_teste,conferido_por,conferido_em)
  values(_payload->>'conta_id',_payload->>'pagina_id',_payload->>'formulario_id',coalesce((_payload->>'escopos_conferidos')::boolean,false),coalesce((_payload->>'privacidade_conferida')::boolean,false),coalesce((_payload->>'termos_conferidos')::boolean,false),coalesce((_payload->>'ativo')::boolean,false),true,usuario,now())
  on conflict(conta_id,formulario_id) do update set pagina_id=excluded.pagina_id,escopos_conferidos=excluded.escopos_conferidos,privacidade_conferida=excluded.privacidade_conferida,termos_conferidos=excluded.termos_conferidos,ativo=excluded.ativo,somente_teste=true,conferido_por=usuario,conferido_em=now();
  return jsonb_build_object('ok',true,'ambiente','somente_teste');
 end if;
 if _acao='agentes' then
  if not marketing_privado.pode('visualizar') then raise exception 'Sem permissão de Marketing' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'nome',a.nome,'slug',a.slug,'ativo',a.ativo,'executor',a.executor,
   'ferramentas',(select coalesce(jsonb_agg(f.ferramenta),'[]') from escritorio_privado.agente_ferramentas f where f.agente_id=a.id))),'[]') from public.agentes_ia a
   where lower(split_part(a.nome,' ',1)) in ('nina','bela','bia','theo','alex'));
 end if;
 if _acao='editorial_submeter' then
  if not marketing_privado.pode('editar') then raise exception 'Sem permissão de edição'; end if;
  select to_jsonb(i) into dados from public.mkt_itens i where i.id=(_payload->>'id')::uuid for update;
  if dados is null or dados->>'status' not in ('aprovado','pronto') or (dados->>'versao')::integer is distinct from (_payload->>'versao')::integer or dados->>'versao_aprovada' is distinct from dados->>'versao' then raise exception 'Aprovação editorial da versão atual necessária'; end if;
  if nullif(trim(_payload->>'conta_id'),'') is null then raise exception 'Informe a conta de destino'; end if;
  p:=jsonb_build_object('item_id',dados->>'id','versao',dados->'versao','conta_id',_payload->>'conta_id','texto',coalesce(dados->'dados'->>'legenda',dados->>'descricao'), 'ambiente','simulacao','acao','publicar');
  insert into escritorio_privado.aprovacoes(tipo,origem,solicitada_por,ferramenta,modulo,parametros,escopo_hash,resumo,riscos,chave)
   values('acao','sistema',usuario,'mkt_editorial_simular','marketing',p,escritorio_privado.escopo_hash('mkt_editorial_simular',p),
    'Simular publicação: '||left(dados->>'titulo',150),'SIMULAÇÃO sem envio. Autorização de publicação separada da aprovação editorial.', 'mkt-editorial:'||(dados->>'id')||':'||(dados->>'versao')||':'||(_payload->>'conta_id'))
   on conflict(chave) do update set chave=excluded.chave returning id into aprov;
  return jsonb_build_object('aprovacao_id',aprov);
 end if;
 if _acao='resultados' then
  if not marketing_privado.pode('visualizar') then raise exception 'Sem permissão de Marketing' using errcode='42501'; end if;
  de:=(_payload->>'de')::date; ate:=(_payload->>'ate')::date;
  if de is null or ate is null or ate<de or ate-de>365 then raise exception 'Período inválido (máximo 366 dias)'; end if;
  if conta is not null and not exists(select 1 from marketing_privado.zernio_contas where externo_id=conta and selecionada) then raise exception 'Conta indisponível'; end if;
  -- CRM: somente contagens para quem já pode ver o Comercial, nunca contato ou documento.
  if marketing_privado.comercial('visualizar') then
   with coorte as (
    select l.id,l.campanha_id,coalesce(ca.nome,'Sem atribuição') nome,l.status,
     exists(select 1 from public.clientes cl join public.comercial_contratacoes ct on ct.cliente_id=cl.id
      where cl.lead_origem_id=l.id and ct.status='formalizado' and ct.formalizado_em<=now()) contratado
    from public.mkt_leads l left join marketing_privado.lead_origens o on o.lead_id=l.id
    left join public.mkt_campanhas ca on ca.id=l.campanha_id
    where coalesce(o.adquirido_em,l.criado_em)>=de::timestamp at time zone 'America/Cuiaba'
    and coalesce(o.adquirido_em,l.criado_em)<(ate+1)::timestamp at time zone 'America/Cuiaba'
    and coalesce(o.teste,false)=filtro.teste and (conta is null or o.conta_id=conta)
    and (campanha is null or ca.campanha_externa_id=campanha)
    and (filtro.canal is null or l.canal=filtro.canal)
   ) select jsonb_build_object('leads',count(*),'qualificados',count(*) filter(where status in ('em_atendimento','proposta_enviada','convertido')),
    'contratos',count(*) filter(where contratado),'sem_atribuicao',count(*) filter(where campanha_id is null),
    'campanhas',(select coalesce(jsonb_agg(x),'[]') from (select campanha_id,nome,count(*) leads,count(*) filter(where contratado) contratos from coorte group by campanha_id,nome) x)) into crm from coorte;
  end if;
  return jsonb_build_object(
   'conexao',(select jsonb_build_object('estado',estado,'ultima_sync_ok_em',ultima_sync_ok_em,'addon_ads',addon_ads,'intervalo_minutos',intervalo_minutos) from marketing_privado.zernio_conexoes),
   'contas',(select coalesce(jsonb_agg(jsonb_build_object('externo_id',externo_id,'nome',coalesce(nome,usuario,externo_id),'plataforma',plataforma,'precisa_reconectar',precisa_reconectar)),'[]') from marketing_privado.zernio_contas where selecionada),
   'job_ativo',(select to_jsonb(j)-'cursores' from marketing_privado.zernio_sync_jobs j where estado in ('pendente','executando') limit 1),
   'ultima_rodada',(select jsonb_build_object('estado',estado,'finalizado_em',finalizado_em) from marketing_privado.zernio_sync_jobs order by criado_em desc limit 1),
   'parcial',coalesce((select estado in ('parcial','falhou') from marketing_privado.zernio_sync_jobs order by criado_em desc limit 1),false),
   'diario',(select coalesce(jsonb_agg(to_jsonb(m)-'extras'),'[]') from marketing_privado.zernio_anuncio_metricas m where nivel='conta' and data between de and ate and (conta is null or referencia=conta) and campanha is null and (filtro.canal is null or filtro.canal='meta_ads')),
   'campanhas',(select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('campanha_interna_id',(select id from public.mkt_campanhas ci where ci.conta_externa_id=x.conta_externa_id and ci.campanha_externa_id=x.externo_id))),'[]') from marketing_privado.zernio_campanhas x where (conta is null or conta_externa_id=conta) and (campanha is null or externo_id=campanha)),
   'conjuntos',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from marketing_privado.zernio_conjuntos s join marketing_privado.zernio_campanhas x on x.externo_id=s.campanha_externa_id where (conta is null or x.conta_externa_id=conta) and (campanha is null or x.externo_id=campanha)),
   'anuncios',(select coalesce(jsonb_agg(to_jsonb(a)-'criativo'),'[]') from marketing_privado.zernio_anuncios a join marketing_privado.zernio_campanhas x on x.externo_id=a.campanha_externa_id where (conta is null or x.conta_externa_id=conta) and (campanha is null or x.externo_id=campanha)),
   'publicacoes',(select coalesce(jsonb_agg(jsonb_build_object('id',x.externo_id,'conteudo',left(x.conteudo,300),'url',x.url,'publicado_em',x.publicado_em,'metricas',(select to_jsonb(m)-'post_id' from marketing_privado.zernio_post_metricas m where m.post_id=x.id order by data desc limit 1))),'[]')
    from marketing_privado.zernio_posts x where x.plataforma='instagram' and x.publicado_em>=de::timestamp at time zone 'America/Cuiaba' and x.publicado_em<(ate+1)::timestamp at time zone 'America/Cuiaba' and (conta is null or x.conta_externa_id=conta) and campanha is null and (filtro.canal is null or filtro.canal='instagram_organico')),
   'crm',crm,'apurado_em',now());
 end if;
 if _acao in ('triagem','triagem_confirmar') then
  if not marketing_privado.comercial(case when _acao='triagem' then 'visualizar' else 'criar' end) then raise exception 'Sem permissão do CRM' using errcode='42501'; end if;
  if _acao='triagem' then
   return (select coalesce(jsonb_agg(jsonb_build_object('id',s.externo_id,'conta_id',s.conta_externa_id,'nome',s.participante_nome,'mensagem',s.ultima_mensagem,'quando',s.atualizado_plataforma,
    'lead_id',o.lead_id,'possiveis_duplicados',(select count(*) from public.mkt_leads l where lower(l.nome)=lower(s.participante_nome)))),'[]') from (select * from marketing_privado.zernio_conversas where plataforma='instagram' order by atualizado_plataforma desc nulls last,externo_id limit 50 offset least(greatest(coalesce((_payload->>'offset')::integer,0),0),100000)) s left join marketing_privado.direct_vinculos o on o.conta_id=s.conta_externa_id and o.conversa_id=s.externo_id);
  end if;
  select * into c from marketing_privado.zernio_conversas where externo_id=_payload->>'conversa' for update;
  if not found or c.plataforma<>'instagram' then raise exception 'Conversa indisponível'; end if;
  if not coalesce((_payload->>'revisado')::boolean,false) or not coalesce(public.is_interno_ativo((_payload->>'responsavel_id')::uuid),false) then raise exception 'Confirme revisão e responsável ativo'; end if;
  select lead_id into alvo from marketing_privado.direct_vinculos where conta_id=c.conta_externa_id and conversa_id=c.externo_id;
  if alvo is not null then return jsonb_build_object('lead_id',alvo); end if;
  if nullif(_payload->>'lead_id','') is not null then
   alvo:=(_payload->>'lead_id')::uuid;
   if not marketing_privado.comercial('editar') or not exists(select 1 from public.mkt_leads where id=alvo) then raise exception 'Lead indisponível'; end if;
  else
   if nullif(trim(_payload->>'nome'),'') is null then raise exception 'Informe o nome confirmado'; end if;
   insert into public.mkt_leads(nome,canal,responsavel_id,registrado_por) values(left(_payload->>'nome',200),'outro',(_payload->>'responsavel_id')::uuid,usuario) returning id into alvo;
  end if;
  insert into marketing_privado.lead_origens(provedor,externo_id,conta_id,lead_id,adquirido_em) values('direct',c.externo_id,c.conta_externa_id,alvo,coalesce(c.atualizado_plataforma,now())) on conflict(lead_id) do nothing;
  insert into marketing_privado.direct_vinculos(conta_id,conversa_id,lead_id,confirmado_por) values(c.conta_externa_id,c.externo_id,alvo,usuario);
  perform marketing_privado.auditar('lead',alvo,'direct_confirmado',null,jsonb_build_object('conversa',c.externo_id,'responsavel',_payload->>'responsavel_id'));
  return jsonb_build_object('lead_id',alvo);
 end if;
 if _acao='importar_campanha' then
  if not marketing_privado.comercial('criar') then raise exception 'Sem permissão comercial' using errcode='42501'; end if;
  perform 1 from marketing_privado.zernio_campanhas where conta_externa_id=_payload->>'conta_id' and externo_id=_payload->>'externo_id' for update;
  if not found then raise exception 'Campanha não encontrada no cache'; end if;
  insert into public.mkt_campanhas(nome,canal,status,data_inicio,objetivo,conta_externa_id,campanha_externa_id,criado_por)
   select coalesce(nome,externo_id),'meta_ads','planejada',coalesce(periodo_de,current_date),'leads',conta_externa_id,externo_id,usuario from marketing_privado.zernio_campanhas where conta_externa_id=_payload->>'conta_id' and externo_id=_payload->>'externo_id'
   on conflict(conta_externa_id,campanha_externa_id) where campanha_externa_id is not null do update set campanha_externa_id=excluded.campanha_externa_id returning id into alvo;
  -- Não sobrescreve atribuições humanas. Vínculo tardio apenas enquanto nenhuma campanha foi atribuída.
  update public.mkt_leads l set campanha_id=alvo from marketing_privado.lead_origens o where o.lead_id=l.id and l.campanha_id is null and o.conta_id=_payload->>'conta_id' and o.campanha_externa_id=_payload->>'externo_id';
  return jsonb_build_object('campanha_id',alvo);
 end if;
 if _acao='campanhas' then
  if not marketing_privado.comercial('visualizar') then raise exception 'Sem permissão comercial' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'nome',c.nome,'dados',r.dados,'versao',r.versao,'estado',r.estado,'aprovacao_estado',a.estado)),'[]') from marketing_privado.campanha_rascunhos r join public.mkt_campanhas c on c.id=r.campanha_id left join escritorio_privado.aprovacoes a on a.id=r.aprovacao_id);
 end if;
 if _acao in ('campanha_salvar','campanha_submeter') then
  if not marketing_privado.comercial('editar') then raise exception 'Sem permissão comercial' using errcode='42501'; end if;
  alvo:=nullif(_payload->>'id','')::uuid;
  if alvo is not null then select * into r from marketing_privado.campanha_rascunhos where campanha_id=alvo for update;
   if not found or r.versao is distinct from (_payload->>'versao')::integer then raise exception 'Versão mudou; reabra o rascunho' using errcode='40001'; end if;
  end if;
  if _acao='campanha_salvar' then
   dados:=_payload->'dados';
   if exists(select 1 from jsonb_object_keys(dados) k where k not in ('nome','conta_id','pagina_id','objetivo','conjunto','publico','localizacao','posicionamentos','destino','orcamento','moeda','inicio','fim','midia_url','texto','revisao_etica','revisao_privacidade')) then raise exception 'Campo de rascunho não permitido'; end if;
   if dados is null or jsonb_typeof(dados)<>'object' or length(dados::text)>20000 or nullif(trim(dados->>'nome'),'') is null or coalesce(dados->>'moeda','') !~ '^[A-Z]{3}$' or coalesce((dados->>'orcamento')::numeric,0)<=0 then raise exception 'Nome, moeda e orçamento positivo são obrigatórios'; end if;
   if coalesce(dados->>'destino','') !~ '^https://' or coalesce(dados->>'midia_url','') !~ '^https://' then raise exception 'Destino HTTPS obrigatório'; end if;
   if nullif(dados->>'inicio','') is null or nullif(dados->>'fim','') is null or (dados->>'fim')::date<(dados->>'inicio')::date then raise exception 'Período inválido'; end if;
   if alvo is null then
    insert into public.mkt_campanhas(nome,canal,objetivo,status,data_inicio,data_fim,orcamento_total,criado_por)
     values(dados->>'nome','meta_ads','leads','planejada',(dados->>'inicio')::date,(dados->>'fim')::date,(dados->>'orcamento')::numeric,usuario) returning id into alvo;
   else
    update escritorio_privado.aprovacoes set estado='expirada' where id=r.aprovacao_id and estado in ('pendente','aprovada');
    update public.mkt_campanhas set nome=dados->>'nome',data_inicio=(dados->>'inicio')::date,data_fim=(dados->>'fim')::date,orcamento_total=(dados->>'orcamento')::numeric where id=alvo;
   end if;
   insert into marketing_privado.campanha_rascunhos(campanha_id,dados,atualizado_por) values(alvo,dados,usuario)
    on conflict(campanha_id) do update set dados=excluded.dados,versao=campanha_rascunhos.versao+1,estado='rascunho',aprovacao_id=null,atualizado_por=usuario,atualizado_em=now() returning versao into v;
   return jsonb_build_object('id',alvo,'versao',v);
  end if;
  if alvo is null then raise exception 'Salve antes de solicitar aprovação'; end if;
  dados:=r.dados;
  if r.estado='aguardando_aprovacao' then return jsonb_build_object('aprovacao_id',r.aprovacao_id); end if;
  if not coalesce((dados->>'revisao_etica')::boolean,false) or not coalesce((dados->>'revisao_privacidade')::boolean,false) then raise exception 'Revisão humana de ética e privacidade obrigatória'; end if;
  if nullif(dados->>'conta_id','') is null or nullif(dados->>'pagina_id','') is null or nullif(dados->>'publico','') is null or nullif(dados->>'texto','') is null or nullif(dados->>'midia_url','') is null then raise exception 'Complete conta, Página, público, texto e mídia'; end if;
  p:=jsonb_build_object('campanha_id',alvo,'versao',r.versao,'ambiente','simulacao','acao','criar_pausada','rascunho',dados);
  insert into escritorio_privado.aprovacoes(tipo,origem,solicitada_por,ferramenta,modulo,parametros,escopo_hash,resumo,riscos,chave)
   values('acao','sistema',usuario,'mkt_campanha_simular','marketing',p,escritorio_privado.escopo_hash('mkt_campanha_simular',p),
    'Simular criação pausada: '||left(dados->>'nome',150),'SIMULAÇÃO. Nenhuma chamada à Meta. Conferir ética, privacidade, moeda, público e orçamento. Ativação exige aprovação distinta.',
    'mkt-campanha:'||alvo||':'||r.versao) on conflict(chave) do update set chave=excluded.chave returning id into aprov;
  update marketing_privado.campanha_rascunhos set aprovacao_id=aprov,estado='aguardando_aprovacao' where campanha_id=alvo;
  return jsonb_build_object('aprovacao_id',aprov);
 end if;
 raise exception 'Ação desconhecida';
end $$;
create function public.mkt_integrado(_acao text,_payload jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select marketing_privado.integrado(_acao,_payload) $$;
revoke all on function marketing_privado.integrado(text,jsonb),public.mkt_integrado(text,jsonb) from public,anon;
grant execute on function marketing_privado.integrado(text,jsonb),public.mkt_integrado(text,jsonb) to authenticated;

insert into escritorio_privado.ferramentas(slug,nome,descricao,classe,modulo) values
 ('mkt_campanha_simular','Simular campanha pausada','Aprovação de versão exata. Simulação sem anúncios ou gastos reais.','sensivel','marketing');
-- Não cria executor real nem ativa alterações de anúncios. Apenas Juliana/gestora executa simulação aprovada.
create function public.mkt_simular_campanha(_aprovacao uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare a escritorio_privado.aprovacoes; r marketing_privado.campanha_rascunhos; resultado jsonb;
begin
 if current_user<>'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
 select * into a from escritorio_privado.aprovacoes where id=_aprovacao for update;
 if not found or a.ferramenta<>'mkt_campanha_simular' or a.estado<>'executando' or a.valida_ate<=now() or a.escopo_hash<>escritorio_privado.escopo_hash(a.ferramenta,a.parametros)
 or not coalesce(public.is_gestor(a.decidida_por),false) or not coalesce(public.is_interno_ativo(a.decidida_por),false) then raise exception 'Aprovação específica da gestora necessária'; end if;
 select * into r from marketing_privado.campanha_rascunhos where campanha_id=(a.parametros->>'campanha_id')::uuid for update;
 if not found or r.aprovacao_id is distinct from a.id or r.versao is distinct from (a.parametros->>'versao')::integer or r.dados is distinct from a.parametros->'rascunho' then raise exception 'Rascunho mudou; solicite nova aprovação'; end if;
 resultado:=jsonb_build_object('ambiente','simulacao','campanha_id',r.campanha_id,'versao',r.versao,'status','PAUSED','campaignStatus','PAUSED','adSetStatus','PAUSED','simulado_id','sim-'||a.id,'chamadas_externas',0);
 update marketing_privado.campanha_rascunhos set estado='simulada' where campanha_id=r.campanha_id;
 return resultado;
end $$;
revoke all on function public.mkt_simular_campanha(uuid) from public,anon,authenticated;
grant execute on function public.mkt_simular_campanha(uuid) to service_role;
-- Corrige dupla contagem no painel legado: o dashboard integrado e a integração usam só série de conta.
-- A função antiga permanece compatível; sua soma é ajustada em migration específica gerada abaixo.

create or replace function public.zernio_painel(_aba text, _dias integer default 30)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare d date := current_date - greatest(1, least(_dias, 365));
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  if _aba = 'visao' then
    return jsonb_build_object(
      'conexao', public.zernio_conexao(),
      'contas', coalesce((select jsonb_agg(to_jsonb(c) - 'perfil_id' order by c.plataforma, c.usuario) from marketing_privado.zernio_contas c), '[]'),
      'totais', jsonb_build_object(
        'publicacoes', (select count(*) from marketing_privado.zernio_posts where publicado_em >= d),
        'comentarios', (select count(*) from marketing_privado.zernio_comentarios where criado_em_plataforma >= d),
        'conversas', (select count(*) from marketing_privado.zernio_conversas),
        'campanhas', (select count(*) from marketing_privado.zernio_campanhas),
        'gasto_anuncios', (select jsonb_object_agg(moeda, total) from (select moeda, sum(gasto) total
            from marketing_privado.zernio_anuncio_metricas where nivel = 'conta' and data >= d group by moeda) g)),
      'job_ativo', (select to_jsonb(j) - 'cursores' from marketing_privado.zernio_sync_jobs j where estado in ('pendente','executando')));
  elsif _aba = 'instagram' then
    return jsonb_build_object(
      'publicacoes', coalesce((select jsonb_agg(x order by x->>'publicado_em' desc) from (
          select jsonb_build_object('id', p.externo_id, 'conteudo', left(p.conteudo, 300), 'url', p.url, 'tipo_midia', p.tipo_midia,
            'publicado_em', p.publicado_em, 'metricas', (select to_jsonb(m) - 'post_id' from marketing_privado.zernio_post_metricas m
              where m.post_id = p.id order by m.data desc limit 1)) x
          from marketing_privado.zernio_posts p where p.publicado_em >= d order by p.publicado_em desc limit 100) s), '[]'),
      'comentarios', coalesce((select jsonb_agg(to_jsonb(c) - 'autor_id' order by c.criado_em_plataforma desc) from (
          select * from marketing_privado.zernio_comentarios where criado_em_plataforma >= d
          order by criado_em_plataforma desc limit 100) c), '[]'),
      'conversas', coalesce((select jsonb_agg(to_jsonb(c) - 'participante_id' order by c.atualizado_plataforma desc) from (
          select * from marketing_privado.zernio_conversas order by atualizado_plataforma desc nulls last limit 50) c), '[]'));
  elsif _aba = 'anuncios' then
    return jsonb_build_object(
      'campanhas', coalesce((select jsonb_agg(to_jsonb(c) order by c.estado, c.nome) from marketing_privado.zernio_campanhas c), '[]'),
      'conjuntos', (select count(*) from marketing_privado.zernio_conjuntos),
      'anuncios', coalesce((select jsonb_agg(to_jsonb(a) - 'criativo' order by a.atualizado_em desc) from (
          select * from marketing_privado.zernio_anuncios order by atualizado_em desc limit 100) a), '[]'),
      'diario', coalesce((select jsonb_agg(to_jsonb(m) order by m.data) from marketing_privado.zernio_anuncio_metricas m
          where m.nivel = 'conta' and m.data >= d), '[]'));
  elsif _aba = 'sincronizacoes' then
    return jsonb_build_object(
      'jobs', coalesce((select jsonb_agg(to_jsonb(j) - 'cursores' order by j.criado_em desc) from (
          select * from marketing_privado.zernio_sync_jobs order by criado_em desc limit 30) j), '[]'),
      'logs', coalesce((select jsonb_agg(to_jsonb(l) order by l.id desc) from (
          select * from marketing_privado.zernio_sync_logs order by id desc limit 60) l), '[]'));
  end if;
  raise exception 'Aba desconhecida';
end $$;


insert into escritorio_privado.ferramentas(slug,nome,descricao,classe,modulo) values
 ('mkt_editorial_simular','Simular publicação editorial','Versão editorial aprovada e autorização separada. Sem envio externo.','sensivel','marketing');
create function public.mkt_simular_editorial(_aprovacao uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a escritorio_privado.aprovacoes; i public.mkt_itens;
begin
 if current_user<>'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
 select * into a from escritorio_privado.aprovacoes where id=_aprovacao for update;
 if not found or a.estado<>'executando' or a.ferramenta<>'mkt_editorial_simular' or a.valida_ate<=now() or not coalesce(public.is_gestor(a.decidida_por),false) or not coalesce(public.is_interno_ativo(a.decidida_por),false) or a.escopo_hash<>escritorio_privado.escopo_hash(a.ferramenta,a.parametros) then raise exception 'Autorização específica necessária'; end if;
 select * into i from public.mkt_itens where id=(a.parametros->>'item_id')::uuid for update;
 if not found or i.versao is distinct from (a.parametros->>'versao')::integer or i.versao_aprovada is distinct from i.versao or i.status not in ('aprovado','pronto') then raise exception 'Peça alterada; solicite nova aprovação'; end if;
 return jsonb_build_object('ambiente','simulacao','publicacao_simulada',true,'item_id',i.id,'versao',i.versao,'chamadas_externas',0,'simulado_id','sim-post-'||a.id);
end $$;
revoke all on function public.mkt_simular_editorial(uuid) from public,anon,authenticated;
grant execute on function public.mkt_simular_editorial(uuid) to service_role;

create function public.mkt_formulario_reconciliar(_conta text,_formulario text) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare f marketing_privado.lead_formularios;
begin
 if current_user<>'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
 select * into f from marketing_privado.lead_formularios where conta_id=_conta and formulario_id=_formulario;
 if not found or not f.ativo or not f.escopos_conferidos or not f.privacidade_conferida or not f.termos_conferidos then raise exception 'Formulário não homologado'; end if;
 return jsonb_build_object('conta_id',f.conta_id,'formulario_id',f.formulario_id,'teste',f.somente_teste);
end $$;
revoke all on function public.mkt_formulario_reconciliar(text,text) from public,anon,authenticated;
grant execute on function public.mkt_formulario_reconciliar(text,text) to service_role;
-- Replays antigos continuam deduplicados por origem após o descarte dos IDs de entrega.
create function public.mkt_purgar_eventos_lead() returns bigint language plpgsql security invoker set search_path='' as $$
declare n bigint;
begin
 if current_user not in ('service_role','postgres') then raise exception 'Somente backend' using errcode='42501'; end if;
 delete from marketing_privado.lead_eventos where recebido_em<now()-interval '90 days'; get diagnostics n=row_count; return n;
end $$;
revoke all on function public.mkt_purgar_eventos_lead() from public,anon,authenticated;
grant execute on function public.mkt_purgar_eventos_lead() to service_role;

-- Restringe os novos pedidos à gestora; decisões de outras ferramentas preservadas.
create or replace function public.aprovacao_decidir(_usuario uuid, _id uuid, _aprovar boolean, _hash text, _observacao text default null)
returns text language plpgsql security invoker set search_path='' as $$
declare a escritorio_privado.aprovacoes;
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  select * into a from escritorio_privado.aprovacoes where id=_id for update;
  if not found or a.tipo <> 'acao' then raise exception 'Pedido não encontrado'; end if;
  if a.ferramenta in ('mkt_campanha_simular','mkt_editorial_simular') and not coalesce(public.is_gestor(_usuario),false) then raise exception 'Somente a gestora decide ações do Marketing' using errcode='42501'; end if;
  if a.estado <> 'pendente' then return a.estado; end if;
  if a.valida_ate <= now() then
    update escritorio_privado.aprovacoes set estado='expirada', atualizado_em=now() where id=_id;
    return 'expirada';
  end if;
  if not public.is_interno_ativo(_usuario) or a.modulo is null or not public.has_permission(_usuario, a.modulo, 'editar') then
    raise exception 'Sem permissão para decidir este pedido' using errcode='42501';
  end if;
  if a.modulo = 'financeiro' and a.solicitada_por = _usuario then
    raise exception 'Quem pediu não aprova pedido financeiro' using errcode='42501';
  end if;
  if _hash is distinct from a.escopo_hash or a.escopo_hash <> escritorio_privado.escopo_hash(a.ferramenta, a.parametros) then
    raise exception 'O pedido mudou. Abra de novo antes de decidir.' using errcode='40001';
  end if;
  update escritorio_privado.aprovacoes
    set estado = case when _aprovar then 'aprovada' else 'recusada' end,
        decidida_por=_usuario, decidida_em=now(), observacao=left(_observacao,1000), atualizado_em=now()
    where id=_id;
  perform escritorio_privado.auditar('usuario', _usuario, case when _aprovar then 'aprovacao.aprovada' else 'aprovacao.recusada' end,
    _id::text, jsonb_build_object('hash', a.escopo_hash));
  return case when _aprovar then 'aprovada' else 'recusada' end;
end $$;

revoke all on function public.aprovacao_decidir(uuid,uuid,boolean,text,text),public.zernio_painel(text,integer) from public,anon,authenticated;
grant execute on function public.aprovacao_decidir(uuid,uuid,boolean,text,text),public.zernio_painel(text,integer) to service_role;

-- Alertas internos na outbox já existente, sem e-mail, Telegram ou nova rotina de coleta.
create function public.mkt_alertas_integracao(_motivo text default null,_conta text default null) returns void
language plpgsql security invoker set search_path='' as $$
declare c marketing_privado.zernio_conexoes; motivo text:=_motivo;
begin
 if current_user<>'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
 if motivo is null then
  select * into c from marketing_privado.zernio_conexoes;
  if c.estado in ('erro_autenticacao','revogada') then motivo:='desconexao';
  elsif c.ultima_sync_ok_em is null or c.ultima_sync_ok_em<now()-make_interval(mins=>c.intervalo_minutos*2) then motivo:='dados_atrasados';
  elsif (select count(*) from marketing_privado.zernio_sync_jobs where estado in ('falhou','parcial') and criado_em>now()-interval '1 day')>=2 then motivo:='erro_repetido';
  end if;
 end if;
 if motivo is null then return; end if;
 if motivo not in ('desconexao','dados_atrasados','erro_repetido','lead_pendente') then raise exception 'Código de alerta inválido'; end if;
 insert into escritorio_privado.eventos(tipo,payload,chave) values('marketing.integracao_alerta',jsonb_build_object('codigo',motivo,'conta_id',left(_conta,200),'acao','Conferir Configurações > Integrações > Zernio'),
  'marketing-alerta:'||(now() at time zone 'America/Cuiaba')::date||':'||motivo||':'||coalesce(left(_conta,200),'')) on conflict(chave) do nothing;
end $$;
revoke all on function public.mkt_alertas_integracao(text,text) from public,anon,authenticated;
grant execute on function public.mkt_alertas_integracao(text,text) to service_role;
