-- Outbox durável, inclusive após exclusão do item. Nunca armazena segredos.
create table public.djen_agenda_fila (
  item_id uuid primary key,
  acao text not null check (acao in ('upsert', 'delete')),
  evento_id text,
  calendario_id text,
  revisao bigint not null default 1,
  revisao_enviada bigint,
  request_id bigint,
  tentativas integer not null default 0,
  proxima_tentativa timestamptz not null default now(),
  erro text
);
alter table public.djen_agenda_fila enable row level security;
grant select on public.djen_agenda_fila to authenticated;
grant all on public.djen_agenda_fila to service_role;
create policy "controladoria le fila agenda DJEN" on public.djen_agenda_fila
  for select to authenticated
  using (public.is_interno_ativo(auth.uid()) and public.has_permission(auth.uid(), 'controladoria', 'visualizar'));
create index djen_agenda_fila_pendente_idx on public.djen_agenda_fila(proxima_tentativa)
  where tentativas < 8;

alter table public.controladoria_google_eventos
  add column tentativas_sync integer not null default 0;

create or replace function public.djen_notificar_agenda()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_evento text;
  v_calendario text;
begin
  if tg_op = 'DELETE' then
    if old.origem is distinct from 'pje_publicacao' then return old; end if;
    v_id := old.id;
  else
    if new.origem is distinct from 'pje_publicacao' then return new; end if;
    if tg_op = 'UPDATE' and to_jsonb(new) - array['atualizado_em', 'updated_at']
      = to_jsonb(old) - array['atualizado_em', 'updated_at'] then return new; end if;
    v_id := new.id;
  end if;
  select google_event_id, google_calendar_id into v_evento, v_calendario
  from public.controladoria_google_eventos where item_id = v_id;
  insert into public.djen_agenda_fila(item_id, acao, evento_id, calendario_id)
  values (v_id, case when tg_op = 'DELETE' then 'delete' else 'upsert' end, v_evento, v_calendario)
  on conflict (item_id) do update set acao = excluded.acao,
    evento_id = coalesce(excluded.evento_id, djen_agenda_fila.evento_id),
    calendario_id = coalesce(excluded.calendario_id, djen_agenda_fila.calendario_id),
    revisao = djen_agenda_fila.revisao + 1, request_id = null,
    tentativas = 0, proxima_tentativa = now(), erro = null;
  return coalesce(new, old);
end;
$$;
revoke all on function public.djen_notificar_agenda() from public, anon, authenticated;
create trigger trg_djen_agenda_salvar after insert or update on public.controladoria_itens
  for each row execute function public.djen_notificar_agenda();
create trigger trg_djen_agenda_excluir before delete on public.controladoria_itens
  for each row execute function public.djen_notificar_agenda();

create or replace function public.djen_despachar_agenda(_limite integer default 25)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  trabalho record;
  resposta record;
  v_secret text;
  v_request bigint;
  v_erro text;
  v_total integer := 0;
