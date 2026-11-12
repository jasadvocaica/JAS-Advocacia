create table escritorio_privado.telegram_manu_entregas(
 id uuid primary key default gen_random_uuid(),usuario_id uuid not null,chat_id bigint not null check(chat_id>0),
 chave text not null,documento jsonb not null,partes jsonb not null default '{}',aguardando_ajustes boolean not null default false,
 ultima_revisao uuid references escritorio_privado.telegram_entradas(id),criado_em timestamptz not null default now(),unique(chat_id,chave)
);
alter table escritorio_privado.telegram_manu_entregas enable row level security;
revoke all on escritorio_privado.telegram_manu_entregas from public,anon,authenticated;
grant all on escritorio_privado.telegram_manu_entregas to service_role;
alter table escritorio_privado.telegram_entradas add column origem_entrega uuid references escritorio_privado.telegram_manu_entregas(id);

create function public.telegram_manu_registrar(_chat bigint,_chave text,_documento jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare u uuid;v uuid;
begin
 if current_user<>'service_role' then raise exception 'Somente backend' using errcode='42501';end if;
 u:=public.telegram_usuario(_chat);if u is null or _chat<=0 then raise exception 'Vínculo privado ativo necessário' using errcode='42501';end if;
 if _chave is null or length(_chave)>160 or jsonb_typeof(_documento) is distinct from 'object' or length(_documento::text)>200000 then raise exception 'Entrega inválida';end if;
 insert into escritorio_privado.telegram_manu_entregas(usuario_id,chat_id,chave,documento) values(u,_chat,_chave,_documento)
 on conflict(chat_id,chave) do update set chave=excluded.chave where telegram_manu_entregas.usuario_id=excluded.usuario_id returning id into v;
 if v is null then raise exception 'Vínculo alterado' using errcode='42501';end if;return v;
end;$$;
-- Texto para gravação não pode ser concluído como mera lista de ideias.
create function escritorio_privado.telegram_manu_validar_roteiro() returns trigger language plpgsql security definer set search_path='' as $$
declare j jsonb;objetivo text;
begin
 if new.estado<>'concluida' or old.estado='concluida' then return new;end if;
 select m.objetivo into objetivo from escritorio_privado.missoes m join public.agentes_ia a on a.id=new.agente_id where m.id=new.missao_id and a.nome='Camila' and m.chave like 'auto-mkt:%';
 if objetivo is null or objetivo !~* '(roteiro|grav|reels|vídeo|video)' then return new;end if;
 begin j:=(new.resultado->>'entrega')::jsonb;exception when others then raise exception 'Roteiro deve usar o formato editorial';end;
 if exists(select 1 from unnest(array['titulo','publico','objetivo','duracao','gancho','texto_falado','cta','orientacoes_gravacao','legenda','revisao_necessaria']) k where jsonb_typeof(j->k) is distinct from 'string' or length(trim(j->>k))<3)
 or length(j->>'texto_falado')<100 or length(j->>'legenda')<50 then raise exception 'Roteiro incompleto: faltam fala integral ou campos obrigatórios do padrão Manu';end if;
 return new;
end;$$;
revoke all on function escritorio_privado.telegram_manu_validar_roteiro() from public,anon,authenticated;
create trigger telegram_manu_validar_roteiro before update of estado on escritorio_privado.missao_tarefas for each row execute function escritorio_privado.telegram_manu_validar_roteiro();
create function public.telegram_manu_parte(_entrega uuid,_numero integer,_estado text default null,_reserva uuid default null,_mensagem bigint default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare e escritorio_privado.telegram_manu_entregas;p jsonb;r uuid;
begin
 if current_user<>'service_role' then raise exception 'Somente backend' using errcode='42501';end if;
 select * into e from escritorio_privado.telegram_manu_entregas where id=_entrega for update;
 if not found or public.telegram_usuario(e.chat_id) is distinct from e.usuario_id then raise exception 'Entrega não autorizada' using errcode='42501';end if;
 if _numero is null or _numero not between 0 and 99 then raise exception 'Parte inválida';end if;p:=e.partes->_numero::text;
 if _estado is null then
  if p->>'estado'='enviada' then return p;end if;
  if p->>'estado'='incerta' or (p->>'estado'='reservada' and (p->>'ate')::timestamptz<now()) then raise exception 'Entrega sem confirmação; não repetir';end if;
  if p->>'estado'='reservada' then return jsonb_build_object('estado','ocupada');end if;
  r:=gen_random_uuid();p:=jsonb_build_object('estado','reservada','reserva',r,'ate',now()+interval '2 minutes');
 else
  if p is null or p->>'reserva' is distinct from _reserva::text or p->>'estado'<>'reservada' or _estado not in('enviada','pendente','incerta','falhou') or (_estado='enviada' and coalesce(_mensagem,0)<=0) then raise exception 'Confirmação inválida';end if;
  p:=p||jsonb_build_object('estado',_estado,'mensagem_id',_mensagem);
 end if;
 update escritorio_privado.telegram_manu_entregas set partes=jsonb_set(partes,array[_numero::text],p,true) where id=e.id;return p;
end;$$;
create function public.telegram_manu_consultar(_chat bigint,_entrega uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare e escritorio_privado.telegram_manu_entregas;
begin
 if current_user<>'service_role' then raise exception 'Somente backend' using errcode='42501';end if;
 select * into e from escritorio_privado.telegram_manu_entregas where id=_entrega and chat_id=_chat and usuario_id=public.telegram_usuario(_chat);
 if not found then raise exception 'Entrega não autorizada' using errcode='42501';end if;return e.documento;
end;$$;
create function public.telegram_manu_missao(_chat bigint,_missao uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare u uuid;m escritorio_privado.missoes;t record;
begin
 if current_user<>'service_role' then raise exception 'Somente backend' using errcode='42501';end if;
 u:=public.telegram_usuario(_chat);select * into m from escritorio_privado.missoes where id=_missao and solicitada_por=u;
 if not found or u is null then raise exception 'Missão não autorizada' using errcode='42501';end if;
 select mt.*,a.nome,a.sala into t from escritorio_privado.missao_tarefas mt join public.agentes_ia a on a.id=mt.agente_id
 where mt.missao_id=m.id and mt.estado='concluida' order by (a.nome='Camila') desc,mt.concluida_em desc limit 1;
 return jsonb_build_object('titulo',m.titulo,'objetivo',m.objetivo,'estado',m.estado,'missao_id',m.id,'agente',t.nome,'sala',t.sala,'referencia',t.concluida_em,'resultado',t.resultado,
 'item',(select jsonb_build_object('id',i.id,'tipo',i.tipo,'versao',i.versao,'status',i.status) from public.mkt_itens i where i.dados->>'tarefa_ia_id'=t.id::text and i.tipo='pauta' and i.arquivado_em is null limit 1));
end;$$;

-- Ajustes e novas versões continuam internos; aprovação só da pauta e da versão exibida.
create function public.telegram_manu_acao(_chat bigint,_entrega uuid,_acao text,_feedback text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare e escritorio_privado.telegram_manu_entregas;u uuid;i public.mkt_itens;old_uid text;pedido uuid;texto text;validacao jsonb;
begin
 if current_user<>'service_role' then raise exception 'Somente backend' using errcode='42501';end if;
 u:=public.telegram_usuario(_chat);select * into e from escritorio_privado.telegram_manu_entregas where id=_entrega and chat_id=_chat and usuario_id=u for update;
 if not found or u is null then raise exception 'Entrega não autorizada' using errcode='42501';end if;
 if _acao not in('ajustes','nova','feedback','aprovar') then raise exception 'Ação inválida';end if;
 if _acao='ajustes' then
  update escritorio_privado.telegram_manu_entregas set aguardando_ajustes=false where chat_id=_chat and usuario_id=u;
  update escritorio_privado.telegram_manu_entregas set aguardando_ajustes=true where id=e.id;
  return jsonb_build_object('resposta','Quais ajustes você deseja? Envie uma mensagem de texto com as alterações; vou registrar uma nova entrega para revisão.');
 end if;
 if _acao='feedback' and not e.aguardando_ajustes then raise exception 'Pedido de ajustes não está ativo';end if;
 if _acao<>'aprovar' and length(coalesce(e.documento->>'objetivo',''))<3 then raise exception 'Esta entrega não gera nova versão por IA; consulte os dados atualizados no JAS';end if;
 if _acao<>'aprovar' and e.ultima_revisao is not null and exists(select 1 from escritorio_privado.telegram_entradas p left join escritorio_privado.missoes m on m.id=p.missao_id where p.id=e.ultima_revisao and (p.estado in('pendente','processando') or m.estado='aberta')) then
  update escritorio_privado.telegram_manu_entregas set aguardando_ajustes=false where id=e.id;
  return jsonb_build_object('resposta','Uma nova versão desta entrega já está na fila ou em execução. Consulte /andamento.');
 end if;
 if e.documento->>'item_id' is not null then
  select * into i from public.mkt_itens where id=(e.documento->>'item_id')::uuid for update;
  if not found or i.tipo<>'pauta' or i.versao is distinct from (e.documento->>'item_versao')::integer then raise exception 'A versão mudou; consulte o item atual no JAS';end if;
  old_uid:=current_setting('request.jwt.claim.sub',true);perform set_config('request.jwt.claim.sub',u::text,true);
  begin
   if _acao='aprovar' then
    validacao:=public.mkt_operar('decidir',jsonb_build_object('id',i.id,'versao',i.versao,'resultado','aprovado'));
   elsif i.status='aguardando_aprovacao' then
    validacao:=public.mkt_operar('decidir',jsonb_build_object('id',i.id,'versao',i.versao,'resultado','ajustes','justificativa',coalesce(nullif(_feedback,''),'Nova versão solicitada pela diretoria no Telegram')));
   elsif i.status<>'publicado' then
    validacao:=public.mkt_operar('salvar',to_jsonb(i)||jsonb_build_object('dados',i.dados||jsonb_build_object('revisao_telegram_solicitada_em',now())));
   end if;
   perform set_config('request.jwt.claim.sub',coalesce(old_uid,''),true);
  exception when others then perform set_config('request.jwt.claim.sub',coalesce(old_uid,''),true);raise;end;
 elsif _acao='aprovar' then raise exception 'Não há pauta elegível para aprovação nesta entrega';end if;
 if _acao='aprovar' then
  if not exists(select 1 from public.mkt_itens where id=i.id and status='aprovado' and versao_aprovada=versao) then raise exception 'Aprovação não confirmada';end if;
  return jsonb_build_object('resposta','Pauta aprovada e confirmada no JAS. O material final continua exigindo revisão e aprovação próprias. Nenhuma publicação foi realizada.');
 end if;
 if e.ultima_revisao is not null and exists(select 1 from escritorio_privado.telegram_entradas p left join escritorio_privado.missoes m on m.id=p.missao_id where p.id=e.ultima_revisao and (p.estado in('pendente','processando') or m.estado='aberta')) then
  return jsonb_build_object('resposta','Uma nova versão desta entrega já está na fila ou em execução. Consulte /andamento.');
 end if;
 if length(coalesce(_feedback,''))>2000 then raise exception 'Descreva ajustes em até 2000 caracteres';end if;
 texto:='Prepare nova versão, para minha revisão, do seguinte pedido original: '||(e.documento->>'objetivo')||E'\nAjustes solicitados: '||coalesce(nullif(_feedback,''),'Apresente uma alternativa original mantendo o objetivo, sem publicar.');
 pedido:=public.telegram_receber_pedido('acao:'||gen_random_uuid(),_chat,texto,null);
 update escritorio_privado.telegram_entradas set origem_entrega=e.id where id=pedido;
 update escritorio_privado.telegram_manu_entregas set aguardando_ajustes=false,ultima_revisao=pedido where id=e.id;
 return jsonb_build_object('resposta','Nova entrega registrada na fila para revisão. A versão anterior permanece no histórico; nenhuma ação externa foi aprovada.','pedido_id',pedido);
end;$$;
create function public.telegram_manu_feedback(_chat bigint,_texto text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare e uuid;
begin
 if current_user<>'service_role' then raise exception 'Somente backend' using errcode='42501';end if;
 select id into e from escritorio_privado.telegram_manu_entregas where chat_id=_chat and usuario_id=public.telegram_usuario(_chat) and aguardando_ajustes and criado_em>now()-interval '24 hours' order by criado_em desc limit 1 for update;
 if e is null then return null;end if;return public.telegram_manu_acao(_chat,e,'feedback',_texto);
end;$$;
do $$declare d text;begin
 d:=pg_get_functiondef('public.telegram_receber_pedido(text,bigint,text,jsonb)'::regprocedure);
 execute replace(d,'teste:[0-9a-f-]{36}','(teste|acao):[0-9a-f-]{36}');
end;$$;
revoke all on function public.telegram_manu_registrar(bigint,text,jsonb),public.telegram_manu_parte(uuid,integer,text,uuid,bigint),public.telegram_manu_consultar(bigint,uuid),public.telegram_manu_missao(bigint,uuid),public.telegram_manu_acao(bigint,uuid,text,text),public.telegram_manu_feedback(bigint,text) from public,anon,authenticated;
grant execute on function public.telegram_manu_registrar(bigint,text,jsonb),public.telegram_manu_parte(uuid,integer,text,uuid,bigint),public.telegram_manu_consultar(bigint,uuid),public.telegram_manu_missao(bigint,uuid),public.telegram_manu_acao(bigint,uuid,text,text),public.telegram_manu_feedback(bigint,text) to service_role;

-- Formato editorial obrigatório para solicitações novas e para as pendentes deste canal.
create function escritorio_privado.telegram_instrucao_roteiro() returns text language sql immutable set search_path='' as $$select ' PADRÃO OFICIAL MANU: quando houver roteiro para gravar, entregue texto integral falado, não apenas tópicos. Acrescente ao JSON editorial as chaves texto_falado (fala pronta, natural), duracao (tempo estimado explicitamente), cta (encerramento pronto) e orientacoes_gravacao. Mantenha titulo, publico, objetivo, gancho, legenda pronta, roteiro com a fala integral, brief_visual e revisao_necessaria. Sem promessas de resultado, sensacionalismo ou captação indevida. Indique que revisão jurídica/OAB e aprovação ainda estão pendentes. Não invente fato, métrica ou confirmação.'::text$$;
revoke all on function escritorio_privado.telegram_instrucao_roteiro() from public,anon,authenticated;
grant execute on function escritorio_privado.telegram_instrucao_roteiro() to service_role;
do $$declare d text;alvo text:='   else instrucao:=instrucao||';begin
 d:=pg_get_functiondef('public.telegram_concluir_pedido(uuid,uuid,text,jsonb,text,boolean)'::regprocedure);
 if strpos(d,alvo)=0 then raise exception 'Contrato editorial mudou';end if;
 execute replace(d,alvo,'   instrucao:=left(instrucao,4000-length(escritorio_privado.telegram_instrucao_roteiro()))||escritorio_privado.telegram_instrucao_roteiro();'||E'\n'||alvo);
end;$$;
update escritorio_privado.missao_tarefas t set instrucoes=left(t.instrucoes,4000-length(escritorio_privado.telegram_instrucao_roteiro()))||escritorio_privado.telegram_instrucao_roteiro()
  from escritorio_privado.missoes m,public.agentes_ia a where m.id=t.missao_id and a.id=t.agente_id and a.nome='Camila' and t.estado='pendente' and m.chave like 'auto-mkt:%';
update marketing_privado.ia_rotinas r set etapas=(select jsonb_agg(case when a.nome='Camila' then jsonb_set(x.etapa,'{instrucoes}',to_jsonb(left(x.etapa->>'instrucoes',3000)||escritorio_privado.telegram_instrucao_roteiro())) else x.etapa end order by x.pos)
 from jsonb_array_elements(r.etapas) with ordinality x(etapa,pos) left join public.agentes_ia a on a.id=(x.etapa->>'agente_id')::uuid)
 where exists(select 1 from jsonb_array_elements(r.etapas) e join public.agentes_ia a on a.id=(e->>'agente_id')::uuid where a.nome='Camila');

create function escritorio_privado.telegram_manu_encaminhar() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.estado not in('concluida','falhou') or new.estado=old.estado then return new;end if;
 if not (new.chave like 'auto-mkt:%' or new.chave like 'auto-backoffice:%') or exists(select 1 from escritorio_privado.telegram_entradas where missao_id=new.id) then return new;end if;
 if exists(select 1 from escritorio_privado.operacao24h_config where usuario_id=new.solicitada_por and ativo and telegram_ativo) then
  perform escritorio_privado.operacao24h_enfileirar(new.solicitada_por,'missao','entrega:'||new.id||':'||new.estado,jsonb_build_object('missao_id',new.id,'titulo',new.titulo,'estado',new.estado));
 end if;return new;
end;$$;
revoke all on function escritorio_privado.telegram_manu_encaminhar() from public,anon,authenticated;
create trigger telegram_manu_encaminhar after update of estado on escritorio_privado.missoes for each row execute function escritorio_privado.telegram_manu_encaminhar();

do $$declare d text;alvo text:='''fila_pendente'',';begin
 d:=pg_get_functiondef('escritorio_privado.operacao24h_dados(uuid)'::regprocedure);
 if strpos(d,alvo)=0 then raise exception 'Contrato do relatório mudou';end if;
 execute replace(d,alvo,$patch$'responsaveis_tarefas',(select coalesce(jsonb_agg(x),'[]') from(select coalesce(p.nome,case when c.responsavel_id is null then 'Não atribuído' else 'Identificação pendente' end) nome,count(*) quantidade from public.controladoria_itens c left join public.profiles p on p.id=c.responsavel_id where c.status not in('concluido','cancelado') group by p.nome,c.responsavel_id order by count(*) desc limit 10)x),'fila_pendente',$patch$);
end;$$;
