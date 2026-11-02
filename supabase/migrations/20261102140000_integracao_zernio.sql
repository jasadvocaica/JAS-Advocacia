-- Integração Zernio (Instagram e Meta Ads). Tudo em marketing_privado, sem acesso direto do navegador:
-- a tela e os agentes leem pela Edge Function `zernio`, que confere a pessoa antes.
-- Nasce sem chave, com coleta e sincronização automática DESLIGADAS. Publicação, resposta automática e
-- alteração de anúncios ficam travadas (check) até haver decisão e implementação próprias.
create schema if not exists marketing_privado;
revoke all on schema marketing_privado from public, anon;
grant usage on schema marketing_privado to service_role;

create table marketing_privado.zernio_conexoes (
  id boolean primary key default true check (id),
  chave_cifrada text,
  chave_mascara text,
  chave_salva_em timestamptz,
  chave_salva_por uuid,
  estado text not null default 'aguardando'
    check (estado in ('aguardando','conectado','erro_autenticacao','erro','revogada')),
  ultimo_teste_em timestamptz,
  ultimo_erro text,
  addon_analytics boolean,
  addon_inbox boolean,
  addon_ads boolean,
  coleta_ativa boolean not null default false,
  analises_ativas boolean not null default false,
  sync_automatico boolean not null default false,
  intervalo_minutos integer not null default 360 check (intervalo_minutos between 60 and 1440),
  acoes_externas_com_aprovacao boolean not null default false,
  publicacao_automatica boolean not null default false check (not publicacao_automatica),
  resposta_automatica boolean not null default false check (not resposta_automatica),
  alteracao_anuncios boolean not null default false check (not alteracao_anuncios),
  retencao_dias integer not null default 365 check (retencao_dias between 30 and 730),
  retencao_mensagens_dias integer not null default 90 check (retencao_mensagens_dias between 7 and 365),
  ultima_sync_em timestamptz,
  ultima_sync_ok_em timestamptz,
  atualizado_em timestamptz not null default now()
);
insert into marketing_privado.zernio_conexoes default values;

create table marketing_privado.zernio_contas (
  id uuid primary key default gen_random_uuid(),
  externo_id text not null unique,
  plataforma text not null,
  perfil_id text,
  usuario text,
  nome text,
  foto_url text,
  url_perfil text,
  plataforma_usuario_id text,
  ativa boolean not null default false,
  precisa_reconectar boolean not null default false,
  seguidores integer,
  seguidores_em timestamptz,
  conta_pai_externa text,
  selecionada boolean not null default true,
  primeira_vista_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table marketing_privado.zernio_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  origem text not null check (origem in ('manual','automatico')),
  estado text not null default 'pendente'
    check (estado in ('pendente','executando','concluido','parcial','falhou','cancelado')),
  etapa_atual text,
  cursores jsonb not null default '{}',
  progresso jsonb not null default '{}',
  tentativas smallint not null default 0,
  max_tentativas smallint not null default 3,
  reservado_ate timestamptz,
  proxima_tentativa_em timestamptz not null default now(),
  solicitado_por uuid,
  erro text,
  criado_em timestamptz not null default now(),
  iniciado_em timestamptz,
  finalizado_em timestamptz
);
-- No máximo um job ativo: pedir de novo devolve o mesmo (sem execução duplicada).
create unique index zernio_um_job_ativo on marketing_privado.zernio_sync_jobs ((true))
  where estado in ('pendente','executando');

create table marketing_privado.zernio_sync_logs (
  id bigserial primary key,
  job_id uuid references marketing_privado.zernio_sync_jobs(id) on delete cascade,
  nivel text not null check (nivel in ('info','aviso','erro')),
  recurso text,
  mensagem text not null check (char_length(mensagem) <= 1000),
  http_status integer,
  criado_em timestamptz not null default now()
);

create table marketing_privado.zernio_posts (
  id uuid primary key default gen_random_uuid(),
  externo_id text not null unique,
  conta_externa_id text,
  plataforma text not null,
  origem text not null default 'zernio' check (origem in ('zernio','externo')),
  conteudo text,
  url text,
  tipo_midia text,
  thumbnail text,
  publicado_em timestamptz,
  estado text,
  coletado_em timestamptz not null default now()
);
create index zernio_posts_publicado on marketing_privado.zernio_posts(publicado_em desc);

-- Histórico: uma linha por publicação por dia de coleta (repetir no mesmo dia atualiza, não duplica).
create table marketing_privado.zernio_post_metricas (
  post_id uuid not null references marketing_privado.zernio_posts(id) on delete cascade,
  data date not null,
  impressoes bigint, alcance bigint, curtidas bigint, comentarios bigint, compartilhamentos bigint,
  salvamentos bigint, cliques bigint, visualizacoes bigint, taxa_engajamento numeric(8,4),
  atualizado_plataforma timestamptz,
  coletado_em timestamptz not null default now(),
  primary key (post_id, data)
);

