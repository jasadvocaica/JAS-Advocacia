-- Fase 1 e 2 do prompt mestre: automações programadas, espera entre tentativas (backoff),
-- fila de falhas (tarefas "falhou" com retentativa manual) e cancelamento de missão.
-- Tudo roda no banco + Edge Function, sem depender de navegador aberto. Automações nascem desligadas.

-- ---------------------------------------------------------------- automações programadas
create table escritorio_privado.automacoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(nome) between 3 and 120),
  setor text not null default 'controladoria'
    check (setor in ('controladoria','processos','comercial','financeiro','agenda','marketing','sistema')),
  agente_id uuid not null references public.agentes_ia(id) on delete cascade,
  instrucoes text not null check (char_length(instrucoes) between 10 and 4000),
  frequencia text not null check (frequencia in ('intervalo','diaria','semanal')),
  intervalo_minutos integer check (intervalo_minutos between 60 and 10080),
  hora time,
  dias_semana smallint[] check (dias_semana <@ array[0,1,2,3,4,5,6]::smallint[]),
  fuso text not null default 'America/Cuiaba',
  prioridade smallint not null default 3 check (prioridade between 1 and 5),
  ativa boolean not null default false,
  proxima_execucao timestamptz,
  ultima_execucao timestamptz,
  ultima_missao uuid references escritorio_privado.missoes(id) on delete set null,
  criada_por uuid not null,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  check (frequencia <> 'intervalo' or intervalo_minutos is not null),
  check (frequencia = 'intervalo' or hora is not null),
  check (frequencia <> 'semanal' or coalesce(array_length(dias_semana, 1), 0) > 0)
);
create index automacoes_prontas on escritorio_privado.automacoes(proxima_execucao) where ativa;
alter table escritorio_privado.automacoes enable row level security;
revoke all on escritorio_privado.automacoes from public, anon, authenticated;
grant select, insert, update, delete on escritorio_privado.automacoes to service_role;

-- Próxima execução depois de _base, no fuso da automação (horário de Cuiabá por padrão).
create function escritorio_privado.automacao_proxima(_freq text, _intervalo integer, _hora time,
  _dias smallint[], _fuso text, _base timestamptz)
returns timestamptz language plpgsql stable set search_path='' as $$
declare v_local date := (_base at time zone _fuso)::date; v_dia date; v_cand timestamptz;
begin
  if _freq = 'intervalo' then return _base + make_interval(mins => _intervalo); end if;
  for d in 0..8 loop
    v_dia := v_local + d;
    v_cand := (v_dia + _hora) at time zone _fuso;
    if v_cand > _base and (_freq = 'diaria' or extract(dow from v_dia)::smallint = any(_dias)) then
      return v_cand;
    end if;
  end loop;
  return null;
end $$;

-- Converte automações vencidas em missões (idempotente por horário). Retorna quantas criou.
create function escritorio_privado.motor_processar_automacoes() returns integer
language plpgsql security definer set search_path='' as $$
declare a escritorio_privado.automacoes; ag public.agentes_ia; v_missao uuid; v_chave text; v_n integer := 0;
begin
  if not coalesce((select ligado from escritorio_privado.motor_config), false) then return 0; end if;
  for a in select * from escritorio_privado.automacoes
           where ativa and proxima_execucao <= now() order by proxima_execucao limit 20 for update skip locked
  loop
    v_chave := 'auto:' || a.id || ':' || to_char(a.proxima_execucao at time zone 'UTC', 'YYYYMMDDHH24MI');
    select * into ag from public.agentes_ia where id = a.agente_id;
    if ag.ativo and public.is_gestor(a.criada_por) and public.is_interno_ativo(a.criada_por) then
      insert into escritorio_privado.missoes(titulo, objetivo, origem, solicitada_por, prioridade, chave)
        values (left(a.nome, 200), a.instrucoes, 'rotina', a.criada_por, a.prioridade, v_chave)
        on conflict (chave) do nothing returning id into v_missao;
      if v_missao is not null then
        insert into escritorio_privado.missao_tarefas(missao_id, agente_id, titulo, instrucoes)
          values (v_missao, a.agente_id, left(a.nome, 200), a.instrucoes);
        perform escritorio_privado.auditar('sistema', null, 'automacao.executada', a.id::text,
          jsonb_build_object('missao', v_missao, 'agente', a.agente_id));
        v_n := v_n + 1;
      end if;
    else
      perform escritorio_privado.auditar('sistema', null, 'automacao.pulada', a.id::text,
        jsonb_build_object('motivo', case when not ag.ativo then 'agente pausado' else 'responsável sem acesso de gestão' end));
    end if;
    update escritorio_privado.automacoes
      set ultima_execucao = now(), ultima_missao = coalesce(v_missao, ultima_missao),
          proxima_execucao = escritorio_privado.automacao_proxima(frequencia, intervalo_minutos, hora, dias_semana, fuso, now())
      where id = a.id;
    v_missao := null;
  end loop;
  return v_n;
