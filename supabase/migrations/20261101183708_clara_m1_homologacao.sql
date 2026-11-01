-- M1: aplicar SOMENTE após aprovação do ambiente de homologação.
-- Nenhum INSERT/UPDATE/DELETE em public.clientes ou dados jurídicos de produção.
create schema if not exists homologacao;
revoke all on schema homologacao from public,anon,authenticated;
grant usage on schema homologacao to service_role;
create table homologacao.clientes(like public.clientes including defaults including generated including constraints);
alter table homologacao.clientes add primary key(id);
create unique index clara_cliente_cpf_unico on homologacao.clientes(cpf_cnpj) where cpf_cnpj is not null;
alter table homologacao.clientes enable row level security;
revoke all on homologacao.clientes from public,anon,authenticated;
grant all on homologacao.clientes to service_role;

create table homologacao.clara_config(id boolean primary key default true check(id), habilitado boolean not null default false,
 entrada_usd_milhao numeric not null default .40,saida_usd_milhao numeric not null default 1.60,vigencia date not null default '2026-11-01');
insert into homologacao.clara_config(id) values(true);
alter table homologacao.clara_config enable row level security;
create table homologacao.clara_tarefas(
 id uuid primary key default gen_random_uuid(), usuario_id uuid not null references auth.users(id),
 ambiente text not null default 'homologacao' check(ambiente='homologacao'),
 versao text not null default 'clara-txt-v1', hash text not null check(hash ~ '^[0-9a-f]{64}$'),
 comando text not null, arquivo text not null, texto text not null check(length(texto) between 1 and 12000),
 estado text not null default 'queued' check(estado in ('queued','running','awaiting_input','awaiting_approval','completed','failed','cancelled')),
 candidato jsonb, evidencias jsonb, pendencias jsonb not null default '[]', numero_cnj text,
 cliente_id uuid references homologacao.clientes(id), consumo_id uuid, tentativas integer not null default 0,
 tokens_entrada integer not null default 0, tokens_saida integer not null default 0, custo_estimado_usd numeric not null default 0,
 erro text, decidido_por uuid references auth.users(id), criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
 unique(usuario_id,hash,versao)
);
create index clara_tarefas_usuario on homologacao.clara_tarefas(usuario_id,criado_em desc);
create table homologacao.clara_chamadas(
 consumo_id uuid primary key,tarefa_id uuid not null references homologacao.clara_tarefas(id),tentativa integer not null,
 confirmado boolean not null default false,entrada integer not null default 0,saida integer not null default 0,custo numeric not null default 0,
 precificacao jsonb not null,criado_em timestamptz not null default now(),unique(tarefa_id,tentativa)
);
alter table homologacao.clara_chamadas enable row level security;
create table homologacao.clara_eventos(
 id bigint generated always as identity primary key, tarefa_id uuid not null references homologacao.clara_tarefas(id),
 estado text not null, motivo text not null, criado_em timestamptz not null default now()
);
create index clara_eventos_tarefa on homologacao.clara_eventos(tarefa_id,id);
alter table homologacao.clara_tarefas enable row level security;
alter table homologacao.clara_eventos enable row level security;
revoke all on all tables in schema homologacao from public,anon,authenticated;
grant all on all tables in schema homologacao to service_role;
grant usage,select on all sequences in schema homologacao to service_role;