create table marketing_privado.zernio_comentarios (
  id uuid primary key default gen_random_uuid(),
  externo_id text not null unique,
  comentario_id text not null,
  post_externo_id text not null,
  conta_externa_id text,
  plataforma text not null,
  autor_nome text,
  autor_usuario text,
  autor_id text,
  do_escritorio boolean not null default false,
  texto text,
  criado_em_plataforma timestamptz,
  curtidas integer,
  respostas integer,
  pai_externo_id text,
  oculto boolean not null default false,
  pode_responder boolean not null default false,
  coletado_em timestamptz not null default now()
);
create index zernio_comentarios_recentes on marketing_privado.zernio_comentarios(criado_em_plataforma desc);

create table marketing_privado.zernio_conversas (
  id uuid primary key default gen_random_uuid(),
  externo_id text not null unique,
  conta_externa_id text,
  plataforma text not null,
  participante_nome text,
  participante_id text,
  ultima_mensagem text check (char_length(ultima_mensagem) <= 500),
  atualizado_plataforma timestamptz,
  estado text,
  nao_lidas integer,
  coletado_em timestamptz not null default now()
);

create table marketing_privado.zernio_campanhas (
  id uuid primary key default gen_random_uuid(),
  externo_id text not null unique,
  conta_externa_id text,
  conta_anuncio_id text,
  nome text,
  estado text,
  objetivo text,
  orcamento jsonb,
  moeda text,
  metricas jsonb,
  periodo_de date,
  periodo_ate date,
  atualizado_em timestamptz not null default now()
);

create table marketing_privado.zernio_conjuntos (
  id uuid primary key default gen_random_uuid(),
  externo_id text not null unique,
  campanha_externa_id text,
  nome text,
  estado text,
  orcamento jsonb,
  otimizacao text,
  moeda text,
  atualizado_em timestamptz not null default now()
);

create table marketing_privado.zernio_anuncios (
  id uuid primary key default gen_random_uuid(),
  externo_id text not null unique,
  zernio_id text,
  campanha_externa_id text,
  conjunto_externo_id text,
  nome text,
  estado text,
  tipo text,
  criativo jsonb,
  moeda text,
  metricas jsonb,
  periodo_de date,
  periodo_ate date,
  atualizado_em timestamptz not null default now()
);

-- Métricas diárias de anúncios (por conta de anúncios; nível "anuncio" reservado para quando houver série por anúncio).
create table marketing_privado.zernio_anuncio_metricas (
  nivel text not null check (nivel in ('conta','anuncio')),
  referencia text not null,
  data date not null,
  moeda text not null default '',
  gasto numeric(14,4), impressoes bigint, alcance bigint, cliques bigint,
  ctr numeric(10,4), cpc numeric(14,4), cpm numeric(14,4), conversoes numeric(14,4),
  extras jsonb not null default '{}',
  coletado_em timestamptz not null default now(),
  primary key (nivel, referencia, data, moeda)
);

-- ---------------------------------------------------------------- conexão e credencial
create function public.zernio_conexao(_com_cifra boolean default false)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare c marketing_privado.zernio_conexoes;
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  select * into c from marketing_privado.zernio_conexoes;
  return (to_jsonb(c) - 'chave_cifrada' - 'id')
    || jsonb_build_object('tem_chave', c.chave_cifrada is not null)
    || case when _com_cifra then jsonb_build_object('chave_cifrada', c.chave_cifrada) else '{}'::jsonb end;
end $$;

create function public.zernio_salvar_chave(_usuario uuid, _cifrada text, _mascara text)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  if not public.is_gestor(_usuario) or not public.is_interno_ativo(_usuario) then
    raise exception 'Só a administração configura a credencial' using errcode='42501';
  end if;
  if _cifrada is null or _cifrada !~ '^v1\.' then raise exception 'Credencial deve chegar cifrada'; end if;
  update marketing_privado.zernio_conexoes
    set chave_cifrada=_cifrada, chave_mascara=left(_mascara,20), chave_salva_em=now(), chave_salva_por=_usuario,
        estado='aguardando', ultimo_erro=null, atualizado_em=now() where id;
  perform escritorio_privado.auditar('usuario', _usuario, 'zernio.chave_salva', null, jsonb_build_object('mascara', left(_mascara,20)));
end $$;