end $$;
revoke all on function escritorio_privado.motor_processar_automacoes() from public, anon, authenticated;

-- ---------------------------------------------------------------- espera entre tentativas (backoff)
alter table escritorio_privado.missao_tarefas add column proxima_tentativa_em timestamptz;

-- Falha que volta para a fila espera 2, 4, 8… minutos (até 60) antes da próxima tentativa.
create function escritorio_privado.tarefa_backoff() returns trigger
language plpgsql set search_path='' as $$
begin
  if old.estado = 'executando' and new.estado = 'pendente' and new.tentativas > 0 and new.tentativas >= old.tentativas then
    new.proxima_tentativa_em := now() + make_interval(mins => least(60, power(2, new.tentativas)::integer));
  elsif new.estado <> 'pendente' then
    new.proxima_tentativa_em := null;
  end if;
  return new;
end $$;
create trigger motor_tarefa_backoff before update of estado on escritorio_privado.missao_tarefas
  for each row execute function escritorio_privado.tarefa_backoff();

-- Reserva com a espera entre tentativas (cópia da Fase 2 + uma condição).
create or replace function public.motor_reservar_tarefas(_limite integer default 3)
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
      and (mt.proxima_tentativa_em is null or mt.proxima_tentativa_em <= now())  -- espera entre tentativas
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

-- Despertador: automações → eventos do DJEN → acorda o motor se houver tarefa pronta.
create or replace function escritorio_privado.motor_cron()
returns void language plpgsql security definer set search_path='' as $$
declare v_url text; v_segredo text;
begin
  if not coalesce((select ligado from escritorio_privado.motor_config), false) then return; end if;
  perform escritorio_privado.motor_processar_automacoes();
  perform escritorio_privado.motor_processar_eventos();
  if not exists(select 1 from escritorio_privado.missao_tarefas
                where (estado = 'pendente' and (proxima_tentativa_em is null or proxima_tentativa_em <= now()))
                   or (estado = 'executando' and reservada_ate < now())) then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_segredo from vault.decrypted_secrets where name = 'djen_cron_secret';
  if v_url is null or v_segredo is null then return; end if;
  perform net.http_post(url := v_url || '/functions/v1/motor-missoes',
    headers := jsonb_build_object('Content-Type','application/json','x-djen-cron-secret', v_segredo),
    body := '{"acao":"pulso"}'::jsonb, timeout_milliseconds := 5000);
end $$;
revoke all on function escritorio_privado.motor_cron() from public, anon, authenticated;

-- ---------------------------------------------------------------- RPCs (somente backend, gestor ativo)
create function escritorio_privado.exigir_gestor(_usuario uuid) returns void
language plpgsql stable set search_path='' as $$
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  if not public.is_gestor(_usuario) or not public.is_interno_ativo(_usuario) then
    raise exception 'Gestor ativo necessário' using errcode='42501';
  end if;
end $$;

