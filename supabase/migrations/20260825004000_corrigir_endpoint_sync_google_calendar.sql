create or replace function public.notificar_sync_google_calendar()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_action text;
  v_item_id uuid;
  v_url text := 'https://mzwnljgujheumdslkloc.supabase.co/functions/v1/controladoria-sync-calendar';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16d25samd1amhldW1kc2xrbG9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzODE0MTAsImV4cCI6MjA4MTk1NzQxMH0.6ouGkpI37gL4iGXi2C1yZqUNFFi0pGmtQOKe2c-135c';
begin
  if tg_op = 'DELETE' then
    v_action := 'delete'; v_item_id := old.id;
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
    else return new;
    end if;
  end if;
  perform extensions.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_anon),
    body := jsonb_build_object('action',v_action,'item_id',v_item_id)
  );
  return coalesce(new,old);
exception when others then
  return coalesce(new,old);
end;
$$;