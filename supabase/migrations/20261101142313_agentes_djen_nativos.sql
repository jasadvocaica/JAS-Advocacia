-- Os dois primeiros agentes funcionam no Supabase, sem webhooks externos.
-- A publicação é a fila persistente: erros voltam à fila com espera progressiva.
alter table public.pje_monitoramentos
  add column proxima_consulta_em timestamptz not null default now();
create index pje_monitoramentos_proxima_consulta_idx
  on public.pje_monitoramentos(proxima_consulta_em, id) where ativo;
alter table public.pje_publicacoes
  add column triagem_tentativas integer not null default 0,
  add column triagem_erro text,
  add column triagem_proxima_tentativa timestamptz not null default now();

create index pje_publicacoes_triagem_pendente_idx
  on public.pje_publicacoes (triagem_proxima_tentativa, id)
  where item_controladoria_id is null and triagem_tentativas < 8;
create index if not exists pje_publicacoes_identidade_idx
  on public.pje_publicacoes (pje_id, numero_processo_limpo);

insert into public.agentes_ia (slug, nome, descricao, area, exige_aprovacao, ordem)
values ('monitor-djen', 'Monitor DJEN',
  'Consulta publicações oficiais por OAB e CNJ e encaminha para a triagem da Controladoria.',
  'processual', false, 0)
on conflict (slug) do nothing;

update public.agentes_ia
set nome = 'Assistente de Controladoria',
    descricao = 'Cria e recupera tarefas de triagem das publicações DJEN. O prazo judicial é conferido na Controladoria antes de ser tratado como definitivo.',
    exige_aprovacao = false
where slug = 'monitor-prazos';