create function public.motor_automacoes(_usuario uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
  perform escritorio_privado.exigir_gestor(_usuario);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', a.id, 'nome', a.nome, 'setor', a.setor, 'agente_id', a.agente_id, 'agente', ag.nome, 'instrucoes', a.instrucoes,
      'frequencia', a.frequencia, 'intervalo_minutos', a.intervalo_minutos, 'hora', to_char(a.hora, 'HH24:MI'),
      'dias_semana', a.dias_semana, 'fuso', a.fuso, 'prioridade', a.prioridade, 'ativa', a.ativa,
      'proxima_execucao', a.proxima_execucao, 'ultima_execucao', a.ultima_execucao,
      'ultima_missao_estado', (select m.estado from escritorio_privado.missoes m where m.id = a.ultima_missao))
      order by a.setor, a.nome)
    from escritorio_privado.automacoes a join public.agentes_ia ag on ag.id = a.agente_id), '[]'::jsonb);
end $$;

-- Cria ou altera (sem _id cria). Validação aqui, não só na tela.
create function public.motor_salvar_automacao(_usuario uuid, _id uuid, _dados jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_freq text := _dados->>'frequencia'; v_hora time; v_int integer; v_dias smallint[];
begin
  perform escritorio_privado.exigir_gestor(_usuario);
  if not exists(select 1 from public.agentes_ia where id = (_dados->>'agente_id')::uuid) then raise exception 'Agente inválido'; end if;
  v_hora := nullif(_dados->>'hora', '')::time;
  v_int := nullif(_dados->>'intervalo_minutos', '')::integer;
  v_dias := coalesce((select array_agg(x::smallint) from jsonb_array_elements_text(coalesce(_dados->'dias_semana', '[]')) x), '{}');
  if _id is null then
    insert into escritorio_privado.automacoes(nome, setor, agente_id, instrucoes, frequencia, intervalo_minutos, hora,
        dias_semana, prioridade, criada_por)
      values (_dados->>'nome', coalesce(_dados->>'setor', 'controladoria'), (_dados->>'agente_id')::uuid, _dados->>'instrucoes',
        v_freq, case when v_freq = 'intervalo' then v_int end, case when v_freq <> 'intervalo' then v_hora end,
        case when v_freq = 'semanal' then v_dias end, coalesce((_dados->>'prioridade')::smallint, 3), _usuario)
      returning id into v_id;
  else
    update escritorio_privado.automacoes set
        nome = _dados->>'nome', setor = coalesce(_dados->>'setor', setor), agente_id = (_dados->>'agente_id')::uuid,
        instrucoes = _dados->>'instrucoes', frequencia = v_freq,
        intervalo_minutos = case when v_freq = 'intervalo' then v_int end,
        hora = case when v_freq <> 'intervalo' then v_hora end,
        dias_semana = case when v_freq = 'semanal' then v_dias end,
        prioridade = coalesce((_dados->>'prioridade')::smallint, prioridade),
        proxima_execucao = case when ativa then escritorio_privado.automacao_proxima(v_freq, v_int, v_hora, v_dias, fuso, now()) end,
        atualizada_em = now()
      where id = _id returning id into v_id;
    if v_id is null then raise exception 'Automação não encontrada'; end if;
  end if;
  perform escritorio_privado.auditar('usuario', _usuario, 'automacao.salva', v_id::text, _dados - 'instrucoes');
  return v_id;
end $$;

create function public.motor_alternar_automacao(_usuario uuid, _id uuid, _ativa boolean)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  perform escritorio_privado.exigir_gestor(_usuario);
  update escritorio_privado.automacoes set ativa = _ativa, atualizada_em = now(),
      proxima_execucao = case when _ativa
        then escritorio_privado.automacao_proxima(frequencia, intervalo_minutos, hora, dias_semana, fuso, now()) end
    where id = _id;
  if not found then raise exception 'Automação não encontrada'; end if;
  perform escritorio_privado.auditar('usuario', _usuario, case when _ativa then 'automacao.ligada' else 'automacao.desligada' end,
    _id::text, '{}'::jsonb);
  return true;
end $$;

-- Executar agora (sob demanda): cria a missão já, sem mudar o horário programado.
create function public.motor_executar_automacao(_usuario uuid, _id uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare a escritorio_privado.automacoes; v_missao uuid;
begin
  perform escritorio_privado.exigir_gestor(_usuario);
  select * into a from escritorio_privado.automacoes where id = _id;
  if not found then raise exception 'Automação não encontrada'; end if;
  v_missao := public.motor_criar_missao(_usuario, left(a.nome, 200), a.instrucoes, a.agente_id, 'manual', a.prioridade,
    'auto:' || a.id || ':manual:' || to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MI'));
  update escritorio_privado.automacoes set ultima_execucao = now(), ultima_missao = v_missao where id = _id;
  return v_missao;
end $$;

-- Fila de falhas: tarefas que esgotaram as tentativas nos últimos 30 dias.
create function public.motor_falhas(_usuario uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
  perform escritorio_privado.exigir_gestor(_usuario);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'tarefa_id', t.id, 'titulo', t.titulo, 'agente', ag.nome, 'missao', m.titulo, 'missao_id', m.id,
      'tentativas', t.tentativas, 'erro', t.erro, 'quando', t.concluida_em) order by t.concluida_em desc)
    from escritorio_privado.missao_tarefas t
    join escritorio_privado.missoes m on m.id = t.missao_id
    join public.agentes_ia ag on ag.id = t.agente_id
    where t.estado = 'falhou' and t.concluida_em > now() - interval '30 days'), '[]'::jsonb);
