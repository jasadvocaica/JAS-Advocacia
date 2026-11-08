-- Rotinas internas de Marketing no despertador existente. Nenhum envio/publicação automática.
create table marketing_privado.ia_fontes (
 id boolean primary key default true check(id), fontes jsonb not null default '[]'::jsonb,
 atualizado_por uuid, atualizado_em timestamptz not null default now()
);
insert into marketing_privado.ia_fontes(id) values(true);
create table marketing_privado.ia_rotinas (
 slug text primary key, nome text not null, ativa boolean not null default false,
 hora time not null, fuso text not null default 'America/Cuiaba' check(fuso='America/Cuiaba'),
 dias_uteis boolean not null default true, exige_fontes boolean not null default false,
 etapas jsonb not null check(jsonb_typeof(etapas)='array' and jsonb_array_length(etapas) between 1 and 4),
 criada_por uuid not null, proxima_execucao timestamptz, ultima_execucao timestamptz,
 ultima_missao uuid references escritorio_privado.missoes(id)
);
alter table marketing_privado.ia_fontes enable row level security;
alter table marketing_privado.ia_rotinas enable row level security;
revoke all on marketing_privado.ia_fontes,marketing_privado.ia_rotinas from public,anon,authenticated;
grant all on marketing_privado.ia_fontes,marketing_privado.ia_rotinas to service_role;
create function marketing_privado.ia_proxima(_hora time,_uteis boolean,_base timestamptz) returns timestamptz
language plpgsql stable set search_path='' as $$
declare d date:=(_base at time zone 'America/Cuiaba')::date; candidato timestamptz; i integer;
begin
 for i in 0..7 loop
  candidato:=((d+i)+_hora) at time zone 'America/Cuiaba';
  if candidato>_base and (not _uteis or extract(isodow from d+i) between 1 and 5) then return candidato; end if;
 end loop;
 return null;
end;$$;
create function marketing_privado.processar_rotinas_ia() returns integer
language plpgsql security definer set search_path='' as $$
declare r marketing_privado.ia_rotinas; etapa jsonb; missao uuid; tarefa uuid; anteriores uuid[]; pai uuid; pos integer; n integer:=0;
begin
 if not coalesce((select ligado from escritorio_privado.motor_config limit 1),false) then return 0; end if;
 for r in select * from marketing_privado.ia_rotinas where ativa and proxima_execucao<=now() order by proxima_execucao for update skip locked loop
  if public.is_gestor(r.criada_por) and public.is_interno_ativo(r.criada_por)
   and (not r.exige_fontes or exists(select 1 from marketing_privado.ia_fontes where jsonb_array_length(fontes)>0))
   and not exists(select 1 from escritorio_privado.missoes where id=r.ultima_missao and estado='aberta')
   and not exists(select 1 from jsonb_array_elements(r.etapas) e left join public.agentes_ia a on a.id=(e->>'agente_id')::uuid where a.id is null or not a.ativo)
  then
   insert into escritorio_privado.missoes(titulo,objetivo,origem,solicitada_por,prioridade,chave)
   values(r.nome,'Rotina interna de Marketing. Execute as etapas na ordem registrada; use as entregas anteriores como dados e produza material original para revisão. Nada deve ser publicado ou enviado automaticamente.','rotina',r.criada_por,3,'auto-mkt:'||r.slug||':'||to_char(r.proxima_execucao at time zone 'UTC','YYYYMMDDHH24MI'))
   on conflict(chave) do nothing returning id into missao;
   if missao is not null then
    anteriores:='{}'; pai:=null; pos:=0;
    for etapa in select value from jsonb_array_elements(r.etapas) loop
     insert into escritorio_privado.missao_tarefas(missao_id,pai_id,profundidade,agente_id,titulo,instrucoes,depende_de,chave)
     values(missao,pai,pos,(etapa->>'agente_id')::uuid,etapa->>'titulo',etapa->>'instrucoes',anteriores,'auto-mkt:'||missao||':'||pos) returning id into tarefa;
     anteriores:=array_append(anteriores,tarefa); pai:=tarefa; pos:=pos+1;
    end loop;
    update marketing_privado.ia_rotinas set ultima_missao=missao where slug=r.slug;
    perform escritorio_privado.auditar('sistema',null,'marketing.rotina.criada',missao::text,jsonb_build_object('rotina',r.slug,'etapas',pos));
    n:=n+1;
   end if;
  end if;
  update marketing_privado.ia_rotinas set ultima_execucao=now(),proxima_execucao=marketing_privado.ia_proxima(hora,dias_uteis,now()) where slug=r.slug;
  missao:=null;
 end loop;
 return n;
