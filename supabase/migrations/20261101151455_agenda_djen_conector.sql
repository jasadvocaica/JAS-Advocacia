-- Ponte para a conexão Google Calendar do usuário enquanto a conta de serviço
-- do servidor não está configurada. Os jobs HTTP de agenda ficam pausados.
create or replace function public.djen_reservar_agenda_conector(_limite integer default 10)
returns setof jsonb
language plpgsql security invoker set search_path = public, pg_temp
as $$
begin
  if _limite is null or _limite < 1 or _limite > 25 then raise exception 'Limite inválido'; end if;
  return query
  with pendentes as (
    select item_id from public.djen_agenda_fila
    where proxima_tentativa <= now() and tentativas < 8
    order by proxima_tentativa, item_id limit _limite for update skip locked
  ), reservados as (
    update public.djen_agenda_fila f set tentativas = tentativas + 1,
      proxima_tentativa = now() + interval '20 minutes'
    from pendentes p where f.item_id = p.item_id returning f.*
  )
  select jsonb_build_object(
    'item_id', f.item_id, 'acao', f.acao, 'revisao', f.revisao,
    'marcador', 'JAS-CONTROLADORIA:' || f.item_id::text,
    'calendario_id', 'juridico@julianaaraujoadvocacia.com',
    'evento_id', coalesce(g.google_event_id, f.evento_id),
    'item', case when c.id is null then null else jsonb_build_object(
      'titulo', c.titulo, 'tipo', c.tipo, 'status', c.status,
      'data_vencimento', c.data_vencimento, 'data_prazo_judicial', c.data_prazo_judicial,
      'prazo_conferido', c.prazo_conferido, 'responsavel', p.nome
    ) end
  )
  from reservados f left join public.controladoria_itens c on c.id = f.item_id
  left join public.controladoria_google_eventos g on g.item_id = f.item_id
  left join public.profiles p on p.id = c.responsavel_id;
end;
$$;
revoke all on function public.djen_reservar_agenda_conector(integer) from public, anon, authenticated;
grant execute on function public.djen_reservar_agenda_conector(integer) to service_role;

create or replace function public.djen_confirmar_agenda_conector(
  _item_id uuid, _revisao bigint, _evento_id text, _calendario_id text, _erro text default null
)
returns boolean
language plpgsql security invoker set search_path = public, pg_temp
as $$
declare trabalho public.djen_agenda_fila%rowtype;
begin
  select * into trabalho from public.djen_agenda_fila where item_id = _item_id for update;
  if not found or trabalho.revisao <> _revisao then return false; end if;
  if _erro is not null then
    update public.djen_agenda_fila set erro = left(_erro, 500),
      proxima_tentativa = now() + interval '1 hour' where item_id = _item_id;
    return false;
  end if;
  if _calendario_id is distinct from 'juridico@julianaaraujoadvocacia.com' then
    raise exception 'Calendário fora do escopo autorizado';
  end if;
  if trabalho.acao = 'delete' or exists (
    select 1 from public.controladoria_itens where id = _item_id and status = 'cancelado'
  ) then
    delete from public.controladoria_google_eventos where item_id = _item_id;
  else
    if nullif(_evento_id, '') is null then raise exception 'Confirme o evento antes de remover da fila'; end if;
    insert into public.controladoria_google_eventos(item_id, google_event_id, google_calendar_id,
      ultimo_sync, ultimo_erro, tentativas_sync)
    values (_item_id, _evento_id, _calendario_id, now(), null, 0)
    on conflict (item_id) do update set google_event_id = excluded.google_event_id,
      google_calendar_id = excluded.google_calendar_id, ultimo_sync = now(), ultimo_erro = null;
  end if;
  delete from public.djen_agenda_fila where item_id = _item_id and revisao = _revisao;
  return true;
end;
$$;
revoke all on function public.djen_confirmar_agenda_conector(uuid,bigint,text,text,text) from public, anon, authenticated;
grant execute on function public.djen_confirmar_agenda_conector(uuid,bigint,text,text,text) to service_role;