create function public.zernio_revogar(_usuario uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  if not public.is_gestor(_usuario) or not public.is_interno_ativo(_usuario) then
    raise exception 'Só a administração revoga a credencial' using errcode='42501';
  end if;
  update marketing_privado.zernio_conexoes
    set chave_cifrada=null, chave_mascara=null, estado='revogada', coleta_ativa=false, sync_automatico=false,
        acoes_externas_com_aprovacao=false, atualizado_em=now() where id;
  update marketing_privado.zernio_sync_jobs set estado='cancelado', finalizado_em=now(), erro='Credencial revogada'
    where estado in ('pendente','executando');
  perform escritorio_privado.auditar('usuario', _usuario, 'zernio.chave_revogada', null, '{}');
end $$;

create function public.zernio_registrar_teste(_estado text, _erro text, _addons jsonb default '{}')
returns void language plpgsql security invoker set search_path='' as $$
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  update marketing_privado.zernio_conexoes
    set estado=_estado, ultimo_erro=left(_erro,1000), ultimo_teste_em=now(),
        addon_analytics=coalesce((_addons->>'analytics')::boolean, addon_analytics),
        addon_inbox=coalesce((_addons->>'inbox')::boolean, addon_inbox),
        addon_ads=coalesce((_addons->>'ads')::boolean, addon_ads),
        atualizado_em=now() where id;
end $$;

-- Só os campos que a administração pode mudar; os travados ficam de fora.
create function public.zernio_configurar(_usuario uuid, _cfg jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  if not public.is_gestor(_usuario) or not public.is_interno_ativo(_usuario) then
    raise exception 'Só a administração altera a integração' using errcode='42501';
  end if;
  if exists(select 1 from jsonb_object_keys(_cfg) k where k not in
     ('coleta_ativa','analises_ativas','sync_automatico','intervalo_minutos','acoes_externas_com_aprovacao',
      'retencao_dias','retencao_mensagens_dias','contas_selecionadas')) then
    raise exception 'Campo não configurável';
  end if;
  update marketing_privado.zernio_conexoes set
    coleta_ativa = coalesce((_cfg->>'coleta_ativa')::boolean, coleta_ativa),
    analises_ativas = coalesce((_cfg->>'analises_ativas')::boolean, analises_ativas),
    sync_automatico = coalesce((_cfg->>'sync_automatico')::boolean, sync_automatico),
    intervalo_minutos = coalesce((_cfg->>'intervalo_minutos')::integer, intervalo_minutos),
    acoes_externas_com_aprovacao = coalesce((_cfg->>'acoes_externas_com_aprovacao')::boolean, acoes_externas_com_aprovacao),
    retencao_dias = coalesce((_cfg->>'retencao_dias')::integer, retencao_dias),
    retencao_mensagens_dias = coalesce((_cfg->>'retencao_mensagens_dias')::integer, retencao_mensagens_dias),
    atualizado_em = now()
  where id;
  if _cfg ? 'contas_selecionadas' then
    update marketing_privado.zernio_contas
      set selecionada = externo_id in (select jsonb_array_elements_text(_cfg->'contas_selecionadas'));
  end if;
  perform escritorio_privado.auditar('usuario', _usuario, 'zernio.configurado', null, _cfg);
  return public.zernio_conexao();
end $$;

-- ---------------------------------------------------------------- fila de sincronização
create function public.zernio_job_criar(_usuario uuid, _origem text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid; c marketing_privado.zernio_conexoes;
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  select * into c from marketing_privado.zernio_conexoes;
  if c.chave_cifrada is null then raise exception 'Aguardando configuração da API'; end if;
  if not c.coleta_ativa then raise exception 'Coleta de dados desligada nas configurações'; end if;
  if _origem = 'manual' and not (public.is_gestor(_usuario) and public.is_interno_ativo(_usuario)) then
    raise exception 'Só a administração inicia sincronização' using errcode='42501';
  end if;
  select id into v_id from marketing_privado.zernio_sync_jobs where estado in ('pendente','executando');
  if found then return v_id; end if;
  insert into marketing_privado.zernio_sync_jobs(origem, solicitado_por) values(_origem, _usuario)
    on conflict do nothing returning id into v_id;
  if v_id is null then select id into v_id from marketing_privado.zernio_sync_jobs where estado in ('pendente','executando'); end if;
  return v_id;
end $$;

-- Reserva o job com lease; lease vencido (worker caiu) volta a valer com o cursor salvo.
create function public.zernio_job_reservar(_lease_segundos integer default 120)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j marketing_privado.zernio_sync_jobs;
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  select * into j from marketing_privado.zernio_sync_jobs
   where (estado='pendente' and proxima_tentativa_em <= now())
      or (estado='executando' and reservado_ate < now())
   for update skip locked limit 1;
  if not found then return null; end if;
  if j.tentativas >= j.max_tentativas and j.estado = 'executando' then
    update marketing_privado.zernio_sync_jobs set estado='falhou', finalizado_em=now(), erro='Interrompido repetidas vezes'
      where id=j.id;
    return null;
  end if;
  update marketing_privado.zernio_sync_jobs
    set estado='executando', tentativas=tentativas+1, reservado_ate=now()+make_interval(secs=>_lease_segundos),
        iniciado_em=coalesce(iniciado_em, now())
    where id=j.id returning * into j;
  return to_jsonb(j) || jsonb_build_object('ultimo_ok', (select ultima_sync_ok_em from marketing_privado.zernio_conexoes));
end $$;

create function public.zernio_job_progresso(_job uuid, _etapa text, _cursores jsonb, _progresso jsonb, _lease_segundos integer default 120)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  update marketing_privado.zernio_sync_jobs
    set etapa_atual=_etapa, cursores=_cursores, progresso=_progresso, reservado_ate=now()+make_interval(secs=>_lease_segundos)
    where id=_job and estado='executando';
  return found;
end $$;

-- estado: concluido | parcial | falhou | continua (volta para a fila) | adiado (rate limit: _esperar segundos)
create function public.zernio_job_finalizar(_job uuid, _estado text, _erro text default null, _esperar integer default 0)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  if _estado in ('continua','adiado') then
    update marketing_privado.zernio_sync_jobs
      set estado='pendente', reservado_ate=null, erro=left(_erro,1000),
          tentativas=case when _estado='continua' then 0 else tentativas end,
          proxima_tentativa_em=now()+make_interval(secs=>greatest(0,_esperar))
      where id=_job and estado='executando';
    return found;
  end if;
  if _estado not in ('concluido','parcial','falhou') then raise exception 'Estado inválido'; end if;
  update marketing_privado.zernio_sync_jobs
    set estado=_estado, erro=left(_erro,1000), finalizado_em=now(), reservado_ate=null
    where id=_job and estado='executando';
  if not found then return false; end if;
  update marketing_privado.zernio_conexoes
    set ultima_sync_em=now(),
        ultima_sync_ok_em=case when _estado in ('concluido','parcial') then now() else ultima_sync_ok_em end,
        estado=case when _estado='falhou' and _erro ilike '%chave%' then 'erro_autenticacao'
                    when _estado in ('concluido','parcial') then 'conectado' else estado end,
        ultimo_erro=case when _estado='concluido' then null else left(_erro,1000) end
    where id;
  return true;
end $$;

create function public.zernio_log(_job uuid, _nivel text, _recurso text, _mensagem text, _http integer default null)
returns void language sql security invoker set search_path='' as $$
  insert into marketing_privado.zernio_sync_logs(job_id,nivel,recurso,mensagem,http_status)
  values(_job,_nivel,_recurso,left(regexp_replace(_mensagem,'sk_[0-9A-Za-z]{8,}','sk_•••','g'),1000),_http)
$$;

-- ---------------------------------------------------------------- gravação idempotente (upsert por id externo)
create function public.zernio_gravar(_recurso text, _linhas jsonb)
returns integer language plpgsql security invoker set search_path='' as $$
declare n integer := 0; r jsonb; v_post uuid;
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  if jsonb_typeof(_linhas) <> 'array' then raise exception 'Linhas devem ser uma lista'; end if;
  for r in select * from jsonb_array_elements(_linhas) loop
    case _recurso
    when 'contas' then
      insert into marketing_privado.zernio_contas(externo_id,plataforma,perfil_id,usuario,nome,foto_url,url_perfil,
          plataforma_usuario_id,ativa,precisa_reconectar,seguidores,seguidores_em,conta_pai_externa)
      values(r->>'externo_id',r->>'plataforma',r->>'perfil_id',r->>'usuario',r->>'nome',r->>'foto_url',r->>'url_perfil',
          r->>'plataforma_usuario_id',coalesce((r->>'ativa')::boolean,false),coalesce((r->>'precisa_reconectar')::boolean,false),
          (r->>'seguidores')::integer,(r->>'seguidores_em')::timestamptz,r->>'conta_pai_externa')
      on conflict (externo_id) do update set plataforma=excluded.plataforma, perfil_id=excluded.perfil_id,
          usuario=excluded.usuario, nome=excluded.nome, foto_url=excluded.foto_url, url_perfil=excluded.url_perfil,
          ativa=excluded.ativa, precisa_reconectar=excluded.precisa_reconectar,
          seguidores=coalesce(excluded.seguidores, marketing_privado.zernio_contas.seguidores),
          seguidores_em=coalesce(excluded.seguidores_em, marketing_privado.zernio_contas.seguidores_em),
          conta_pai_externa=excluded.conta_pai_externa, atualizado_em=now();
    when 'publicacoes' then
      insert into marketing_privado.zernio_posts(externo_id,conta_externa_id,plataforma,origem,conteudo,url,tipo_midia,thumbnail,publicado_em,estado)
      values(r->>'externo_id',r->>'conta_externa_id',coalesce(r->>'plataforma','instagram'),coalesce(r->>'origem','zernio'),
          r->>'conteudo',r->>'url',r->>'tipo_midia',r->>'thumbnail',(r->>'publicado_em')::timestamptz,r->>'estado')
      on conflict (externo_id) do update set conteudo=excluded.conteudo, url=coalesce(excluded.url, marketing_privado.zernio_posts.url),
          tipo_midia=excluded.tipo_midia, thumbnail=excluded.thumbnail, publicado_em=excluded.publicado_em,
          estado=excluded.estado, coletado_em=now()
      returning id into v_post;
      if r ? 'metricas' then
        insert into marketing_privado.zernio_post_metricas(post_id,data,impressoes,alcance,curtidas,comentarios,compartilhamentos,
            salvamentos,cliques,visualizacoes,taxa_engajamento,atualizado_plataforma)
        values(v_post,coalesce((r->>'data')::date,current_date),(r->'metricas'->>'impressoes')::bigint,(r->'metricas'->>'alcance')::bigint,
            (r->'metricas'->>'curtidas')::bigint,(r->'metricas'->>'comentarios')::bigint,(r->'metricas'->>'compartilhamentos')::bigint,
            (r->'metricas'->>'salvamentos')::bigint,(r->'metricas'->>'cliques')::bigint,(r->'metricas'->>'visualizacoes')::bigint,
            (r->'metricas'->>'taxa_engajamento')::numeric,(r->'metricas'->>'atualizado_plataforma')::timestamptz)
        on conflict (post_id,data) do update set impressoes=excluded.impressoes, alcance=excluded.alcance, curtidas=excluded.curtidas,
            comentarios=excluded.comentarios, compartilhamentos=excluded.compartilhamentos, salvamentos=excluded.salvamentos,
            cliques=excluded.cliques, visualizacoes=excluded.visualizacoes, taxa_engajamento=excluded.taxa_engajamento,
            atualizado_plataforma=excluded.atualizado_plataforma, coletado_em=now();
      end if;
    when 'comentarios' then
      insert into marketing_privado.zernio_comentarios(externo_id,comentario_id,post_externo_id,conta_externa_id,plataforma,autor_nome,
          autor_usuario,autor_id,do_escritorio,texto,criado_em_plataforma,curtidas,respostas,pai_externo_id,oculto,pode_responder)
      values(r->>'externo_id',r->>'comentario_id',r->>'post_externo_id',r->>'conta_externa_id',coalesce(r->>'plataforma','instagram'),
          r->>'autor_nome',r->>'autor_usuario',r->>'autor_id',coalesce((r->>'do_escritorio')::boolean,false),r->>'texto',
          (r->>'criado_em_plataforma')::timestamptz,(r->>'curtidas')::integer,(r->>'respostas')::integer,r->>'pai_externo_id',
          coalesce((r->>'oculto')::boolean,false),coalesce((r->>'pode_responder')::boolean,false))
      on conflict (externo_id) do update set texto=excluded.texto, curtidas=excluded.curtidas, respostas=excluded.respostas,
          oculto=excluded.oculto, pode_responder=excluded.pode_responder, coletado_em=now();
    when 'conversas' then
      insert into marketing_privado.zernio_conversas(externo_id,conta_externa_id,plataforma,participante_nome,participante_id,
          ultima_mensagem,atualizado_plataforma,estado,nao_lidas)
      values(r->>'externo_id',r->>'conta_externa_id',coalesce(r->>'plataforma','instagram'),r->>'participante_nome',r->>'participante_id',
          left(r->>'ultima_mensagem',500),(r->>'atualizado_plataforma')::timestamptz,r->>'estado',(r->>'nao_lidas')::integer)
      on conflict (externo_id) do update set participante_nome=excluded.participante_nome, ultima_mensagem=excluded.ultima_mensagem,
          atualizado_plataforma=excluded.atualizado_plataforma, estado=excluded.estado, nao_lidas=excluded.nao_lidas, coletado_em=now();
    when 'campanhas' then
      insert into marketing_privado.zernio_campanhas(externo_id,conta_externa_id,conta_anuncio_id,nome,estado,objetivo,orcamento,moeda,
          metricas,periodo_de,periodo_ate)
      values(r->>'externo_id',r->>'conta_externa_id',r->>'conta_anuncio_id',r->>'nome',r->>'estado',r->>'objetivo',r->'orcamento',
          r->>'moeda',r->'metricas',(r->>'periodo_de')::date,(r->>'periodo_ate')::date)
      on conflict (externo_id) do update set nome=excluded.nome, estado=excluded.estado, objetivo=excluded.objetivo,
          orcamento=excluded.orcamento, moeda=excluded.moeda, metricas=excluded.metricas, periodo_de=excluded.periodo_de,
          periodo_ate=excluded.periodo_ate, atualizado_em=now();
    when 'conjuntos' then
      insert into marketing_privado.zernio_conjuntos(externo_id,campanha_externa_id,nome,estado,orcamento,otimizacao,moeda)
      values(r->>'externo_id',r->>'campanha_externa_id',r->>'nome',r->>'estado',r->'orcamento',r->>'otimizacao',r->>'moeda')
      on conflict (externo_id) do update set nome=excluded.nome, estado=excluded.estado, orcamento=excluded.orcamento,
          otimizacao=excluded.otimizacao, moeda=excluded.moeda, atualizado_em=now();
    when 'anuncios' then
      insert into marketing_privado.zernio_anuncios(externo_id,zernio_id,campanha_externa_id,conjunto_externo_id,nome,estado,tipo,
          criativo,moeda,metricas,periodo_de,periodo_ate)
      values(r->>'externo_id',r->>'zernio_id',r->>'campanha_externa_id',r->>'conjunto_externo_id',r->>'nome',r->>'estado',r->>'tipo',
          r->'criativo',r->>'moeda',r->'metricas',(r->>'periodo_de')::date,(r->>'periodo_ate')::date)
      on conflict (externo_id) do update set nome=excluded.nome, estado=excluded.estado, criativo=excluded.criativo,
          metricas=excluded.metricas, periodo_de=excluded.periodo_de, periodo_ate=excluded.periodo_ate, atualizado_em=now();
    when 'anuncios_diario' then
      insert into marketing_privado.zernio_anuncio_metricas(nivel,referencia,data,moeda,gasto,impressoes,alcance,cliques,ctr,cpc,cpm,conversoes,extras)
      values(coalesce(r->>'nivel','conta'),r->>'referencia',(r->>'data')::date,coalesce(r->>'moeda',''),(r->>'gasto')::numeric,
          (r->>'impressoes')::bigint,(r->>'alcance')::bigint,(r->>'cliques')::bigint,(r->>'ctr')::numeric,(r->>'cpc')::numeric,
          (r->>'cpm')::numeric,(r->>'conversoes')::numeric,coalesce(r->'extras','{}'))
      on conflict (nivel,referencia,data,moeda) do update set gasto=excluded.gasto, impressoes=excluded.impressoes,
          alcance=excluded.alcance, cliques=excluded.cliques, ctr=excluded.ctr, cpc=excluded.cpc, cpm=excluded.cpm,
          conversoes=excluded.conversoes, extras=excluded.extras, coletado_em=now();
    else raise exception 'Recurso desconhecido: %', _recurso;
    end case;
    n := n + 1;
  end loop;
  return n;
end $$;

create function public.zernio_contas_selecionadas()
returns table(externo_id text, plataforma text) language sql stable security invoker set search_path='' as $$
  select externo_id, plataforma from marketing_privado.zernio_contas
  where selecionada and ativa and current_user = 'service_role'
$$;

-- ---------------------------------------------------------------- leitura (tela e agentes)
create function public.zernio_painel(_aba text, _dias integer default 30)
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
            from marketing_privado.zernio_anuncio_metricas where data >= d group by moeda) g)),
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