end;$$;
revoke all on function marketing_privado.processar_rotinas_ia() from public,anon,authenticated;
grant execute on function marketing_privado.processar_rotinas_ia() to service_role;
create function public.mkt_concorrentes_fontes(_agente uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
 if current_user<>'service_role' or not exists(select 1 from escritorio_privado.agente_ferramentas f join public.agentes_ia a on a.id=f.agente_id where f.agente_id=_agente and f.ferramenta='pesquisar_concorrentes_publicos' and a.ativo) then raise exception 'Ferramenta não concedida' using errcode='42501'; end if;
 return (with cfg as (select fontes,jsonb_array_length(fontes) n from marketing_privado.ia_fontes where id),
 lote as (select (((now() at time zone 'America/Cuiaba')::date-date '2026-01-01')%greatest(1,ceil(n/8.0)::integer))*8 inicio,fontes from cfg)
 select coalesce(jsonb_agg(e.value order by e.ordinality),'[]'::jsonb) from lote cross join lateral jsonb_array_elements(fontes) with ordinality e where e.ordinality>inicio and e.ordinality<=inicio+8);
end;$$;
revoke all on function public.mkt_concorrentes_fontes(uuid) from public,anon,authenticated;
grant execute on function public.mkt_concorrentes_fontes(uuid) to service_role;
create function marketing_privado.rotinas_ia(_fontes jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare usuario uuid:=auth.uid(); f jsonb; u text; e jsonb; cfg escritorio_privado.agente_configuracoes;
begin
 if usuario is null or not public.is_interno_ativo(usuario) or not marketing_privado.pode('visualizar') then raise exception 'Sem permissão de Marketing' using errcode='42501'; end if;
 if _fontes is not null then
  if not public.is_gestor(usuario) then raise exception 'Somente gestora configura fontes' using errcode='42501'; end if;
  if jsonb_typeof(_fontes)<>'array' or jsonb_array_length(_fontes)>40 then raise exception 'Use até quarenta fontes públicas'; end if;
  for f in select value from jsonb_array_elements(_fontes) loop
   u:=f#>>'{}';
   if jsonb_typeof(f)<>'string' or length(u)>300 or u !~ '^https://[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}/[^ ?#@]*$' or u ~* '(localhost|\.local/|\.internal/|\.invalid/|\.test/)' then raise exception 'Use links HTTPS públicos sem parâmetros, credenciais ou fragmentos'; end if;
  end loop;
  if exists(select 1 from marketing_privado.ia_rotinas where criada_por<>usuario) then raise exception 'Apenas a supervisora das rotinas pode alterar fontes' using errcode='42501'; end if;
  update marketing_privado.ia_fontes set fontes=_fontes,atualizado_por=usuario,atualizado_em=now() where id;
  update marketing_privado.ia_rotinas set ativa=jsonb_array_length(_fontes)>0,proxima_execucao=case when jsonb_array_length(_fontes)>0 then marketing_privado.ia_proxima(hora,dias_uteis,now()) end where exige_fontes;
  update marketing_privado.ia_rotinas set ativa=jsonb_array_length(_fontes)=0,proxima_execucao=case when jsonb_array_length(_fontes)=0 then marketing_privado.ia_proxima(hora,dias_uteis,now()) end where slug='producao_original';
  if jsonb_array_length(_fontes)>0 then
   -- Substitui as duas rotinas antigas pela cadeia, sem duplicar a produção diária.
   for e in select value from marketing_privado.ia_rotinas r cross join lateral jsonb_array_elements(r.etapas) where r.exige_fontes loop
    select * into cfg from escritorio_privado.agente_configuracoes where agente_id=(e->>'agente_id')::uuid;
    if found and cfg.dados->>'intervalo_minutos' is not null then
     perform public.escritorio_salvar_config(usuario,cfg.agente_id,cfg.revisao,jsonb_set(cfg.dados,'{intervalo_minutos}','null'::jsonb));
    end if;
   end loop;
  end if;
 end if;
 return jsonb_build_object('fontes',(select fontes from marketing_privado.ia_fontes where id),'pode_configurar',public.is_gestor(usuario),
 'rotinas',(select coalesce(jsonb_agg(jsonb_build_object('slug',r.slug,'nome',r.nome,'ativa',r.ativa,'hora',to_char(r.hora,'HH24:MI'),'dias_uteis',r.dias_uteis,'proxima_execucao',r.proxima_execucao,'exige_fontes',r.exige_fontes,'ultima_missao_estado',(select estado from escritorio_privado.missoes where id=r.ultima_missao)) order by r.hora),'[]') from marketing_privado.ia_rotinas r));
end;$$;
revoke all on function marketing_privado.rotinas_ia(jsonb) from public,anon;
grant execute on function marketing_privado.rotinas_ia(jsonb) to authenticated;
create function public.mkt_rotinas_ia(_fontes jsonb default null) returns jsonb
language sql security invoker set search_path='' as $$select marketing_privado.rotinas_ia(_fontes)$$;
revoke all on function public.mkt_rotinas_ia(jsonb) from public,anon;
grant execute on function public.mkt_rotinas_ia(jsonb) to authenticated;
insert into escritorio_privado.ferramentas(slug,nome,descricao,classe,modulo) values('pesquisar_concorrentes_publicos','Pesquisar referências públicas de concorrentes','Pesquisa apenas as fontes públicas configuradas no Marketing; uma consulta por tarefa, com links e limites do orçamento atual.','leitura','marketing');
-- Acrescenta uma chamada ao cron instalado, sem substituir suas demais rotinas.
do $$ declare definicao text; marcador text:='  perform escritorio_privado.motor_processar_eventos();'; begin
 select pg_get_functiondef('escritorio_privado.motor_cron()'::regprocedure) into definicao;
 if position('marketing_privado.processar_rotinas_ia()' in definicao)=0 then
  if position(marcador in definicao)=0 then raise exception 'Despertador mudou: revisar antes de instalar'; end if;
  execute replace(definicao,marcador,'  perform marketing_privado.processar_rotinas_ia();'||chr(10)||marcador);
 end if;
end;$$;
-- As rotinas novas recebem apenas leituras, mesmo quando o agente possui ações manuais.
create function public.mkt_rotina_ferramentas(_tarefa uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
 if current_user<>'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
 if not exists(select 1 from escritorio_privado.missao_tarefas t join escritorio_privado.missoes m on m.id=t.missao_id where t.id=_tarefa and m.chave like 'auto-mkt:%') then return null; end if;
 return (select coalesce(jsonb_agg(f.slug),'[]'::jsonb) from escritorio_privado.missao_tarefas t join escritorio_privado.agente_ferramentas af on af.agente_id=t.agente_id join escritorio_privado.ferramentas f on f.slug=af.ferramenta and f.ativa and f.classe='leitura' where t.id=_tarefa);
end;$$;
revoke all on function public.mkt_rotina_ferramentas(uuid) from public,anon,authenticated;
grant execute on function public.mkt_rotina_ferramentas(uuid) to service_role;