create function public.clara_m1_receber(_usuario uuid,_hash text,_comando text,_arquivo text,_texto text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid;begin
 if not public.is_interno_ativo(_usuario) or not public.is_gestor(_usuario) or not public.has_permission(_usuario,'clientes','criar') then raise exception 'Sem permissão' using errcode='42501';end if;
 if not exists(select 1 from homologacao.clara_config where id and habilitado) then raise exception 'Homologação Clara desativada';end if;
 insert into homologacao.clara_tarefas(usuario_id,hash,comando,arquivo,texto) values(_usuario,_hash,_comando,_arquivo,_texto)
 on conflict(usuario_id,hash,versao) do nothing returning id into v_id;
 if v_id is null then select id into v_id from homologacao.clara_tarefas where usuario_id=_usuario and hash=_hash and versao='clara-txt-v1';return v_id;end if;
 insert into homologacao.clara_eventos(tarefa_id,estado,motivo) values
 (v_id,'received','TXT recebido com hash SHA-256.'),(v_id,'classified','Intenção compatível com cadastro de cliente M1.'),
 (v_id,'planned','Clara: extrair, validar evidências, apresentar prévia e aguardar aprovação.'),(v_id,'queued','Aguardando executor de homologação.');
 return v_id;
end;$$;

create function public.clara_m1_consultar(_usuario uuid,_tarefa uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare t homologacao.clara_tarefas;begin
 if not public.is_interno_ativo(_usuario) or not public.is_gestor(_usuario) or not public.has_permission(_usuario,'clientes','criar') then raise exception 'Sem permissão' using errcode='42501';end if;
 select * into t from homologacao.clara_tarefas where id=_tarefa and usuario_id=_usuario;
 if not found then raise exception 'Tarefa não encontrada' using errcode='42501';end if;
 return (to_jsonb(t)-'texto')||jsonb_build_object('chamadas',(select coalesce(jsonb_agg(to_jsonb(c) order by c.tentativa),'[]') from homologacao.clara_chamadas c where c.tarefa_id=t.id),'eventos',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') from homologacao.clara_eventos e where e.tarefa_id=t.id));
end;$$;

create function public.clara_m1_reservar(_usuario uuid,_tarefa uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare t homologacao.clara_tarefas;begin
 if not public.is_interno_ativo(_usuario) or not public.is_gestor(_usuario) or not public.has_permission(_usuario,'clientes','criar') then raise exception 'Sem permissão' using errcode='42501';end if;
 select * into t from homologacao.clara_tarefas where id=_tarefa and usuario_id=_usuario for update;
 if not found then raise exception 'Tarefa não encontrada' using errcode='42501';end if;
 if not exists(select 1 from homologacao.clara_config where id and habilitado) then raise exception 'Homologação Clara desativada';end if;
 if t.estado not in ('queued','failed') or t.tentativas>=3 then return null;end if;
 update homologacao.clara_tarefas set estado='running',tentativas=tentativas+1,consumo_id=gen_random_uuid(),erro=null,atualizado_em=now() where id=t.id returning * into t;
 insert into homologacao.clara_chamadas(consumo_id,tarefa_id,tentativa,precificacao) select t.consumo_id,t.id,t.tentativas,jsonb_build_object('entrada_usd_milhao',entrada_usd_milhao,'saida_usd_milhao',saida_usd_milhao,'vigencia',vigencia) from homologacao.clara_config where id;
 insert into homologacao.clara_eventos(tarefa_id,estado,motivo) values(t.id,'running','Clara reservada. Extração por IA sujeita ao teto global de tokens.');
 return to_jsonb(t)||jsonb_build_object('precificacao',(select precificacao from homologacao.clara_chamadas where consumo_id=t.consumo_id));
end;$$;

create function public.clara_m1_previa(_usuario uuid,_tarefa uuid,_consumo uuid,_candidato jsonb,_evidencias jsonb,_pendencias jsonb,_cnj text,_entrada integer,_saida integer,_custo numeric)
returns boolean language plpgsql security invoker set search_path='' as $$
declare t homologacao.clara_tarefas; v_estado text;begin
 select * into t from homologacao.clara_tarefas where id=_tarefa and usuario_id=_usuario for update;
 if not found or t.estado<>'running' or t.consumo_id is distinct from _consumo then return false;end if;
 if jsonb_typeof(_candidato)<>'object' or jsonb_typeof(_pendencias)<>'array' or _entrada<0 or _saida<0 then raise exception 'Prévia inválida';end if;
 if not public.clara_m1_consumo(_usuario,_tarefa,_consumo,_entrada,_saida,_custo) then return false;end if;
 v_estado:=case when jsonb_array_length(_pendencias)>0 then 'awaiting_input' else 'awaiting_approval' end;
 update homologacao.clara_tarefas set estado=v_estado,candidato=_candidato,evidencias=_evidencias,pendencias=_pendencias,numero_cnj=_cnj,atualizado_em=now() where id=t.id;
 insert into homologacao.clara_eventos(tarefa_id,estado,motivo) values(t.id,v_estado,'Extração validada pelo código. Campos sem evidência não são preenchidos.');return true;
end;$$;

create function public.clara_m1_falhar(_usuario uuid,_tarefa uuid,_consumo uuid,_erro text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 update homologacao.clara_tarefas set estado='failed',erro=left(_erro,300),atualizado_em=now()
 where id=_tarefa and usuario_id=_usuario and estado='running' and consumo_id=_consumo;
 if found then insert into homologacao.clara_eventos(tarefa_id,estado,motivo) values(_tarefa,'failed','Falha no executor. Confira o motivo; não houve cadastro.');end if;
end;$$;

create function public.clara_m1_aprovar(_usuario uuid,_tarefa uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare t homologacao.clara_tarefas; v_id uuid; v_nome text; c jsonb;begin
 if not public.is_interno_ativo(_usuario) or not public.is_gestor(_usuario) or not public.has_permission(_usuario,'clientes','criar') then raise exception 'Sem permissão' using errcode='42501';end if;
 select * into t from homologacao.clara_tarefas where id=_tarefa and usuario_id=_usuario for update;
 if not found then raise exception 'Tarefa não encontrada' using errcode='42501';end if;
 if t.estado='completed' then return jsonb_build_object('cliente_id',t.cliente_id,'reutilizado',true,'ambiente','homologacao');end if;
 if t.estado<>'awaiting_approval' or jsonb_array_length(t.pendencias)>0 then raise exception 'Tarefa exige correção ou ainda não foi extraída';end if;
 if not exists(select 1 from homologacao.clara_config where id and habilitado) then raise exception 'Homologação Clara desativada';end if;
 c:=t.candidato;
 if coalesce(c->>'nome','')='' or not coalesce(homologacao.clara_cpf_valido(c->>'cpf_cnpj'),false) or (coalesce(c->>'whatsapp','')='' and coalesce(c->>'email','')='') then raise exception 'Campos obrigatórios ausentes';end if;
 perform pg_advisory_xact_lock(hashtextextended('clara-m1-cpf:'||(c->>'cpf_cnpj'),0));
 select id,nome into v_id,v_nome from homologacao.clientes where cpf_cnpj=c->>'cpf_cnpj';
 if v_id is not null and lower(trim(v_nome))<>lower(trim(c->>'nome')) then
  update homologacao.clara_tarefas set estado='awaiting_input',pendencias='["CPF já existe com outro nome na homologação. Confira a identidade."]',atualizado_em=now() where id=t.id;
  insert into homologacao.clara_eventos(tarefa_id,estado,motivo) values(t.id,'awaiting_input','Divergência com cadastro existente. Nenhuma atualização feita.');
  return jsonb_build_object('pendencia',true,'ambiente','homologacao');
 end if;
 if v_id is null then
  -- Contrato nativo do cadastro, executado exclusivamente no espelho isolado.
  insert into homologacao.clientes(nome,cpf_cnpj,tipo_pessoa,whatsapp,telefones,email,endereco,nascimento,status,ativo,criado_por,origem)
   values(c->>'nome',c->>'cpf_cnpj','fisica',nullif(c->>'whatsapp',''),case when nullif(c->>'whatsapp','') is null then '{}'::text[] else array[c->>'whatsapp'] end,
    nullif(c->>'email',''),nullif(c->>'endereco',''),nullif(c->>'nascimento','')::date,'prospecto',false,_usuario,'clara_m1_homologacao') returning id into v_id;
 end if;
 update homologacao.clara_tarefas set estado='completed',cliente_id=v_id,decidido_por=_usuario,atualizado_em=now() where id=t.id;
 insert into homologacao.clara_eventos(tarefa_id,estado,motivo) values(t.id,'completed','Cadastro confirmado exclusivamente na homologação; produção preservada.');
 return jsonb_build_object('cliente_id',v_id,'ambiente','homologacao','processo_consultado',false);
end;$$;

create function public.clara_m1_cancelar(_usuario uuid,_tarefa uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if not public.is_interno_ativo(_usuario) or not public.is_gestor(_usuario) then raise exception 'Sem permissão' using errcode='42501';end if;
 update homologacao.clara_tarefas set estado='cancelled',decidido_por=_usuario,atualizado_em=now() where id=_tarefa and usuario_id=_usuario and estado in ('queued','failed','awaiting_input','awaiting_approval');
 if not found then return false;end if;
 insert into homologacao.clara_eventos(tarefa_id,estado,motivo) values(_tarefa,'cancelled','Cancelada pela usuária; nenhum cadastro criado.');return true;
end;$$;

create function public.clara_m1_status() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('ambiente','homologacao','habilitado',habilitado,'entrada_usd_milhao',entrada_usd_milhao,'saida_usd_milhao',saida_usd_milhao,'vigencia',vigencia) from homologacao.clara_config where id;
$$;

do $$declare f record;begin
 for f in select oid::regprocedure assinatura from pg_proc where pronamespace='public'::regnamespace and proname like 'clara_m1_%'
 loop execute format('revoke all on function %s from public,anon,authenticated',f.assinatura);execute format('grant execute on function %s to service_role',f.assinatura);end loop;
end;$$;

create function public.clara_m1_recuperar(_usuario uuid,_tarefa uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 if not public.is_interno_ativo(_usuario) or not public.is_gestor(_usuario) then raise exception 'Sem permissão' using errcode='42501';end if;
 update homologacao.clara_tarefas set estado='failed',erro='Execução interrompida. Reservas de tokens incertas foram mantidas.',atualizado_em=now()
 where id=_tarefa and usuario_id=_usuario and estado='running' and atualizado_em<now()-interval '10 minutes';
 if not found then return false;end if;
 insert into homologacao.clara_eventos(tarefa_id,estado,motivo) values(_tarefa,'failed','Interrupção confirmada após dez minutos; nova tentativa depende de ação da usuária.');return true;
end;$$;
revoke all on function public.clara_m1_recuperar(uuid,uuid) from public,anon,authenticated;
grant execute on function public.clara_m1_recuperar(uuid,uuid) to service_role;

create function homologacao.clara_cpf_valido(v text) returns boolean language plpgsql immutable strict security invoker set search_path='' as $$
declare i integer;s integer;d integer;begin
 if v!~'^[0-9]{11}$' or v=repeat(substr(v,1,1),11) then return false;end if;
 s:=0;for i in 1..9 loop s:=s+substr(v,i,1)::integer*(11-i);end loop;d:=(s*10)%11;if d=10 then d:=0;end if;
 if d<>substr(v,10,1)::integer then return false;end if;
 s:=0;for i in 1..10 loop s:=s+substr(v,i,1)::integer*(12-i);end loop;d:=(s*10)%11;if d=10 then d:=0;end if;
 return d=substr(v,11,1)::integer;
end;$$;
revoke all on function homologacao.clara_cpf_valido(text) from public,anon,authenticated;
grant execute on function homologacao.clara_cpf_valido(text) to service_role;
create index clara_tarefas_cliente on homologacao.clara_tarefas(cliente_id);
create index clara_tarefas_decisao on homologacao.clara_tarefas(decidido_por);

create function public.clara_m1_consumo(_usuario uuid,_tarefa uuid,_consumo uuid,_entrada integer,_saida integer,_custo numeric)
returns boolean language plpgsql security invoker set search_path='' as $$
declare t homologacao.clara_tarefas; c homologacao.clara_chamadas;begin
 if _entrada<0 or _saida<0 or _custo<0 then raise exception 'Consumo inválido';end if;
 select * into t from homologacao.clara_tarefas where id=_tarefa and usuario_id=_usuario for update;
 if not found or t.estado<>'running' or t.consumo_id is distinct from _consumo then return false;end if;
 select * into c from homologacao.clara_chamadas where consumo_id=_consumo and tarefa_id=_tarefa for update;
 if not found then return false;end if;
 if c.confirmado then return c.entrada=_entrada and c.saida=_saida and c.custo=_custo;end if;
 update homologacao.clara_chamadas set confirmado=true,entrada=_entrada,saida=_saida,custo=_custo where consumo_id=_consumo;
 update homologacao.clara_tarefas set tokens_entrada=(select coalesce(sum(entrada),0) from homologacao.clara_chamadas where tarefa_id=_tarefa and confirmado),
  tokens_saida=(select coalesce(sum(saida),0) from homologacao.clara_chamadas where tarefa_id=_tarefa and confirmado),
  custo_estimado_usd=(select coalesce(sum(custo),0) from homologacao.clara_chamadas where tarefa_id=_tarefa and confirmado),atualizado_em=now() where id=_tarefa;
 insert into homologacao.clara_eventos(tarefa_id,estado,motivo) values(_tarefa,'running','Tokens e custo estimado da chamada confirmados, antes da validação do resultado.');return true;
end;$$;
revoke all on function public.clara_m1_consumo(uuid,uuid,uuid,integer,integer,numeric) from public,anon,authenticated;
grant execute on function public.clara_m1_consumo(uuid,uuid,uuid,integer,integer,numeric) to service_role;
