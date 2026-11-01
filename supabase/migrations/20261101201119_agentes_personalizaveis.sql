create schema if not exists escritorio_privado;
revoke all on schema escritorio_privado from public,anon,authenticated;
grant usage on schema escritorio_privado to service_role;
create table escritorio_privado.agente_configuracoes(
 agente_id uuid primary key references public.agentes_ia(id) on delete restrict,
 revisao integer not null check(revisao>0), dados jsonb not null check(jsonb_typeof(dados)='object' and length(dados::text)<=200000),
 atualizado_por uuid not null references auth.users(id), atualizado_em timestamptz not null default now()
);
create table escritorio_privado.agente_config_historico(
 agente_id uuid not null references public.agentes_ia(id) on delete restrict,revisao integer not null,dados jsonb not null,
 atualizado_por uuid not null references auth.users(id),criado_em timestamptz not null default now(),primary key(agente_id,revisao)
);
alter table escritorio_privado.agente_configuracoes enable row level security;
alter table escritorio_privado.agente_config_historico enable row level security;
revoke all on all tables in schema escritorio_privado from public,anon,authenticated;
grant select,insert,update on escritorio_privado.agente_configuracoes to service_role;
grant select,insert on escritorio_privado.agente_config_historico to service_role;
create function public.escritorio_ler_config(_usuario uuid,_agente uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare a public.agentes_ia; c escritorio_privado.agente_configuracoes;
begin
 if not public.is_interno_ativo(_usuario) or not public.is_gestor(_usuario) then raise exception 'Gestor ativo necessário' using errcode='42501';end if;
 select * into a from public.agentes_ia where id=_agente;
 if not found or a.executor is distinct from 'analista_operacional' or a.supervisor_id is distinct from _usuario then raise exception 'Configuração indisponível para esta supervisora' using errcode='42501';end if;
 select * into c from escritorio_privado.agente_configuracoes where agente_id=a.id;
 return jsonb_build_object('revisao',coalesce(c.revisao,0),'config',coalesce(c.dados,'{}'));
end;$$;
create function public.escritorio_salvar_config(_usuario uuid,_agente uuid,_revisao integer,_config jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_id uuid:=_agente; a public.agentes_ia; v_rev integer; v_intervalo integer;
begin
 if not public.is_interno_ativo(_usuario) or not public.is_gestor(_usuario) then raise exception 'Gestor ativo necessário' using errcode='42501';end if;
 if jsonb_typeof(_config->'nome') is distinct from 'string' or jsonb_typeof(_config->'prompt_base') is distinct from 'string' or jsonb_typeof(_config->'sala') is distinct from 'string' or jsonb_typeof(_config) is distinct from 'object' or length(_config::text)>200000 or length(_config->>'nome') not between 3 and 80 or length(_config->>'prompt_base') not between 10 and 6000 or (_config->>'sala') not in ('diretoria','operacional','comercial','reuniao','diligencias','marketing') or jsonb_typeof(_config->'documentos') is distinct from 'array' or jsonb_array_length(_config->'documentos')>10 or jsonb_typeof(_config->'ferramentas') is distinct from 'array' or (_config->'ferramentas')<@'[]'::jsonb or not (_config->'ferramentas')<@'["indicadores_operacionais","base_conhecimento"]'::jsonb or jsonb_typeof(_config->'ativo') is distinct from 'boolean' then raise exception 'Configuração inválida';end if;
 v_intervalo:=(_config->>'intervalo_minutos')::integer;
 if v_intervalo is not null and v_intervalo not in (60,240,1440) then raise exception 'Rotina inválida';end if;
 if v_id is null then
  if _revisao is distinct from 0 then raise exception 'Revisão inicial inválida';end if;
  insert into public.agentes_ia(slug,nome,descricao,area,executor,supervisor_id,sala,ativo,intervalo_minutos,proxima_execucao,exige_aprovacao,timeout_segundos,ordem)
  values('analista-'||gen_random_uuid(),_config->>'nome',_config->>'missao','gestao','analista_operacional',_usuario,_config->>'sala',(_config->>'ativo')::boolean,v_intervalo,case when v_intervalo is not null then now() end,true,90,10) returning id into v_id;
  v_rev:=0;
 else
  select * into a from public.agentes_ia where id=v_id for update;
  if not found or a.executor is distinct from 'analista_operacional' or a.supervisor_id is distinct from _usuario then raise exception 'Configuração indisponível para esta supervisora' using errcode='42501';end if;
  select revisao into v_rev from escritorio_privado.agente_configuracoes where agente_id=v_id;
  v_rev:=coalesce(v_rev,0);
  if _revisao is distinct from v_rev then raise exception 'A configuração mudou. Recarregue antes de salvar.' using errcode='40001';end if;
  update public.agentes_ia set nome=_config->>'nome',descricao=_config->>'missao',sala=_config->>'sala',ativo=(_config->>'ativo')::boolean,intervalo_minutos=v_intervalo,
    proxima_execucao=case when v_intervalo is null then null when intervalo_minutos is distinct from v_intervalo then now() else coalesce(proxima_execucao,now()) end where id=v_id;
 end if;
 v_rev:=v_rev+1;
 insert into escritorio_privado.agente_configuracoes values(v_id,v_rev,_config,_usuario,now()) on conflict(agente_id) do update set revisao=excluded.revisao,dados=excluded.dados,atualizado_por=excluded.atualizado_por,atualizado_em=excluded.atualizado_em;
 insert into escritorio_privado.agente_config_historico(agente_id,revisao,dados,atualizado_por) values(v_id,v_rev,_config,_usuario);
 return jsonb_build_object('agente_id',v_id,'revisao',v_rev);
end;$$;
revoke all on function public.escritorio_ler_config(uuid,uuid),public.escritorio_salvar_config(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.escritorio_ler_config(uuid,uuid),public.escritorio_salvar_config(uuid,uuid,integer,jsonb) to service_role;

create table escritorio_privado.workers(
 id uuid primary key default gen_random_uuid(),supervisor_id uuid not null references auth.users(id),nome text not null check(length(nome) between 1 and 80),
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),ativo boolean not null default true,criado_em timestamptz not null default now(),ultimo_sinal timestamptz,versao text
);
alter table escritorio_privado.workers enable row level security;
revoke all on escritorio_privado.workers from public,anon,authenticated;
grant select,insert,update on escritorio_privado.workers to service_role;
create function public.escritorio_worker_gerir(_usuario uuid,_acao text,_nome text default null,_hash text default null,_id uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_id uuid;
begin
 if not public.is_interno_ativo(_usuario) or not public.is_gestor(_usuario) then raise exception 'Gestor ativo necessário' using errcode='42501';end if;
 if _acao='criar' then
  insert into escritorio_privado.workers(supervisor_id,nome,token_hash) values(_usuario,_nome,_hash) returning id into v_id;return jsonb_build_object('id',v_id);
 elsif _acao='revogar' then
  update escritorio_privado.workers set ativo=false where id=_id and supervisor_id=_usuario;return jsonb_build_object('ok',found);
 elsif _acao='listar' then
  return jsonb_build_object('workers',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'nome',nome,'ativo',ativo,'ultimo_sinal',ultimo_sinal,'versao',versao) order by criado_em desc),'[]') from escritorio_privado.workers where supervisor_id=_usuario));
 else raise exception 'Ação inválida';end if;