-- Consulta dos agentes: sem chave ou sem dados, devolve aviso explícito (o agente não pode inventar métricas).
create function public.zernio_consulta_agente(_tipo text, _dias integer default 30)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare c marketing_privado.zernio_conexoes; d date := current_date - greatest(1, least(coalesce(_dias,30), 365)); v jsonb;
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  select * into c from marketing_privado.zernio_conexoes;
  if _tipo = 'saude' then
    return jsonb_build_object('estado', c.estado, 'tem_chave', c.chave_cifrada is not null, 'coleta_ativa', c.coleta_ativa,
      'sync_automatico', c.sync_automatico, 'ultima_sync_em', c.ultima_sync_em, 'ultima_sync_ok_em', c.ultima_sync_ok_em,
      'ultimo_erro', c.ultimo_erro, 'addons', jsonb_build_object('analytics', c.addon_analytics, 'inbox', c.addon_inbox, 'ads', c.addon_ads),
      'contas_reconectar', (select count(*) from marketing_privado.zernio_contas where precisa_reconectar),
      'falhas_7_dias', (select count(*) from marketing_privado.zernio_sync_jobs where estado in ('falhou','parcial') and criado_em > now() - interval '7 days'),
      'dados_desatualizados', c.ultima_sync_ok_em is null or c.ultima_sync_ok_em < now() - make_interval(mins => c.intervalo_minutos * 2));
  end if;
  if c.chave_cifrada is null or not c.analises_ativas then
    return jsonb_build_object('disponivel', false, 'aviso',
      case when c.chave_cifrada is null then 'Integração Zernio aguardando configuração da API. Não há dados: não estime métricas.'
           else 'Análises com dados do Zernio estão desligadas pela administração. Não estime métricas.' end);
  end if;
  v := case _tipo
    when 'indicadores' then (select jsonb_build_object(
        'publicacoes', count(*), 'alcance', sum(m.alcance), 'impressoes', sum(m.impressoes), 'curtidas', sum(m.curtidas),
        'comentarios', sum(m.comentarios), 'salvamentos', sum(m.salvamentos), 'engajamento_medio', round(avg(m.taxa_engajamento), 2))
      from marketing_privado.zernio_posts p
      left join lateral (select * from marketing_privado.zernio_post_metricas x where x.post_id = p.id order by x.data desc limit 1) m on true
      where p.publicado_em >= d)
    when 'publicacoes' then (select coalesce(jsonb_agg(x), '[]') from (
        select p.externo_id id, left(p.conteudo, 280) conteudo, p.publicado_em, p.tipo_midia, p.url,
          m.alcance, m.curtidas, m.comentarios, m.salvamentos, m.taxa_engajamento
        from marketing_privado.zernio_posts p
        left join lateral (select * from marketing_privado.zernio_post_metricas x where x.post_id = p.id order by x.data desc limit 1) m on true
        where p.publicado_em >= d order by m.taxa_engajamento desc nulls last limit 30) x)
    when 'comentarios' then (select coalesce(jsonb_agg(x), '[]') from (
        select c2.externo_id id, c2.post_externo_id, c2.autor_usuario, left(c2.texto, 400) texto, c2.criado_em_plataforma,
          c2.pode_responder, exists(select 1 from marketing_privado.zernio_comentarios r
            where r.pai_externo_id = c2.comentario_id and r.do_escritorio) respondido
        from marketing_privado.zernio_comentarios c2
        where c2.criado_em_plataforma >= d and not c2.do_escritorio and not c2.oculto
        order by c2.criado_em_plataforma desc limit 40) x)
    when 'conversas' then (select coalesce(jsonb_agg(x), '[]') from (
        select externo_id id, participante_nome, left(ultima_mensagem, 300) ultima_mensagem, atualizado_plataforma, nao_lidas
        from marketing_privado.zernio_conversas order by atualizado_plataforma desc nulls last limit 30) x)
    when 'anuncios' then jsonb_build_object(
        'campanhas', (select coalesce(jsonb_agg(jsonb_build_object('id', externo_id, 'nome', nome, 'estado', estado, 'objetivo', objetivo,
            'moeda', moeda, 'orcamento', orcamento, 'metricas', metricas)), '[]') from marketing_privado.zernio_campanhas),
        'diario', (select coalesce(jsonb_agg(jsonb_build_object('data', data, 'moeda', moeda, 'gasto', gasto, 'impressoes', impressoes,
            'alcance', alcance, 'cliques', cliques, 'ctr', ctr, 'cpc', cpc, 'cpm', cpm, 'conversoes', conversoes) order by data), '[]')
          from marketing_privado.zernio_anuncio_metricas where nivel = 'conta' and data >= d))
    else null end;
  if v is null then raise exception 'Consulta desconhecida'; end if;
  return jsonb_build_object('disponivel', true, 'ultima_sync_ok_em', c.ultima_sync_ok_em, 'periodo_dias', _dias, 'dados', v,
    'aviso', case when c.ultima_sync_ok_em is null then 'Nenhuma sincronização concluída ainda: dados podem estar vazios.' end);
