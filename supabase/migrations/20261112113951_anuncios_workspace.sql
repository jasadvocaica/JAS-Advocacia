-- Área de preparação. Dados de pessoas nunca entram nos planos nem no histórico de operações.
create table marketing_privado.ads_planos (
 id uuid primary key default gen_random_uuid(), usuario_id uuid not null references auth.users(id),
 versao integer not null default 1, dados jsonb not null, atualizado_em timestamptz not null default now()
);
alter table marketing_privado.ads_planos enable row level security;
create index ads_planos_usuario on marketing_privado.ads_planos(usuario_id,atualizado_em desc);
create table marketing_privado.ads_operacoes (
 id uuid primary key default gen_random_uuid(),usuario_id uuid not null references auth.users(id),
 plano_id uuid references marketing_privado.ads_planos(id),versao integer,acao text not null,
 chave text not null unique,estado text not null default 'executando' check(estado in ('executando','confirmada','incerta','falhou')),
 resultado jsonb,criado_em timestamptz not null default now()
);
alter table marketing_privado.ads_operacoes enable row level security;
create index ads_operacoes_usuario on marketing_privado.ads_operacoes(usuario_id,criado_em desc);
revoke all on marketing_privado.ads_planos,marketing_privado.ads_operacoes from public,anon,authenticated;
grant all on marketing_privado.ads_planos,marketing_privado.ads_operacoes to service_role;
create function public.mkt_ads(_acao text,_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();p marketing_privado.ads_planos;v jsonb;r marketing_privado.ia_rotinas; e jsonb;m uuid;t uuid;pai uuid;anteriores uuid[]:='{}';pos integer:=0;
begin
 if u is null or not public.is_interno_ativo(u) or not public.is_gestor(u) then raise exception 'Somente a gestora ativa pode administrar anúncios' using errcode='42501';end if;
 if _acao='painel' then return jsonb_build_object('planos',(select coalesce(jsonb_agg(to_jsonb(x) order by atualizado_em desc),'[]') from marketing_privado.ads_planos x where usuario_id=u),
 'operacoes',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from(select * from marketing_privado.ads_operacoes where usuario_id=u order by criado_em desc limit 40)x));end if;
 if _acao='gerar' then
  if length(trim(coalesce(_payload->>'objetivo',''))) not between 10 and 1000 or coalesce(_payload->>'chave','') !~ '^[0-9a-f-]{36}$' then raise exception 'Descreva a campanha em até 1.000 caracteres';end if;
  perform pg_advisory_xact_lock(hashtext('jas.ads.gerar.'||u));
  select id into m from escritorio_privado.missoes where chave='auto-mkt:concorrentes:ads:'||u||':'||(_payload->>'chave');
  if m is not null then return jsonb_build_object('missao_id',m);end if;
  if exists(select 1 from escritorio_privado.missoes where solicitada_por=u and chave like 'auto-mkt:concorrentes:ads:%' and estado='aberta') then raise exception 'A equipe já está preparando uma campanha; acompanhe a missão';end if;
  if (select count(*) from escritorio_privado.missoes where solicitada_por=u and chave like 'auto-mkt:concorrentes:ads:%' and criada_em>=now()-interval '1 day')>=5 then raise exception 'Limite de cinco pedidos de campanhas por dia';end if;
  select * into r from marketing_privado.ia_rotinas where slug='concorrentes' and criada_por=u;
  if not found or exists(select 1 from jsonb_array_elements(r.etapas) e left join public.agentes_ia a on a.id=(e->>'agente_id')::uuid where a.id is null or not a.ativo or a.supervisor_id is distinct from u) then raise exception 'Equipe de Marketing indisponível';end if;
  insert into escritorio_privado.missoes(titulo,objetivo,origem,solicitada_por,prioridade,chave)
  values('Campanha proposta pela equipe de IA','Preparar campanha original para revisão: '||(_payload->>'objetivo')||'. Use a pesquisa pública e as etapas registradas. Proponha título, texto, criativo e público amplo. Verba é estimativa, nunca autorização. Não envie anúncios, contatos ou públicos à Meta. Não publique.','rotina',u,3,'auto-mkt:concorrentes:ads:'||u||':'||(_payload->>'chave')) returning id into m;
  for e in select value from jsonb_array_elements(r.etapas) loop
   insert into escritorio_privado.missao_tarefas(missao_id,pai_id,profundidade,agente_id,titulo,instrucoes,depende_de,chave)
   values(m,pai,pos,(e->>'agente_id')::uuid,e->>'titulo',case when exists(select 1 from public.agentes_ia where id=(e->>'agente_id')::uuid and nome='Theo') then left(e->>'instrucoes',3400)||E'\nNo objeto anuncio, inclua também criativo (brief visual completo) e orcamento_sugerido (somente uma estimativa numérica de teto total em reais, ou null se não houver base). Nunca confunda sugestão com orçamento aprovado. Público amplo, sem dados do CRM. Nenhuma criação externa.' else e->>'instrucoes' end,anteriores,'auto-mkt:'||m||':'||pos) returning id into t;
   anteriores:=array_append(anteriores,t);pai:=t;pos:=pos+1;
  end loop;
  return jsonb_build_object('missao_id',m);
 end if;
 if _acao<>'salvar' then raise exception 'Operação inválida';end if;
 v:=_payload->'dados';
 if jsonb_typeof(v) is distinct from 'object' or length(v::text)>25000 or nullif(trim(v->>'nome'),'') is null then raise exception 'Informe um nome e um plano válido';end if;
 if exists(select 1 from jsonb_object_keys(v) k where k not in ('nome','ideia_id','objetivo','titulo','texto','descricao','criativo','midia_url','destino','publico','pais','idade_min','idade_max','orcamento','inicio','fim','formulario_id','revisao_etica','revisao_privacidade')) then raise exception 'Campo de plano não permitido';end if;
 if nullif(_payload->>'id','') is null then insert into marketing_privado.ads_planos(usuario_id,dados) values(u,v) returning * into p;
 else
  select * into p from marketing_privado.ads_planos where id=(_payload->>'id')::uuid and usuario_id=u for update;
  if not found or p.versao is distinct from (_payload->>'versao')::integer then raise exception 'Versão mudou; reabra o plano' using errcode='40001';end if;
  if exists(select 1 from marketing_privado.ads_operacoes where plano_id=p.id and estado in ('executando','incerta')) then raise exception 'Confira a operação anterior antes de editar';end if;
  update marketing_privado.ads_planos set dados=v,versao=versao+1,atualizado_em=now() where id=p.id returning * into p;
 end if;
 return to_jsonb(p);