end;$$;
create function public.escritorio_worker_pulso(_id uuid,_hash text,_versao text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare w escritorio_privado.workers;a record;v_secret text;v_n integer:=0;
begin
 select * into w from escritorio_privado.workers where id=_id and token_hash=_hash and ativo for update;
 if not found or not public.is_interno_ativo(w.supervisor_id) or not public.is_gestor(w.supervisor_id) then return null;end if;
 if w.ultimo_sinal>now()-interval '45 seconds' then return jsonb_build_object('ok',true,'despachos_enviados',0);end if;
 update escritorio_privado.workers set ultimo_sinal=now(),versao=left(_versao,40) where id=w.id;
 select decrypted_secret into v_secret from vault.decrypted_secrets where name='djen_cron_secret';
 if v_secret is not null then
  for a in select id from public.agentes_ia where ativo and executor='analista_operacional' and supervisor_id=w.supervisor_id and intervalo_minutos is not null and proxima_execucao<=now() order by proxima_execucao limit 3 for update skip locked
  loop
   perform net.http_post(url:='https://mzwnljgujheumdslkloc.supabase.co/functions/v1/agentes-escritorio',headers:=jsonb_build_object('Content-Type','application/json','x-djen-cron-secret',v_secret),body:=jsonb_build_object('acao','rotina','agente_id',a.id),timeout_milliseconds:=120000);
   update public.agentes_ia set proxima_execucao=now()+interval '5 minutes' where id=a.id;v_n:=v_n+1;
  end loop;
 end if;
 return jsonb_build_object('ok',true,'despachos_enviados',v_n);
end;$$;
revoke all on function public.escritorio_worker_gerir(uuid,text,text,text,uuid),public.escritorio_worker_pulso(uuid,text,text) from public,anon,authenticated;
grant execute on function public.escritorio_worker_gerir(uuid,text,text,text,uuid),public.escritorio_worker_pulso(uuid,text,text) to service_role;