end $$;

create function public.zernio_comentario_para_resposta(_externo text)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('post_externo_id', post_externo_id, 'conta_externa_id', conta_externa_id,
    'comentario_id', comentario_id, 'autor_usuario', autor_usuario, 'texto', left(texto, 500))
  from marketing_privado.zernio_comentarios
  where externo_id = _externo and pode_responder and not do_escritorio and not oculto and current_user = 'service_role'
$$;

-- ---------------------------------------------------------------- retenção (LGPD) e agendamento
create function public.zernio_purgar()
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c marketing_privado.zernio_conexoes; a integer; b integer; m integer; l integer;
begin
  if current_user not in ('service_role','postgres') then raise exception 'Somente backend' using errcode='42501'; end if;
  select * into c from marketing_privado.zernio_conexoes;
  delete from marketing_privado.zernio_conversas where coletado_em < now() - make_interval(days => c.retencao_mensagens_dias);
  get diagnostics a = row_count;
  delete from marketing_privado.zernio_comentarios where coletado_em < now() - make_interval(days => c.retencao_dias);
  get diagnostics b = row_count;
  delete from marketing_privado.zernio_post_metricas where data < current_date - c.retencao_dias;
  get diagnostics m = row_count;
  delete from marketing_privado.zernio_sync_logs where criado_em < now() - interval '90 days';
  get diagnostics l = row_count;
  return jsonb_build_object('conversas', a, 'comentarios', b, 'metricas', m, 'logs', l);
