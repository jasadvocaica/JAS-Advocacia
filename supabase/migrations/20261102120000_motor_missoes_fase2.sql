-- Fase 2 da autonomia: motor de missões, ferramentas por agente, Central de
-- Aprovações com escopo e execução única, orçamento de IA em dólar e auditoria.
-- Tudo nasce DESLIGADO (motor_config.ligado = false) e sem ferramenta concedida.
-- Acesso só pelo backend (service_role) ou por RPC que confere a pessoa.
create schema if not exists escritorio_privado;
revoke all on schema escritorio_privado from public, anon;

create function escritorio_privado.hoje() returns date language sql stable set search_path='' as
$$ select (now() at time zone 'America/Cuiaba')::date $$;

-- ---------------------------------------------------------------- configuração
create table escritorio_privado.motor_config (
  id boolean primary key default true check (id),
  ligado boolean not null default false,
  max_tarefas_por_missao integer not null default 12 check (max_tarefas_por_missao between 1 and 50),
  max_profundidade smallint not null default 3 check (max_profundidade between 1 and 3),
  max_tentativas smallint not null default 2 check (max_tentativas between 1 and 5),
  lease_minutos smallint not null default 10 check (lease_minutos between 2 and 30),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);
insert into escritorio_privado.motor_config default values;

-- ---------------------------------------------------------------- ferramentas
create table escritorio_privado.ferramentas (
  slug text primary key check (slug ~ '^[a-z_]{3,40}$'),
  nome text not null,
  descricao text not null,
  classe text not null check (classe in ('leitura','escrita_interna','sensivel')),
  modulo public.modulo,
  ativa boolean not null default true
);
insert into escritorio_privado.ferramentas(slug,nome,descricao,classe,modulo) values
 ('consultar_indicadores','Indicadores da Controladoria','Contagens agregadas da Controladoria e das execuções.','leitura','controladoria'),
 ('listar_itens_controladoria','Itens da Controladoria','Lista até 20 itens abertos, com filtro por processo ou situação.','leitura','controladoria'),
 ('buscar_processo','Buscar processo','Dados básicos de um processo pelo número CNJ.','leitura','processos'),
 ('delegar_tarefa','Delegar tarefa','Cria tarefa para outro agente dentro da mesma missão.','escrita_interna',null),
 ('criar_item_controladoria','Criar item na Controladoria','Propõe nova atividade na Controladoria. Só grava após aprovação humana.','sensivel','controladoria');

create table escritorio_privado.agente_ferramentas (
  agente_id uuid not null references public.agentes_ia(id) on delete cascade,
  ferramenta text not null references escritorio_privado.ferramentas(slug),
  concedida_por uuid not null,
  concedida_em timestamptz not null default now(),
  primary key (agente_id, ferramenta)
);

-- ---------------------------------------------------------------- missões
create table escritorio_privado.missoes (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (char_length(titulo) between 3 and 200),
  objetivo text not null check (char_length(objetivo) between 1 and 4000),
  origem text not null check (origem in ('central','rotina','evento','manual')),
  solicitada_por uuid not null,
  estado text not null default 'aberta' check (estado in ('aberta','concluida','falhou','cancelada')),
  prioridade smallint not null default 3 check (prioridade between 1 and 5),
  chave text unique,
  criada_em timestamptz not null default now(),
  encerrada_em timestamptz
);

create table escritorio_privado.missao_tarefas (
  id uuid primary key default gen_random_uuid(),
  missao_id uuid not null references escritorio_privado.missoes(id) on delete cascade,
  pai_id uuid references escritorio_privado.missao_tarefas(id) on delete cascade,
  profundidade smallint not null default 0 check (profundidade between 0 and 3),
  agente_id uuid not null references public.agentes_ia(id),
  titulo text not null check (char_length(titulo) between 3 and 200),
  instrucoes text not null check (char_length(instrucoes) between 1 and 4000),
  depende_de uuid[] not null default '{}',
  estado text not null default 'pendente'
    check (estado in ('pendente','executando','concluida','falhou','cancelada')),
  tentativas smallint not null default 0,
  reservada_ate timestamptz,
  execucao_id uuid references public.agente_execucoes(id) on delete set null,
  resultado jsonb,
  erro text,
  chave text unique,
  criada_em timestamptz not null default now(),
  concluida_em timestamptz
);
create index motor_tarefas_fila on escritorio_privado.missao_tarefas(estado, criada_em) where estado in ('pendente','executando');
create index motor_tarefas_missao on escritorio_privado.missao_tarefas(missao_id);

-- Outbox de gatilhos (DJEN, rotinas, falhas); o motor consome em fases seguintes.
create table escritorio_privado.eventos (
  id bigserial primary key,
  tipo text not null check (tipo ~ '^[a-z_.]{3,60}$'),
  payload jsonb not null default '{}',
  chave text unique,
  criado_em timestamptz not null default now(),
  processado_em timestamptz
);

-- ---------------------------------------------------------------- aprovações
create table escritorio_privado.aprovacoes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('acao','orcamento')),
  origem text not null check (origem in ('agente','mcp','sistema')),
  agente_id uuid references public.agentes_ia(id),
  tarefa_id uuid references escritorio_privado.missao_tarefas(id) on delete set null,
  solicitada_por uuid,
  ferramenta text references escritorio_privado.ferramentas(slug),
  modulo public.modulo,
  parametros jsonb not null,
  escopo_hash text not null,
  resumo text not null check (char_length(resumo) between 3 and 2000),
  riscos text check (char_length(riscos) <= 2000),
  estado text not null default 'pendente'
    check (estado in ('pendente','aprovada','recusada','expirada','executando','executada','falhou')),
  valida_ate timestamptz not null default now() + interval '7 days',
  decidida_por uuid,
  decidida_em timestamptz,
  observacao text check (char_length(observacao) <= 1000),
  executada_em timestamptz,
  atualizado_em timestamptz not null default now(),
  resultado jsonb,
  chave text unique,
  criada_em timestamptz not null default now()
);
create index motor_aprovacoes_pendentes on escritorio_privado.aprovacoes(criada_em) where estado = 'pendente';