end $$;

-- Retentar uma tarefa da fila de falhas: volta para a fila do zero e reabre a missão.
create function public.motor_retentar_tarefa(_usuario uuid, _tarefa uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare t escritorio_privado.missao_tarefas;
begin
  perform escritorio_privado.exigir_gestor(_usuario);
  update escritorio_privado.missao_tarefas
    set estado = 'pendente', tentativas = 0, erro = null, concluida_em = null, proxima_tentativa_em = null
    where id = _tarefa and estado = 'falhou' returning * into t;
  if not found then return false; end if;
  update escritorio_privado.missoes set estado = 'aberta', encerrada_em = null
    where id = t.missao_id and estado in ('falhou', 'concluida');
  perform escritorio_privado.auditar('usuario', _usuario, 'tarefa.retentada', _tarefa::text, '{}'::jsonb);
  return true;
end $$;

-- Cancelar missão: nada pendente começa; o que está em execução termina e não é reaproveitado.
create function public.motor_cancelar_missao(_usuario uuid, _missao uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  perform escritorio_privado.exigir_gestor(_usuario);
  update escritorio_privado.missoes set estado = 'cancelada', encerrada_em = now() where id = _missao and estado = 'aberta';
  if not found then return false; end if;
  update escritorio_privado.missao_tarefas set estado = 'cancelada', erro = 'Missão cancelada', concluida_em = now()
    where missao_id = _missao and estado = 'pendente';
  update escritorio_privado.aprovacoes a set estado = 'recusada', decidida_por = _usuario, decidida_em = now(),
      observacao = 'Missão cancelada', atualizado_em = now()
    from escritorio_privado.missao_tarefas t
    where t.id = a.tarefa_id and t.missao_id = _missao and a.estado = 'pendente';
  perform escritorio_privado.auditar('usuario', _usuario, 'missao.cancelada', _missao::text, '{}'::jsonb);
  return true;
end $$;

do $$ declare f text; begin
  foreach f in array array['motor_automacoes(uuid)', 'motor_salvar_automacao(uuid,uuid,jsonb)',
    'motor_alternar_automacao(uuid,uuid,boolean)', 'motor_executar_automacao(uuid,uuid)', 'motor_falhas(uuid)',
    'motor_retentar_tarefa(uuid,uuid)', 'motor_cancelar_missao(uuid,uuid)']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
revoke all on function escritorio_privado.exigir_gestor(uuid), escritorio_privado.automacao_proxima(text,integer,time,smallint[],text,timestamptz)
  from public, anon, authenticated;
grant execute on function escritorio_privado.exigir_gestor(uuid),
  escritorio_privado.automacao_proxima(text,integer,time,smallint[],text,timestamptz) to service_role;