end;$$;
revoke all on function public.mkt_ads(text,jsonb) from public,anon;
grant execute on function public.mkt_ads(text,jsonb) to authenticated;
-- Reserva de execução única. Falha de transporte nunca libera retentativa automática.
create function public.mkt_ads_reservar(_usuario uuid,_plano uuid,_versao integer,_acao text,_chave text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare p marketing_privado.ads_planos;o marketing_privado.ads_operacoes;
begin
 if current_user<>'service_role' or not public.is_gestor(_usuario) or not public.is_interno_ativo(_usuario) then raise exception 'Backend da gestora necessário' using errcode='42501';end if;
 if _acao not in ('validar','criar_pausada','lista','semelhante') or length(_chave) not between 10 and 160 then raise exception 'Operação inválida';end if;
 if _plano is not null then
  select * into p from marketing_privado.ads_planos where id=_plano and usuario_id=_usuario for update;
  if not found or p.versao is distinct from _versao then raise exception 'Plano mudou; revise novamente' using errcode='40001';end if;
 end if;
 if _acao='criar_pausada' and not exists(select 1 from marketing_privado.ads_operacoes where plano_id=p.id and versao=p.versao and acao='validar' and estado='confirmada' and chave=replace(_chave,':criar_pausada',':validar')) then raise exception 'Valide esta versão na Meta primeiro';end if;
 insert into marketing_privado.ads_operacoes(usuario_id,plano_id,versao,acao,chave) values(_usuario,_plano,_versao,_acao,_chave) on conflict(chave) do nothing returning * into o;
 if o.id is null then raise exception 'Pedido já registrado. Consulte o histórico antes de repetir';end if;
 return jsonb_build_object('id',o.id,'dados',p.dados);
end;$$;
create function public.mkt_ads_finalizar(_id uuid,_estado text,_resultado jsonb) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 if current_user<>'service_role' then raise exception 'Somente backend' using errcode='42501';end if;
 if _estado not in ('confirmada','incerta','falhou') or jsonb_typeof(_resultado) is distinct from 'object' or length(_resultado::text)>4000 then raise exception 'Resultado inválido';end if;
 update marketing_privado.ads_operacoes set estado=_estado,resultado=_resultado where id=_id and estado='executando';return found;
end;$$;
revoke all on function public.mkt_ads_reservar(uuid,uuid,integer,text,text),public.mkt_ads_finalizar(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.mkt_ads_reservar(uuid,uuid,integer,text,text),public.mkt_ads_finalizar(uuid,text,jsonb) to service_role;

-- Preserva o brief e a estimativa retornados pelo estrategista, sem inventar valores ausentes.
do $$declare d text; a text:='''publico_proposto'',publico,';begin
 select pg_get_functiondef('marketing_privado.cadastrar_estrategia_ia(uuid)'::regprocedure) into d;
 if position(a in d)=0 then raise exception 'Contrato editorial mudou; revisar integração';end if;
 execute replace(d,a,'''criativo_proposto'',nullif(j->''anuncio''->>''criativo'',''''),''orcamento_sugerido'',case when (j->''anuncio''->>''orcamento_sugerido'') ~ ''^[0-9]+([.][0-9]{1,2})?$'' then j->''anuncio''->>''orcamento_sugerido'' else null end,'||a);
end;$$;
