-- Permite que um usuário interno reagende uma sincronização com falha,
-- preservando o segredo do Vault e sem expô-lo ao navegador.

create or replace function public.reagendar_sync_google_calendar(_item_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public, net, vault
as $$
declare
  v_sync_secret text;
  v_request_id bigint;
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16d25samd1amhldW1kc2xrbG9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzODE0MTAsImV4cCI6MjA4MTk1NzQxMH0.6ouGkpI37gL4iGXi2C1yZqUNFFi0pGmtQOKe2c-135c';
begin
  if auth.uid() is null or not public.is_interno_ativo(auth.uid()) then
    raise exception 'Usuário sem permissão para sincronizar o calendário'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.controladoria_itens where id = _item_id) then
    raise exception 'Item da Controladoria não encontrado'
      using errcode = 'P0002';
  end if;

  select decrypted_secret into v_sync_secret
    from vault.decrypted_secrets
   where name = 'calendar_sync_secret';

  if v_sync_secret is null then
    raise exception 'Segredo interno do Google Calendar não configurado';
  end if;

  select net.http_post(
    url := 'https://mzwnljgujheumdslkloc.supabase.co/functions/v1/controladoria-sync-calendar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon,
      'apikey', v_anon,
      'x-calendar-sync-secret', v_sync_secret
    ),
    body := jsonb_build_object('action', 'upsert', 'item_id', _item_id)
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.reagendar_sync_google_calendar(uuid) from public, anon;
grant execute on function public.reagendar_sync_google_calendar(uuid) to authenticated;