begin
  if _limite is null or _limite < 1 or _limite > 100 then raise exception 'Limite inválido'; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'calendar_sync_secret';
  for trabalho in
    select * from public.djen_agenda_fila
    where proxima_tentativa <= now() and (tentativas < 8 or request_id is not null)
    order by proxima_tentativa, item_id limit _limite for update skip locked
  loop
    begin
      if trabalho.request_id is not null then
        select status_code, error_msg into resposta from net._http_response where id = trabalho.request_id;
        if resposta.status_code between 200 and 299 and trabalho.revisao = trabalho.revisao_enviada then
          delete from public.djen_agenda_fila where item_id = trabalho.item_id;
          continue;
        end if;
        update public.djen_agenda_fila set request_id = null,
          erro = coalesce(resposta.error_msg, 'Agenda não confirmou a sincronização HTTP ' || coalesce(resposta.status_code::text, 'sem resposta'))
        where item_id = trabalho.item_id;
        if trabalho.tentativas >= 8 then continue; end if;
      end if;
      if nullif(v_secret, '') is null then raise exception 'Segredo da agenda não configurado'; end if;
      select net.http_post(
        url := 'https://mzwnljgujheumdslkloc.supabase.co/functions/v1/controladoria-sync-calendar',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-calendar-sync-secret', v_secret),
        body := jsonb_build_object('action', trabalho.acao, 'item_id', trabalho.item_id,
          'event_id', trabalho.evento_id, 'calendar_id', trabalho.calendario_id),
        timeout_milliseconds := 30000
      ) into v_request;
      update public.djen_agenda_fila set request_id = v_request, revisao_enviada = trabalho.revisao,
        tentativas = tentativas + 1, proxima_tentativa = now() + interval '5 minutes'
      where item_id = trabalho.item_id;
      v_total := v_total + 1;
    exception when others then
      get stacked diagnostics v_erro = message_text;
      update public.djen_agenda_fila set erro = left(v_erro, 500), request_id = null,
        tentativas = tentativas + 1, proxima_tentativa = now() + interval '5 minutes'
      where item_id = trabalho.item_id;
    end;
  end loop;
  return v_total;
end;
$$;
revoke all on function public.djen_despachar_agenda(integer) from public, anon, authenticated;
grant execute on function public.djen_despachar_agenda(integer) to service_role, postgres;
select cron.alter_job(cron.schedule('djen-agenda', '*/5 * * * *', 'select public.djen_despachar_agenda(25);'), active := false);

create or replace function public.djen_resumo_operacional()
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_interno_ativo(auth.uid())
    or not public.has_permission(auth.uid(), 'controladoria', 'visualizar') then
    raise exception 'Sem permissão para consultar a operação DJEN' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'triagem_pendente', (select count(*) from public.pje_publicacoes where item_controladoria_id is null),
    'triagem_com_erro', (select count(*) from public.pje_publicacoes where item_controladoria_id is null and triagem_erro is not null),
    'agenda_pendente', (select count(*) from public.djen_agenda_fila),
    'agenda_com_erro', (select count(*) from public.djen_agenda_fila where erro is not null),
    'ultima_consulta', (select max(finalizado_em) from public.pje_sync_log where status = 'concluido'),
    'falhas', (select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) from (
      (select 'triagem' as tipo, coalesce(numero_processo, numero_processo_limpo, id::text) as referencia,
        triagem_erro as erro from public.pje_publicacoes
        where item_controladoria_id is null and triagem_erro is not null
        order by triagem_proxima_tentativa limit 5)
      union all
      (select 'agenda', item_id::text, erro from public.djen_agenda_fila
        where erro is not null order by proxima_tentativa limit 5)
    ) f)
  );
end;
$$;
revoke all on function public.djen_resumo_operacional() from public, anon;
grant execute on function public.djen_resumo_operacional() to authenticated;

-- Retentativa manual após corrigir responsável, vínculo ou autorização Google.
create or replace function public.djen_reprocessar_pendencias()
returns jsonb language plpgsql security invoker set search_path = public, pg_temp
as $$
begin
  update public.pje_publicacoes set triagem_tentativas = 0, triagem_proxima_tentativa = now()
  where item_controladoria_id is null and triagem_erro is not null;
  update public.djen_agenda_fila set tentativas = 0, proxima_tentativa = now()
  where erro is not null;
  return public.djen_processar_pendencias(25);
end;
$$;
revoke all on function public.djen_reprocessar_pendencias() from public, anon, authenticated;
grant execute on function public.djen_reprocessar_pendencias() to service_role;

insert into public.djen_agenda_fila(item_id, acao)
select c.id, 'upsert' from public.controladoria_itens c
left join public.controladoria_google_eventos g on g.item_id = c.id
where c.origem = 'pje_publicacao' and c.status not in ('cancelado', 'concluido')
  and (g.google_event_id is null or g.ultimo_erro is not null)
on conflict do nothing;