-- O escopo aprovado é o texto exato da ação: qualquer mudança gera outro hash.
create function escritorio_privado.escopo_hash(_ferramenta text, _parametros jsonb)
returns text language sql immutable set search_path='' as
$$ select encode(sha256(convert_to(coalesce(_ferramenta,'') || ':' || _parametros::text, 'UTF8')), 'hex') $$;

-- ---------------------------------------------------------------- auditoria (só inserção)
create table escritorio_privado.auditoria (
  id bigserial primary key,
  ator_tipo text not null check (ator_tipo in ('usuario','agente','sistema','mcp')),
  ator_id uuid,
  acao text not null,
  alvo text,
  detalhe jsonb not null default '{}',
  criado_em timestamptz not null default now()
);
create function escritorio_privado.auditoria_imutavel() returns trigger language plpgsql set search_path='' as
$$ begin raise exception 'Auditoria não pode ser alterada' using errcode = '42501'; end $$;
create trigger auditoria_sem_alteracao before update or delete on escritorio_privado.auditoria
  for each row execute function escritorio_privado.auditoria_imutavel();

create function escritorio_privado.auditar(_tipo text, _ator uuid, _acao text, _alvo text, _detalhe jsonb)
returns void language sql set search_path='' as
$$ insert into escritorio_privado.auditoria(ator_tipo,ator_id,acao,alvo,detalhe)
   values(_tipo,_ator,_acao,_alvo,coalesce(_detalhe,'{}'::jsonb)) $$;

-- ---------------------------------------------------------------- orçamento de IA (em dólar)
create table escritorio_privado.ia_orcamento (
  id boolean primary key default true check (id),
  teto_absoluto_usd numeric(8,2) not null default 20 check (teto_absoluto_usd > 0),
  orcamento_mensal_usd numeric(8,2) not null default 10 check (orcamento_mensal_usd > 0),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  check (orcamento_mensal_usd <= teto_absoluto_usd)
);
insert into escritorio_privado.ia_orcamento default values;

-- Aumento aprovado só para um dia (não muda o mensal).
create table escritorio_privado.ia_extra_dia (
  dia date primary key,
  valor_usd numeric(8,2) not null check (valor_usd > 0),
  aprovado_por uuid not null,
  aprovado_em timestamptz not null default now()
);

create table escritorio_privado.ia_precos (
  modelo text primary key,
  entrada_por_milhao numeric(10,4) not null check (entrada_por_milhao >= 0),
  saida_por_milhao numeric(10,4) not null check (saida_por_milhao >= 0),
  conferido_em date not null
);
-- Mesmos valores usados hoje em agentes-escritorio. CONFERIR a tabela vigente antes de ligar.
insert into escritorio_privado.ia_precos values ('gpt-4.1-mini-2025-04-14', 0.40, 1.60, date '2026-11-01');

create table escritorio_privado.ia_cotas (
  agente_id uuid primary key references public.agentes_ia(id) on delete cascade,
  peso numeric(4,2) not null default 1 check (peso between 0 and 10)
);

create table escritorio_privado.ia_consumo (
  id uuid not null,
  rodada smallint not null check (rodada between 0 and 7),
  agente_id uuid not null references public.agentes_ia(id),
  tarefa_id uuid references escritorio_privado.missao_tarefas(id) on delete set null,
  modelo text not null references escritorio_privado.ia_precos(modelo),
  dia date not null default escritorio_privado.hoje(),
  reservado_usd numeric(12,6) not null check (reservado_usd > 0),
  custo_usd numeric(12,6),
  tokens_entrada integer,
  tokens_saida integer,
  confirmado boolean not null default false,
  criado_em timestamptz not null default now(),
  primary key (id, rodada)
);
create index ia_consumo_dia on escritorio_privado.ia_consumo(dia);

-- Valor que conta no gasto: o custo confirmado ou, enquanto pendente, o reservado.
create function escritorio_privado.ia_gasto(_de date, _ate date, _agente uuid default null)
returns numeric language sql stable set search_path='' as $$
  select coalesce(sum(case when confirmado then custo_usd else reservado_usd end), 0)
  from escritorio_privado.ia_consumo
  where dia between _de and _ate and (_agente is null or agente_id = _agente)
$$;

-- Limite do dia = (orçamento do mês − gasto até ontem) ÷ dias que faltam, mais extra aprovado do dia.
create function escritorio_privado.ia_limite_dia(_dia date default escritorio_privado.hoje())
returns numeric language sql stable set search_path='' as $$
  with o as (select orcamento_mensal_usd m from escritorio_privado.ia_orcamento),
  d as (select date_trunc('month', _dia)::date ini,
               (date_trunc('month', _dia) + interval '1 month - 1 day')::date fim)
  select greatest(0,
      (o.m - case when _dia > d.ini then escritorio_privado.ia_gasto(d.ini, _dia - 1) else 0 end)
      / ((d.fim - _dia) + 1))
    + coalesce((select valor_usd from escritorio_privado.ia_extra_dia where dia = _dia), 0)
  from o, d
$$;

