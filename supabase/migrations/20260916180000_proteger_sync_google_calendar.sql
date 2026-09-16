-- Protege a chamada banco -> Edge Function com segredo no Vault e permite
-- registrar a primeira falha antes de o evento existir no Google Calendar.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'calendar_sync_secret') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'calendar_sync_secret',
      'Segredo interno do gatilho da Controladoria para o Google Calendar',
      null
    );
  end if;
end;
$$;

create or replace function public.validar_calendar_sync_secret(_secret text)
returns boolean
language sql
stable
security definer
set search_path = public, vault
as $$
  select exists (
    select 1
      from vault.decrypted_secrets
     where name = 'calendar_sync_secret'
       and decrypted_secret = coalesce(_secret, '')
  );
$$;

revoke all on function public.validar_calendar_sync_secret(text) from public, anon, authenticated;
grant execute on function public.validar_calendar_sync_secret(text) to service_role;

alter table public.controladoria_google_eventos
  alter column google_event_id drop not null;

create or replace function public.notificar_sync_google_calendar()
returns trigger
language plpgsql
security definer
set search_path = public, net, vault
as $$
declare
  v_action text;
  v_item_id uuid;
  v_event_id text;
  v_calendar_id text;
  v_sync_secret text;
  v_url text := 'https://mzwnljgujheumdslkloc.supabase.co/functions/v1/controladoria-sync-calendar';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16d25samd1amhldW1kc2xrbG9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzODE0MTAsImV4cCI6MjA4MTk1NzQxMH0.6ouGkpI37gL4iGXi2C1yZqUNFFi0pGmtQOKe2c-135c';
begin
  select decrypted_secret into v_sync_secret
    from vault.decrypted_secrets
   where name = 'calendar_sync_secret';

  if v_sync_secret is null then
    raise exception 'Segredo interno do Google Calendar não configurado';
  end if;

  if tg_op = 'DELETE' then
    v_action := 'delete'; v_item_id := old.id;
    select google_event_id, google_calendar_id into v_event_id, v_calendar_id
      from public.controladoria_google_eventos where item_id = old.id;
  elsif tg_op = 'INSERT' then
    v_action := 'upsert'; v_item_id := new.id;
  else
    if new.titulo is distinct from old.titulo
       or new.descricao is distinct from old.descricao
       or new.tipo is distinct from old.tipo
       or new.status is distinct from old.status
       or new.prioridade is distinct from old.prioridade
       or new.data_vencimento is distinct from old.data_vencimento
       or new.local is distinct from old.local
       or new.link_virtual is distinct from old.link_virtual
       or new.vara is distinct from old.vara
       or new.juiz is distinct from old.juiz then
      v_action := 'upsert'; v_item_id := new.id;
    else
      return new;
    end if;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon,
      'apikey', v_anon,
      'x-calendar-sync-secret', v_sync_secret
    ),
    body := jsonb_build_object(
      'action', v_action,
      'item_id', v_item_id,
      'event_id', v_event_id,
      'calendar_id', v_calendar_id
    )
  );

  return coalesce(new, old);
exception when others then
  return coalesce(new, old);
end;
$$;