end $$;

-- Chamado pelo pg_cron: cria o job quando a sincronização automática vence e acorda a Edge Function.
-- Endereço e segredo vêm do Vault (project_url, djen_cron_secret): nada fixo na migration.
create function marketing_privado.zernio_cron()
returns void language plpgsql security definer set search_path='' as $$
declare c marketing_privado.zernio_conexoes; v_url text; v_segredo text;
begin
  select * into c from marketing_privado.zernio_conexoes;
  if c.chave_cifrada is null or not c.coleta_ativa then return; end if;
  if c.sync_automatico and (c.ultima_sync_em is null or c.ultima_sync_em < now() - make_interval(mins => c.intervalo_minutos))
     and not exists(select 1 from marketing_privado.zernio_sync_jobs where estado in ('pendente','executando')) then
    insert into marketing_privado.zernio_sync_jobs(origem) values('automatico') on conflict do nothing;
  end if;
  if not exists(select 1 from marketing_privado.zernio_sync_jobs
                where (estado='pendente' and proxima_tentativa_em <= now()) or (estado='executando' and reservado_ate < now())) then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_segredo from vault.decrypted_secrets where name = 'djen_cron_secret';
  if v_url is null or v_segredo is null then return; end if;
  perform net.http_post(url := v_url || '/functions/v1/zernio',
    headers := jsonb_build_object('Content-Type','application/json','x-djen-cron-secret', v_segredo),
    body := '{"acao":"processar"}'::jsonb, timeout_milliseconds := 5000);