-- Cota do agente: o limite do dia dividido pelos agentes com demanda hoje (fila ou consumo),
-- pelo peso de cada um. Agente parado não segura cota.
create function escritorio_privado.ia_cota_agente(_agente uuid, _dia date default escritorio_privado.hoje())
returns numeric language sql stable set search_path='' as $$
  with demanda as (
    select distinct t.agente_id from escritorio_privado.missao_tarefas t
      where t.estado in ('pendente','executando')
    union select c.agente_id from escritorio_privado.ia_consumo c where c.dia = _dia
    union select _agente
  ), pesos as (
    select d.agente_id, coalesce(q.peso, 1) peso from demanda d
      left join escritorio_privado.ia_cotas q on q.agente_id = d.agente_id
  )
  select case when (select sum(peso) from pesos) > 0
    then escritorio_privado.ia_limite_dia(_dia) * (select peso from pesos where agente_id = _agente)
         / (select sum(peso) from pesos)
    else 0 end
$$;

create function public.ia_reservar(_id uuid, _rodada integer, _agente uuid, _tarefa uuid,
  _modelo text, _entrada integer, _saida_max integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p escritorio_privado.ia_precos; v_dia date := escritorio_privado.hoje();
  v_valor numeric; v_mes_ini date := date_trunc('month', v_dia)::date;
  v_mensal numeric; v_extras numeric;
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  if _entrada is null or _entrada not between 0 and 200000 or _saida_max is null or _saida_max not between 1 and 4000 then
    raise exception 'Reserva inválida';
  end if;
  perform pg_advisory_xact_lock(79415630);
  if exists(select 1 from escritorio_privado.ia_consumo where id=_id and rodada=_rodada) then
    return jsonb_build_object('ok', false, 'motivo', 'repetida');
  end if;
  select * into p from escritorio_privado.ia_precos where modelo=_modelo;
  if not found then raise exception 'Modelo sem preço cadastrado'; end if;
  v_valor := (_entrada * p.entrada_por_milhao + _saida_max * p.saida_por_milhao) / 1e6;
  select orcamento_mensal_usd into v_mensal from escritorio_privado.ia_orcamento;
  select coalesce(sum(valor_usd),0) into v_extras from escritorio_privado.ia_extra_dia where dia between v_mes_ini and v_dia;
  if escritorio_privado.ia_gasto(v_mes_ini, v_dia) + v_valor > v_mensal + v_extras then
    return jsonb_build_object('ok', false, 'motivo', 'mes');
  end if;
  if escritorio_privado.ia_gasto(v_dia, v_dia) + v_valor > escritorio_privado.ia_limite_dia(v_dia) then
    return jsonb_build_object('ok', false, 'motivo', 'dia');
  end if;
  if escritorio_privado.ia_gasto(v_dia, v_dia, _agente) + v_valor > escritorio_privado.ia_cota_agente(_agente, v_dia) then
    return jsonb_build_object('ok', false, 'motivo', 'agente');
  end if;
  insert into escritorio_privado.ia_consumo(id,rodada,agente_id,tarefa_id,modelo,dia,reservado_usd)
    values(_id,_rodada,_agente,_tarefa,_modelo,v_dia,v_valor);
  return jsonb_build_object('ok', true, 'reservado_usd', v_valor);
end $$;

create function public.ia_confirmar(_id uuid, _rodada integer, _entrada integer, _saida integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare c escritorio_privado.ia_consumo; p escritorio_privado.ia_precos; v_custo numeric;
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  if _entrada is null or _saida is null or _entrada < 0 or _saida < 0 then raise exception 'Consumo inválido'; end if;
  perform pg_advisory_xact_lock(79415630);
  select * into c from escritorio_privado.ia_consumo where id=_id and rodada=_rodada for update;
  if not found then raise exception 'Reserva não encontrada'; end if;
  if c.confirmado then return c.tokens_entrada=_entrada and c.tokens_saida=_saida; end if;
  select * into p from escritorio_privado.ia_precos where modelo=c.modelo;
  v_custo := (_entrada * p.entrada_por_milhao + _saida * p.saida_por_milhao) / 1e6;
  update escritorio_privado.ia_consumo set custo_usd=v_custo, tokens_entrada=_entrada, tokens_saida=_saida, confirmado=true
    where id=_id and rodada=_rodada;
  if v_custo > c.reservado_usd then
    -- Cobrança acima do reservado: desliga o motor em vez de esconder o excedente.
    update escritorio_privado.motor_config set ligado=false, atualizado_em=now() where id;
    perform escritorio_privado.auditar('sistema', null, 'motor.desligado_excedente', _id::text,
      jsonb_build_object('reservado', c.reservado_usd, 'custo', v_custo));
    return false;
  end if;
  return true;
end $$;

-- Situação do orçamento: base dos avisos e da simulação.
create function escritorio_privado.ia_situacao_calc() returns jsonb language sql stable set search_path='' as $$
  with h as (select escritorio_privado.hoje() d)
  select jsonb_build_object(
    'dia', h.d,
    'teto_absoluto_usd', o.teto_absoluto_usd,
    'orcamento_mensal_usd', o.orcamento_mensal_usd,
    'extras_mes_usd', (select coalesce(sum(valor_usd),0) from escritorio_privado.ia_extra_dia
                        where dia between date_trunc('month', h.d)::date and h.d),
    'gasto_mes_usd', escritorio_privado.ia_gasto(date_trunc('month', h.d)::date, h.d),
    'gasto_dia_usd', escritorio_privado.ia_gasto(h.d, h.d),
    'limite_dia_usd', escritorio_privado.ia_limite_dia(h.d),
    'media_7d_usd', escritorio_privado.ia_gasto(h.d - 7, h.d - 1) / 7,
    'dias_restantes', ((date_trunc('month', h.d) + interval '1 month - 1 day')::date - h.d) + 1,
    'tarefas_na_fila', (select count(*) from escritorio_privado.missao_tarefas where estado = 'pendente'),
    'motor_ligado', (select ligado from escritorio_privado.motor_config))
  from h, escritorio_privado.ia_orcamento o
$$;

-- A tela lê pela Edge Function, que confere a pessoa antes.
create function public.ia_situacao() returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  return escritorio_privado.ia_situacao_calc();
end $$;

-- Pedido de aumento (um por dia): as opções já vêm simuladas pelo backend.
create function public.ia_pedir_aumento(_motivo text, _opcoes jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_chave text := 'orcamento:' || escritorio_privado.hoje();
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  if jsonb_typeof(_opcoes) <> 'array' or jsonb_array_length(_opcoes) not between 1 and 4 then raise exception 'Opções inválidas'; end if;
  select id into v_id from escritorio_privado.aprovacoes where chave = v_chave;
  if found then return v_id; end if;
  insert into escritorio_privado.aprovacoes(tipo,origem,parametros,escopo_hash,resumo,chave,valida_ate)
    values('orcamento','sistema',
      jsonb_build_object('situacao', escritorio_privado.ia_situacao_calc(), 'opcoes', _opcoes),
      escritorio_privado.escopo_hash('orcamento', _opcoes), left(_motivo, 2000), v_chave,
      (escritorio_privado.hoje() + 1)::timestamp at time zone 'America/Cuiaba')
    returning id into v_id;
  perform escritorio_privado.auditar('sistema', null, 'orcamento.aviso', v_id::text, jsonb_build_object('motivo', _motivo));
  return v_id;
end $$;

-- ---------------------------------------------------------------- motor: missões e tarefas
create function public.motor_criar_missao(_usuario uuid, _titulo text, _objetivo text, _agente uuid,
  _origem text default 'central', _prioridade integer default 3, _chave text default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid;
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  if not public.is_gestor(_usuario) or not public.is_interno_ativo(_usuario) then
    raise exception 'Gestor ativo necessário' using errcode='42501';
  end if;
  if _chave is not null then
    select id into v_id from escritorio_privado.missoes where chave=_chave;
    if found then return v_id; end if;
  end if;
  if not exists(select 1 from public.agentes_ia where id=_agente and ativo) then raise exception 'Agente indisponível'; end if;
  insert into escritorio_privado.missoes(titulo,objetivo,origem,solicitada_por,prioridade,chave)
    values(_titulo,_objetivo,_origem,_usuario,_prioridade,_chave) returning id into v_id;
  insert into escritorio_privado.missao_tarefas(missao_id,agente_id,titulo,instrucoes)
    values(v_id,_agente,_titulo,_objetivo);
  perform escritorio_privado.auditar('usuario', _usuario, 'missao.criada', v_id::text,
    jsonb_build_object('agente', _agente, 'origem', _origem));
  return v_id;
end $$;

-- Reserva até _limite tarefas prontas (uma por agente), com lease; retoma reservas vencidas.
create function public.motor_reservar_tarefas(_limite integer default 3)
returns table(tarefa_id uuid, missao_id uuid, agente_id uuid, execucao_id uuid, titulo text,
  instrucoes text, profundidade smallint, tentativa smallint, objetivo_missao text,
  solicitada_por uuid, dependencias jsonb, ferramentas text[])
language plpgsql security invoker set search_path='' as $$
#variable_conflict use_column
declare cfg escritorio_privado.motor_config; t record; v_exec uuid; v_agentes uuid[] := '{}';
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  select * into cfg from escritorio_privado.motor_config;
  if not cfg.ligado then return; end if;

  -- Lease vencido: devolve à fila ou encerra como falha.
  for t in select * from escritorio_privado.missao_tarefas
            where estado='executando' and reservada_ate < now() for update skip locked loop
    update escritorio_privado.missao_tarefas
      set estado = case when t.tentativas >= cfg.max_tentativas then 'falhou' else 'pendente' end,
          erro = 'Reserva vencida sem conclusão', reservada_ate = null,
          concluida_em = case when t.tentativas >= cfg.max_tentativas then now() end
      where id = t.id;
    if t.execucao_id is not null then
      update public.agente_execucoes set status='erro', erro='Reserva vencida sem conclusão', finalizado_em=now()
        where id=t.execucao_id and status='executando';
    end if;
  end loop;

  for t in
    select mt.*, m.objetivo, m.solicitada_por sol
    from escritorio_privado.missao_tarefas mt
    join escritorio_privado.missoes m on m.id = mt.missao_id and m.estado = 'aberta'
    join public.agentes_ia a on a.id = mt.agente_id and a.ativo
    where mt.estado = 'pendente'
      and not exists(select 1 from unnest(mt.depende_de) d
                     join escritorio_privado.missao_tarefas x on x.id = d where x.estado <> 'concluida')
      and not exists(select 1 from escritorio_privado.missao_tarefas o
                     where o.agente_id = mt.agente_id and o.estado = 'executando')
      and not exists(select 1 from public.agente_execucoes e
                     where e.agente_id = mt.agente_id and e.status = 'executando')
    order by m.prioridade, mt.criada_em
    for update of mt skip locked
  loop
    exit when _limite <= 0;
    continue when t.agente_id = any(v_agentes);  -- uma tarefa por agente por vez
    v_agentes := v_agentes || t.agente_id;
    insert into public.agente_execucoes(agente_id,disparado_por,origem,status,entrada)
      values(t.agente_id, t.sol, 'missao', 'executando',
        jsonb_build_object('funcao','motor_missoes','missao_id',t.missao_id,'tarefa_id',t.id))
      returning id into v_exec;
    update escritorio_privado.missao_tarefas
      set estado='executando', tentativas=tentativas+1, execucao_id=v_exec,
          reservada_ate = now() + make_interval(mins => cfg.lease_minutos)
      where id = t.id;
    _limite := _limite - 1;
    tarefa_id := t.id; missao_id := t.missao_id; agente_id := t.agente_id; execucao_id := v_exec;
    titulo := t.titulo; instrucoes := t.instrucoes; profundidade := t.profundidade;
    tentativa := t.tentativas + 1; objetivo_missao := t.objetivo; solicitada_por := t.sol;
    select coalesce(jsonb_agg(jsonb_build_object('tarefa', x.titulo, 'resultado', x.resultado)), '[]')
      into dependencias from escritorio_privado.missao_tarefas x where x.id = any(t.depende_de);
    select coalesce(array_agg(af.ferramenta order by af.ferramenta), '{}') into ferramentas
      from escritorio_privado.agente_ferramentas af
      join escritorio_privado.ferramentas f on f.slug = af.ferramenta and f.ativa
      where af.agente_id = t.agente_id;
    return next;
  end loop;
end $$;

-- Confere, no banco, que a tarefa está reservada e o agente tem a ferramenta. Devolve a classe.
create function public.motor_ferramenta_permitida(_tarefa uuid, _ferramenta text)
returns text language sql stable security invoker set search_path='' as $$
  select f.classe from escritorio_privado.missao_tarefas t
  join escritorio_privado.agente_ferramentas af on af.agente_id = t.agente_id and af.ferramenta = _ferramenta
  join escritorio_privado.ferramentas f on f.slug = af.ferramenta and f.ativa
  where t.id = _tarefa and t.estado = 'executando' and t.reservada_ate > now()
    and (select ligado from escritorio_privado.motor_config)
$$;

create function public.motor_delegar(_tarefa uuid, _agente uuid, _titulo text, _instrucoes text,
  _depende_de uuid[] default '{}', _chave text default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare t escritorio_privado.missao_tarefas; cfg escritorio_privado.motor_config; v_id uuid;
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  if public.motor_ferramenta_permitida(_tarefa, 'delegar_tarefa') is null then
    raise exception 'Delegação não permitida para este agente' using errcode='42501';
  end if;
  select * into cfg from escritorio_privado.motor_config;
  select * into t from escritorio_privado.missao_tarefas where id=_tarefa;
  perform 1 from escritorio_privado.missoes where id=t.missao_id for update;
  v_id := null;
  if _chave is not null then
    select id into v_id from escritorio_privado.missao_tarefas where chave = t.missao_id || ':' || _chave;
    if found then return v_id; end if;
  end if;
  if t.profundidade + 1 > cfg.max_profundidade then raise exception 'Profundidade máxima de delegação atingida'; end if;
  if (select count(*) from escritorio_privado.missao_tarefas where missao_id=t.missao_id) >= cfg.max_tarefas_por_missao then
    raise exception 'Limite de tarefas da missão atingido';
  end if;
  if not exists(select 1 from public.agentes_ia where id=_agente and ativo) then raise exception 'Agente indisponível'; end if;
  if exists(select 1 from unnest(coalesce(_depende_de,'{}')) d
            where not exists(select 1 from escritorio_privado.missao_tarefas x where x.id=d and x.missao_id=t.missao_id)) then
    raise exception 'Dependência fora da missão';
  end if;
  insert into escritorio_privado.missao_tarefas(missao_id,pai_id,profundidade,agente_id,titulo,instrucoes,depende_de,chave)
    values(t.missao_id,t.id,t.profundidade+1,_agente,_titulo,_instrucoes,coalesce(_depende_de,'{}'),
      case when _chave is not null then t.missao_id || ':' || _chave end)
    returning id into v_id;
  perform escritorio_privado.auditar('agente', t.agente_id, 'tarefa.delegada', v_id::text,
    jsonb_build_object('para', _agente, 'missao', t.missao_id));
  return v_id;
end $$;

create function public.motor_pedir_aprovacao(_tarefa uuid, _ferramenta text, _parametros jsonb,
  _resumo text, _riscos text default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare t escritorio_privado.missao_tarefas; f escritorio_privado.ferramentas; v_hash text; v_id uuid;
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  if public.motor_ferramenta_permitida(_tarefa, _ferramenta) is distinct from 'sensivel' then
    raise exception 'Ferramenta sensível não permitida para este agente' using errcode='42501';
  end if;
  select * into t from escritorio_privado.missao_tarefas where id=_tarefa;
  select * into f from escritorio_privado.ferramentas where slug=_ferramenta;
  v_hash := escritorio_privado.escopo_hash(_ferramenta, _parametros);
  insert into escritorio_privado.aprovacoes(tipo,origem,agente_id,tarefa_id,solicitada_por,ferramenta,modulo,
      parametros,escopo_hash,resumo,riscos,chave)
    values('acao','agente',t.agente_id,t.id,
      (select solicitada_por from escritorio_privado.missoes where id=t.missao_id),
      _ferramenta,f.modulo,_parametros,v_hash,_resumo,_riscos,'tarefa:' || t.id || ':' || v_hash)
    on conflict (chave) do nothing
    returning id into v_id;
  if v_id is null then
    select id into v_id from escritorio_privado.aprovacoes where chave = 'tarefa:' || t.id || ':' || v_hash;
    return v_id;
  end if;
  perform escritorio_privado.auditar('agente', t.agente_id, 'aprovacao.pedida', v_id::text,
    jsonb_build_object('ferramenta', _ferramenta, 'hash', v_hash));
  return v_id;
end $$;

create function public.motor_concluir_tarefa(_tarefa uuid, _ok boolean, _resultado jsonb, _erro text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare t escritorio_privado.missao_tarefas; cfg escritorio_privado.motor_config; v_estado text;
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  select * into cfg from escritorio_privado.motor_config;
  select * into t from escritorio_privado.missao_tarefas where id=_tarefa for update;
  if not found or t.estado <> 'executando' then return false; end if;
  v_estado := case when _ok then 'concluida' when t.tentativas >= cfg.max_tentativas then 'falhou' else 'pendente' end;
  update escritorio_privado.missao_tarefas
    set estado=v_estado, resultado=case when _ok then _resultado else resultado end, erro=left(_erro,2000),
        reservada_ate=null, concluida_em=case when v_estado in ('concluida','falhou') then now() end
    where id=_tarefa;
  update public.agente_execucoes
    set status = case when _ok then 'concluida'::public.status_execucao else 'erro'::public.status_execucao end,
        saida = _resultado, erro = left(_erro,2000), finalizado_em = now(),
        resumo = left(coalesce(_resultado->>'resumo', case when _ok then 'Tarefa da missão concluída.' end), 500)
    where id=t.execucao_id and status='executando';
  -- Uma dependência que falhou definitivamente cancela quem depende dela.
  if v_estado = 'falhou' then
    update escritorio_privado.missao_tarefas set estado='cancelada', erro='Dependência falhou', concluida_em=now()
      where missao_id=t.missao_id and estado='pendente' and _tarefa = any(depende_de);
  end if;
  -- Missão termina quando não há tarefa aberta nem aprovação pendente.
  if not exists(select 1 from escritorio_privado.missao_tarefas where missao_id=t.missao_id and estado in ('pendente','executando'))
     and not exists(select 1 from escritorio_privado.aprovacoes a join escritorio_privado.missao_tarefas x on x.id=a.tarefa_id
                    where x.missao_id=t.missao_id and a.estado in ('pendente','aprovada','executando')) then
    update escritorio_privado.missoes
      set estado = case when exists(select 1 from escritorio_privado.missao_tarefas where missao_id=t.missao_id and estado='falhou')
                        then 'falhou' else 'concluida' end,
          encerrada_em = now()
      where id=t.missao_id and estado='aberta';
  end if;
  perform escritorio_privado.auditar('agente', t.agente_id, 'tarefa.' || v_estado, _tarefa::text,
    jsonb_build_object('tentativa', t.tentativas));
  return true;
end $$;

-- Sem orçamento: a tarefa volta para a fila sem gastar tentativa. Nada é perdido.
create function public.motor_devolver_tarefa(_tarefa uuid, _motivo text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare t escritorio_privado.missao_tarefas;
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  update escritorio_privado.missao_tarefas
    set estado='pendente', tentativas=greatest(0, tentativas-1), reservada_ate=null, erro=left(_motivo,2000)
    where id=_tarefa and estado='executando' returning * into t;
  if not found then return false; end if;
  update public.agente_execucoes set status='cancelada', erro=left(_motivo,2000), finalizado_em=now()
    where id=t.execucao_id and status='executando';
  perform escritorio_privado.auditar('sistema', null, 'tarefa.devolvida', _tarefa::text, jsonb_build_object('motivo', _motivo));
  return true;
end $$;

-- ---------------------------------------------------------------- Central de Aprovações
create function public.aprovacao_listar(_usuario uuid)
returns setof jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',a.id,'tipo',a.tipo,'origem',a.origem,'agente',ag.nome,'ferramenta',a.ferramenta,
    'modulo',a.modulo,'resumo',a.resumo,'riscos',a.riscos,'parametros',a.parametros,'escopo_hash',a.escopo_hash,
    'valida_ate',a.valida_ate,'criada_em',a.criada_em)
  from escritorio_privado.aprovacoes a left join public.agentes_ia ag on ag.id=a.agente_id
  where current_user = 'service_role' and a.estado='pendente' and a.valida_ate > now()
    and public.is_interno_ativo(_usuario)
    and case when a.tipo='orcamento' then public.is_gestor(_usuario)
             else public.has_permission(_usuario, a.modulo, 'editar') end
  order by a.criada_em
$$;

-- Decide uma ação. _hash é o escopo que a pessoa viu: se mudou, não vale.
create function public.aprovacao_decidir(_usuario uuid, _id uuid, _aprovar boolean, _hash text, _observacao text default null)
returns text language plpgsql security invoker set search_path='' as $$
declare a escritorio_privado.aprovacoes;
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  select * into a from escritorio_privado.aprovacoes where id=_id for update;
  if not found or a.tipo <> 'acao' then raise exception 'Pedido não encontrado'; end if;
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

-- Reserva a execução de uma ação aprovada. Só uma chamada consegue; reexecução vencida é retomada.
create function public.aprovacao_iniciar_execucao(_id uuid)
returns table(ferramenta text, parametros jsonb, agente_id uuid, decidida_por uuid)
language plpgsql security invoker set search_path='' as $$
#variable_conflict use_column
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  return query
  update escritorio_privado.aprovacoes a set estado='executando', atualizado_em=now()
  where a.id=_id and a.tipo='acao' and a.valida_ate > now()
    and (a.estado='aprovada' or (a.estado='executando' and a.atualizado_em < now() - interval '10 minutes'))
    and a.escopo_hash = escritorio_privado.escopo_hash(a.ferramenta, a.parametros)
  returning a.ferramenta, a.parametros, a.agente_id, a.decidida_por;
end $$;

create function public.aprovacao_finalizar_execucao(_id uuid, _ok boolean, _resultado jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare a escritorio_privado.aprovacoes; v_missao uuid;
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  update escritorio_privado.aprovacoes
    set estado = case when _ok then 'executada' else 'falhou' end,
        executada_em = case when _ok then now() end, resultado=_resultado, atualizado_em=now()
    where id=_id and estado='executando' returning * into a;
  if not found then return false; end if;
  perform escritorio_privado.auditar('sistema', a.decidida_por, case when _ok then 'acao.executada' else 'acao.falhou' end,
    _id::text, jsonb_build_object('ferramenta', a.ferramenta, 'resultado', _resultado));
  select missao_id into v_missao from escritorio_privado.missao_tarefas where id=a.tarefa_id;
  if v_missao is not null
     and not exists(select 1 from escritorio_privado.missao_tarefas where missao_id=v_missao and estado in ('pendente','executando'))
     and not exists(select 1 from escritorio_privado.aprovacoes x join escritorio_privado.missao_tarefas t on t.id=x.tarefa_id
                    where t.missao_id=v_missao and x.estado in ('pendente','aprovada','executando')) then
    update escritorio_privado.missoes set estado='concluida', encerrada_em=now() where id=v_missao and estado='aberta';
  end if;
  return true;
end $$;

-- Decide um aviso de orçamento: opção simulada (índice) ou valor próprio; nunca acima do teto.
create function public.ia_decidir_aumento(_usuario uuid, _id uuid, _opcao integer default null,
  _tipo text default null, _valor numeric default null)
returns text language plpgsql security invoker set search_path='' as $$
declare a escritorio_privado.aprovacoes; o escritorio_privado.ia_orcamento; v_tipo text; v_valor numeric;
  v_dia date := escritorio_privado.hoje(); v_extras numeric;
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  if not public.is_gestor(_usuario) or not public.is_interno_ativo(_usuario) then
    raise exception 'Gestor ativo necessário' using errcode='42501';
  end if;
  select * into a from escritorio_privado.aprovacoes where id=_id and tipo='orcamento' for update;
  if not found then raise exception 'Aviso não encontrado'; end if;
  if a.estado <> 'pendente' then return a.estado; end if;
  if _opcao is null and _tipo is null then
    update escritorio_privado.aprovacoes set estado='recusada', decidida_por=_usuario, decidida_em=now(), atualizado_em=now() where id=_id;
    perform escritorio_privado.auditar('usuario', _usuario, 'orcamento.recusado', _id::text, '{}');
    return 'recusada';
  end if;
  if _opcao is not null then
    v_tipo := a.parametros->'opcoes'->_opcao->>'tipo';
    v_valor := (a.parametros->'opcoes'->_opcao->>'valor_usd')::numeric;
  else
    v_tipo := _tipo; v_valor := _valor;
  end if;
  if v_tipo not in ('extra_dia','mensal') or v_valor is null or v_valor <= 0 then raise exception 'Opção inválida'; end if;
  select * into o from escritorio_privado.ia_orcamento for update;
  select coalesce(sum(valor_usd),0) into v_extras from escritorio_privado.ia_extra_dia
    where dia between date_trunc('month', v_dia)::date and v_dia and dia <> v_dia;
  if v_tipo = 'mensal' then
    if v_valor + v_extras > o.teto_absoluto_usd then raise exception 'Acima do teto mensal de US$ %', o.teto_absoluto_usd; end if;
    update escritorio_privado.ia_orcamento set orcamento_mensal_usd=v_valor, atualizado_em=now(), atualizado_por=_usuario where id;
  else
    if o.orcamento_mensal_usd + v_extras + v_valor > o.teto_absoluto_usd then
      raise exception 'Acima do teto mensal de US$ %', o.teto_absoluto_usd;
    end if;
    insert into escritorio_privado.ia_extra_dia(dia,valor_usd,aprovado_por) values(v_dia,v_valor,_usuario)
      on conflict (dia) do update set valor_usd=excluded.valor_usd, aprovado_por=excluded.aprovado_por, aprovado_em=now();
  end if;
  update escritorio_privado.aprovacoes
    set estado='executada', decidida_por=_usuario, decidida_em=now(), executada_em=now(), atualizado_em=now(),
        resultado=jsonb_build_object('tipo', v_tipo, 'valor_usd', v_valor)
    where id=_id;
  perform escritorio_privado.auditar('usuario', _usuario, 'orcamento.aprovado', _id::text,
    jsonb_build_object('tipo', v_tipo, 'valor_usd', v_valor));
  return 'executada';
end $$;

-- Ajustes diretos da gestão: ligar/desligar o motor, orçamento mensal e ferramentas por agente.
create function public.motor_ajustar(_usuario uuid, _ligado boolean default null, _orcamento_mensal numeric default null,
  _teto numeric default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o escritorio_privado.ia_orcamento;
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  if not public.is_gestor(_usuario) or not public.is_interno_ativo(_usuario) then
    raise exception 'Gestor ativo necessário' using errcode='42501';
  end if;
  -- O teto absoluto é da administração do escritório (gestão de usuários).
  if _teto is not null and not public.has_permission(_usuario, 'usuarios', 'editar') then
    raise exception 'Só a administração altera o teto absoluto' using errcode='42501';
  end if;
  select * into o from escritorio_privado.ia_orcamento for update;
  if _teto is not null or _orcamento_mensal is not null then
    if coalesce(_orcamento_mensal, o.orcamento_mensal_usd) > coalesce(_teto, o.teto_absoluto_usd) then
      raise exception 'Orçamento acima do teto';
    end if;
    update escritorio_privado.ia_orcamento
      set teto_absoluto_usd=coalesce(_teto, teto_absoluto_usd),
          orcamento_mensal_usd=coalesce(_orcamento_mensal, orcamento_mensal_usd),
          atualizado_em=now(), atualizado_por=_usuario where id;
  end if;
  if _ligado is not null then
    update escritorio_privado.motor_config set ligado=_ligado, atualizado_em=now(), atualizado_por=_usuario where id;
  end if;
  perform escritorio_privado.auditar('usuario', _usuario, 'motor.ajuste', null,
    jsonb_build_object('ligado', _ligado, 'orcamento_mensal', _orcamento_mensal, 'teto', _teto));
  return escritorio_privado.ia_situacao_calc();
end $$;

create function public.motor_conceder_ferramenta(_usuario uuid, _agente uuid, _ferramenta text, _conceder boolean)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  if not public.is_gestor(_usuario) or not public.is_interno_ativo(_usuario) then
    raise exception 'Gestor ativo necessário' using errcode='42501';
  end if;
  if _conceder then
    insert into escritorio_privado.agente_ferramentas(agente_id,ferramenta,concedida_por) values(_agente,_ferramenta,_usuario)
      on conflict do nothing;
  else
    delete from escritorio_privado.agente_ferramentas where agente_id=_agente and ferramenta=_ferramenta;
  end if;
  perform escritorio_privado.auditar('usuario', _usuario, case when _conceder then 'ferramenta.concedida' else 'ferramenta.retirada' end,
    _agente::text, jsonb_build_object('ferramenta', _ferramenta));
  return true;
end $$;

-- ---------------------------------------------------------------- painel (Sala da Gestora e Central de Missões)
create function public.motor_painel(_usuario uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  if not public.is_gestor(_usuario) or not public.is_interno_ativo(_usuario) then
    raise exception 'Gestor ativo necessário' using errcode='42501';
  end if;
  return jsonb_build_object(
    'motor_ligado', (select ligado from escritorio_privado.motor_config),
    'orcamento', escritorio_privado.ia_situacao_calc(),
    'consumo_agentes', coalesce((select jsonb_object_agg(agente_id, jsonb_build_object('custo_usd', round(custo, 4), 'tokens', tokens))
      from (select agente_id, sum(coalesce(custo_usd, reservado_usd)) custo, sum(coalesce(tokens_entrada,0) + coalesce(tokens_saida,0)) tokens
            from escritorio_privado.ia_consumo where dia > escritorio_privado.hoje() - 30 group by agente_id) c), '{}'::jsonb),
    'missoes', coalesce((
      select jsonb_agg(x order by x->>'criada_em' desc) from (
        select jsonb_build_object(
          'id', m.id, 'titulo', m.titulo, 'objetivo', m.objetivo, 'estado', m.estado, 'origem', m.origem,
          'prioridade', m.prioridade, 'criada_em', m.criada_em, 'encerrada_em', m.encerrada_em,
          'aprovacoes_abertas', (select count(*) from escritorio_privado.aprovacoes a
              join escritorio_privado.missao_tarefas t on t.id = a.tarefa_id
              where t.missao_id = m.id and a.estado in ('pendente','aprovada','executando')),
          'tarefas', coalesce((select jsonb_agg(jsonb_build_object(
              'id', t.id, 'titulo', t.titulo, 'estado', t.estado, 'agente_id', t.agente_id, 'agente', ag.nome,
              'profundidade', t.profundidade, 'tentativas', t.tentativas,
              'resumo', t.resultado->>'resumo', 'erro', t.erro, 'concluida_em', t.concluida_em) order by t.criada_em)
            from escritorio_privado.missao_tarefas t join public.agentes_ia ag on ag.id = t.agente_id
            where t.missao_id = m.id), '[]'::jsonb)) x
        from escritorio_privado.missoes m
        where m.estado = 'aberta' or m.encerrada_em > now() - interval '7 days'
        order by m.criada_em desc limit 60) s), '[]'::jsonb),
    'atividades', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'acao', a.acao, 'ator_tipo', a.ator_tipo,
          'ator', case when a.ator_tipo = 'agente' then ag.nome end, 'criado_em', a.criado_em) order by a.id desc)
      from (select * from escritorio_privado.auditoria order by id desc limit 25) a
      left join public.agentes_ia ag on ag.id = a.ator_id), '[]'::jsonb));
end $$;

-- Ferramentas do catálogo com a indicação do que o agente já recebeu (tela da Central de Agentes).
create function public.motor_ferramentas_agente(_usuario uuid, _agente uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  if not public.is_gestor(_usuario) or not public.is_interno_ativo(_usuario) then
    raise exception 'Gestor ativo necessário' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('slug', f.slug, 'nome', f.nome, 'descricao', f.descricao,
      'classe', f.classe, 'modulo', f.modulo, 'concedida', af.agente_id is not null, 'concedida_em', af.concedida_em)
      order by f.classe, f.nome)
    from escritorio_privado.ferramentas f
    left join escritorio_privado.agente_ferramentas af on af.ferramenta = f.slug and af.agente_id = _agente
    where f.ativa), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------- privilégios
revoke all on all tables in schema escritorio_privado from public, anon, authenticated;
grant usage on schema escritorio_privado to service_role;
grant select, insert, update, delete on all tables in schema escritorio_privado to service_role;
revoke update, delete on escritorio_privado.auditoria from service_role;
grant usage, select on all sequences in schema escritorio_privado to service_role;
grant execute on all functions in schema escritorio_privado to service_role;

do $$ declare f text; begin
  foreach f in array array[
    'ia_reservar(uuid,integer,uuid,uuid,text,integer,integer)','ia_confirmar(uuid,integer,integer,integer)',
    'ia_pedir_aumento(text,jsonb)','ia_decidir_aumento(uuid,uuid,integer,text,numeric)',
    'motor_criar_missao(uuid,text,text,uuid,text,integer,text)','motor_reservar_tarefas(integer)',
    'motor_ferramenta_permitida(uuid,text)','motor_delegar(uuid,uuid,text,text,uuid[],text)',
    'motor_pedir_aprovacao(uuid,text,jsonb,text,text)','motor_concluir_tarefa(uuid,boolean,jsonb,text)',
    'motor_devolver_tarefa(uuid,text)',
    'aprovacao_listar(uuid)','ia_situacao()','aprovacao_decidir(uuid,uuid,boolean,text,text)',
    'aprovacao_iniciar_execucao(uuid)','aprovacao_finalizar_execucao(uuid,boolean,jsonb)',
    'motor_ajustar(uuid,boolean,numeric,numeric)','motor_painel(uuid)','motor_ferramentas_agente(uuid,uuid)','motor_conceder_ferramenta(uuid,uuid,text,boolean)']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