-- Apenas service_role pode executar. SECURITY INVOKER mantém as regras de
-- privilégio do chamador; não cria uma API administrativa para o navegador.
create or replace function public.djen_preparar_triagem(_publicacao_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  pub public.pje_publicacoes%rowtype;
  proc public.processos%rowtype;
  v_item uuid;
  v_andamento uuid;
  v_vencimento date;
  v_identidade text;
begin
  select * into pub from public.pje_publicacoes where id = _publicacao_id;
  if not found then raise exception 'Publicação não encontrada'; end if;

  -- A mesma publicação pode chegar por OAB e CNJ. Serializar pelo identificador
  -- oficial impede criar duas tarefas em execuções concorrentes.
  v_identidade := coalesce(nullif(pub.pje_id, ''), nullif(pub.hash_pje, ''), pub.id::text)
    || ':' || coalesce(pub.numero_processo_limpo, '');
  if not pg_try_advisory_xact_lock(hashtextextended(v_identidade, 0)) then
    raise exception 'Publicação reservada por outra execução' using errcode = '55P03';
  end if;
  select * into pub from public.pje_publicacoes where id = _publicacao_id for update;
  if pub.item_controladoria_id is not null then return pub.item_controladoria_id; end if;

  if pub.processo_id is not null then
    select * into proc from public.processos where id = pub.processo_id;
  elsif nullif(pub.numero_processo_limpo, '') is not null then
    select * into proc from public.processos
    where numero_cnj_limpo = pub.numero_processo_limpo;
  end if;
  if proc.id is null then raise exception 'Processo não cadastrado: vincule a publicação'; end if;
  if proc.responsavel_id is null or not public.is_interno_ativo(proc.responsavel_id) then
    raise exception 'Defina um responsável interno ativo no processo';
  end if;

  select p.item_controladoria_id, p.andamento_id into v_item, v_andamento
  from public.pje_publicacoes p
  where p.id <> pub.id and p.processo_id = proc.id
    and p.item_controladoria_id is not null
    and ((nullif(pub.pje_id, '') is not null and p.pje_id = pub.pje_id)
      or (nullif(pub.hash_pje, '') is not null and p.hash_pje = pub.hash_pje))
  order by p.id limit 1;

  if v_item is null then
    v_andamento := pub.andamento_id;
    if v_andamento is null then
      select id into v_andamento from public.andamentos
      where processo_id = proc.id and datajud_id = 'djen_' || pub.id::text;
    end if;
    if v_andamento is null then
      insert into public.andamentos (processo_id, data, descricao, fonte, datajud_id)
      values (proc.id, coalesce(pub.data_disponibilizacao, (now() at time zone 'America/Cuiaba')::date),
        'DJEN — ' || coalesce(pub.tipo_comunicacao, 'Publicação') || ': ' ||
          left(coalesce(pub.texto_publicacao, ''), 1000), 'pje_comunica', 'djen_' || pub.id::text)
      returning id into v_andamento;
    end if;

    -- A meta de triagem é calculada a partir do recebimento, não retroage à
    -- publicação antiga e nunca é gravada como prazo judicial.
    v_vencimento := public.adicionar_dias_uteis((now() at time zone 'America/Cuiaba')::date, 1);
    if v_vencimento is null then raise exception 'Não foi possível calcular a meta interna'; end if;
    insert into public.controladoria_itens (
      tipo, titulo, descricao, processo_id, cliente_id, responsavel_id,
      data_vencimento, data_prazo_interno, prioridade, status, origem, prazo_conferido
    ) values (
      'intimacao', 'Triar publicação DJEN — ' || coalesce(pub.numero_processo, pub.numero_processo_limpo, ''),
      concat_ws(E'\n',
        'Tipo: ' || coalesce(pub.tipo_comunicacao, 'Publicação'),
        'Órgão: ' || coalesce(pub.nome_orgao, pub.sigla_tribunal, 'Não informado'),
        'Disponibilização: ' || coalesce(pub.data_disponibilizacao::text, 'Não informada'),
        pub.texto_publicacao, 'Certidão: ' || pub.link_certidao,
        'ATENÇÃO: meta interna de triagem. Conferir intimação, termo inicial, contagem e prazo judicial na fonte.'),
      proc.id, proc.cliente_id, proc.responsavel_id,
      (v_vencimento + time '18:00') at time zone 'America/Cuiaba', v_vencimento,
      'alta', 'pendente', 'pje_publicacao', false
    ) returning id into v_item;
    insert into public.controladoria_responsaveis (item_id, user_id, papel)
    values (v_item, proc.responsavel_id, 'principal') on conflict do nothing;
  end if;

  update public.pje_publicacoes set processo_id = proc.id,
    andamento_id = v_andamento, item_controladoria_id = v_item, triagem_erro = null
  where id = pub.id;
  return v_item;
end;
$$;

-- Resultado e aprovação são persistidos juntos. Cancelamento já registrado
-- nunca é sobrescrito por uma resposta tardia de executor.
create or replace function public.agentes_finalizar_execucao(_id uuid, _saida jsonb, _resumo text)
returns text language plpgsql security invoker set search_path = public, pg_temp
as $$
declare
  exec public.agente_execucoes%rowtype;
  v_aprovar boolean;
  v_status public.status_execucao;
begin
  select * into exec from public.agente_execucoes where id = _id for update;
  if not found then raise exception 'Execução não encontrada'; end if;
  if exec.status <> 'executando' then return exec.status::text; end if;
  select exige_aprovacao into v_aprovar from public.agentes_ia where id = exec.agente_id;
  if v_aprovar then
    if _saida->'resultado' is null or _saida->'resultado' = 'null'::jsonb then
      raise exception 'Executor não retornou resultado para revisão';
    end if;
    insert into public.agente_aprovacoes(execucao_id, conteudo) values (_id, _saida->'resultado');
  end if;
  v_status := case when v_aprovar then 'aguardando_aprovacao'::public.status_execucao else 'concluida'::public.status_execucao end;
  update public.agente_execucoes set status = v_status, saida = _saida, resumo = _resumo,
    finalizado_em = now(), duracao_ms = (extract(epoch from now() - iniciado_em) * 1000)::integer
  where id = _id;
  return v_status::text;
end;
$$;
revoke all on function public.agentes_finalizar_execucao(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.agentes_finalizar_execucao(uuid, jsonb, text) to service_role;

create or replace function public.agentes_registrar_decisao(_id uuid, _decisao text, _usuario uuid, _observacao text)
returns void language plpgsql security invoker set search_path = public, pg_temp
as $$
declare exec public.agente_execucoes%rowtype;
begin
  if _decisao not in ('aprovado','rejeitado') or _decisao is null then raise exception 'Decisão inválida'; end if;
  if not public.is_interno_ativo(_usuario) or not public.has_permission(_usuario, 'controladoria', 'editar') then
    raise exception 'Sem permissão para decidir' using errcode = '42501';
  end if;
  select * into exec from public.agente_execucoes where id = _id for update;
  if not found or exec.status <> 'aguardando_aprovacao' then raise exception 'Execução não aguarda aprovação'; end if;
  update public.agente_aprovacoes set decisao = _decisao, decidido_por = _usuario,
    decidido_em = now(), observacao = _observacao where execucao_id = _id and decisao is null;
  if not found then raise exception 'Aprovação já decidida'; end if;
  update public.agente_execucoes set status = case when _decisao = 'aprovado'
    then 'concluida'::public.status_execucao else 'rejeitada'::public.status_execucao end where id = _id;
  insert into public.agente_execucao_logs(execucao_id, mensagem)
  values (_id, 'Revisão registrada: ' || _decisao || '. Não executa ação externa.');
end;
$$;
revoke all on function public.agentes_registrar_decisao(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.agentes_registrar_decisao(uuid, text, uuid, text) to service_role;
revoke all on function public.djen_preparar_triagem(uuid) from public, anon, authenticated;
grant execute on function public.djen_preparar_triagem(uuid) to service_role;

create or replace function public.djen_processar_pendencias(_limite integer default 25)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  pub record;
  v_ok integer := 0;
  v_erros integer := 0;
  v_erro text;
  v_agente uuid;
  v_execucao uuid;
  v_inicio timestamptz := clock_timestamp();
  v_saida jsonb;
begin
  if _limite is null or _limite < 1 or _limite > 100 then
    raise exception 'Limite deve estar entre 1 e 100';
  end if;
  update public.agente_execucoes e set status = 'erro', finalizado_em = now(),
    erro = 'Executor interrompido. As publicações persistem na fila; execute novamente para conferir o resultado.'
  from public.agentes_ia a where e.agente_id = a.id
    and a.slug in ('monitor-djen', 'monitor-prazos')
    and e.status = 'executando' and e.iniciado_em < now() - interval '10 minutes';
  select id into v_agente from public.agentes_ia where slug = 'monitor-prazos' and ativo;
  if v_agente is null then return jsonb_build_object('pausado', true, 'processadas', 0, 'erros', 0); end if;

  for pub in
    select id, triagem_tentativas from public.pje_publicacoes
    where item_controladoria_id is null and triagem_tentativas < 8
      and triagem_proxima_tentativa <= now()
    order by triagem_proxima_tentativa, id
    limit _limite for update skip locked
  loop
    begin
      perform public.djen_preparar_triagem(pub.id);
      v_ok := v_ok + 1;
    exception when lock_not_available then
      -- Outra reserva não consome uma tentativa por falha.
      update public.pje_publicacoes set triagem_proxima_tentativa = now() + interval '1 minute'
      where id = pub.id;
    when others then
      get stacked diagnostics v_erro = message_text;
      update public.pje_publicacoes set triagem_tentativas = triagem_tentativas + 1,
        triagem_erro = left(v_erro, 500),
        triagem_proxima_tentativa = now() + make_interval(mins => least(1440, 5 * (2 ^ pub.triagem_tentativas)::integer))
      where id = pub.id;
      v_erros := v_erros + 1;
    end;
  end loop;
  v_saida := jsonb_build_object('processadas', v_ok, 'erros', v_erros);
  if v_ok + v_erros > 0 then
    insert into public.agente_execucoes (agente_id, origem, status, saida, resumo, iniciado_em, finalizado_em, duracao_ms)
    values (v_agente, 'evento', case when v_erros > 0 then 'erro'::public.status_execucao else 'concluida'::public.status_execucao end,
      v_saida, format('%s publicações tratadas; %s pendências com erro', v_ok, v_erros),
      v_inicio, clock_timestamp(), (extract(epoch from clock_timestamp() - v_inicio) * 1000)::integer)
    returning id into v_execucao;
    insert into public.agente_execucao_logs (execucao_id, nivel, mensagem, detalhe)
    values (v_execucao, case when v_erros > 0 then 'warn' else 'info' end,
      'Triagem DJEN processada; falhas permanecem na fila com espera progressiva.', v_saida);
  end if;
  return v_saida;
end;
$$;
revoke all on function public.djen_processar_pendencias(integer) from public, anon, authenticated;
grant execute on function public.djen_processar_pendencias(integer) to service_role;

-- Cron usa o papel postgres; conceder explicitamente para instalações com
-- proprietário da migration diferente. Nenhuma chamada de IA é necessária.
grant execute on function public.djen_preparar_triagem(uuid) to postgres;
grant execute on function public.djen_processar_pendencias(integer) to postgres;
select cron.alter_job(cron.schedule('djen-triagem', '*/5 * * * *', 'select public.djen_processar_pendencias(25);'), active := false);

-- Preserva segredo e comando. O coletor consulta lotes de cinco monitoramentos;
-- cada monitoramento bem-sucedido volta à fila após uma hora.
do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname = 'djen-diario';
  if v_job is not null then
    perform cron.alter_job(v_job, schedule := '*/5 * * * *');
  end if;
end;
$$;