end $$;
revoke all on function marketing_privado.zernio_cron() from public, anon, authenticated;

do $$ begin
  if exists(select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('zernio-sync', '*/15 * * * *', 'select marketing_privado.zernio_cron()');
    perform cron.schedule('zernio-retencao', '40 9 * * *', 'select public.zernio_purgar()');
  end if;
end $$;

-- ---------------------------------------------------------------- ferramentas dos agentes (motor de missões)
insert into escritorio_privado.ferramentas(slug,nome,descricao,classe,modulo) values
 ('zernio_indicadores','Indicadores do Instagram','Totais de alcance, curtidas, comentários e engajamento das publicações sincronizadas.','leitura','marketing'),
 ('zernio_publicacoes','Publicações do Instagram','Publicações recentes com métricas, ordenadas por engajamento.','leitura','marketing'),
 ('zernio_comentarios','Comentários do Instagram','Comentários recentes de terceiros e se já foram respondidos.','leitura','marketing'),
 ('zernio_conversas','Conversas do Instagram','Conversas recentes do direct (última mensagem, sem histórico completo).','leitura','marketing'),
 ('zernio_anuncios','Desempenho de anúncios','Campanhas e métricas diárias de Meta Ads sincronizadas.','leitura','marketing'),
 ('zernio_saude','Saúde da integração Zernio','Estado da conexão, última sincronização, falhas e recursos do plano.','leitura','marketing'),
 ('zernio_responder_comentario','Responder comentário','PROPÕE resposta a um comentário. Só é enviada após aprovação humana e com ações externas liberadas.','sensivel','marketing');

-- ---------------------------------------------------------------- privilégios
revoke all on all tables in schema marketing_privado from public, anon, authenticated;
grant select, insert, update, delete on
  marketing_privado.zernio_conexoes, marketing_privado.zernio_contas, marketing_privado.zernio_sync_jobs,
  marketing_privado.zernio_sync_logs, marketing_privado.zernio_posts, marketing_privado.zernio_post_metricas,
  marketing_privado.zernio_comentarios, marketing_privado.zernio_conversas, marketing_privado.zernio_campanhas,
  marketing_privado.zernio_conjuntos, marketing_privado.zernio_anuncios, marketing_privado.zernio_anuncio_metricas
  to service_role;
grant usage, select on sequence marketing_privado.zernio_sync_logs_id_seq to service_role;
do $$ declare f text; begin
  foreach f in array array[
    'zernio_conexao(boolean)','zernio_salvar_chave(uuid,text,text)','zernio_revogar(uuid)',
    'zernio_registrar_teste(text,text,jsonb)','zernio_configurar(uuid,jsonb)','zernio_job_criar(uuid,text)',
    'zernio_job_reservar(integer)','zernio_job_progresso(uuid,text,jsonb,jsonb,integer)',
    'zernio_job_finalizar(uuid,text,text,integer)','zernio_log(uuid,text,text,text,integer)','zernio_gravar(text,jsonb)',
    'zernio_contas_selecionadas()','zernio_comentario_para_resposta(text)','zernio_painel(text,integer)','zernio_consulta_agente(text,integer)','zernio_purgar()']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
