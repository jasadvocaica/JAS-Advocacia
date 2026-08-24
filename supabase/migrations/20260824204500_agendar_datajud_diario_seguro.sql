-- Agendamento diário às 06:00 em Cuiabá (10:00 UTC).
-- O segredo fica exclusivamente no Vault do Supabase.
create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (
    select 1 from vault.secrets where name = 'datajud_cron_secret'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'datajud_cron_secret',
      'Segredo interno para o agendamento diário do DataJud'
    );
  end if;
end
$$;

create or replace function public.validar_datajud_cron_secret(_secret text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    length(coalesce(_secret, '')) >= 32
    and exists (
      select 1
      from vault.decrypted_secrets
      where name = 'datajud_cron_secret'
        and decrypted_secret = _secret
    );
$$;

revoke all on function public.validar_datajud_cron_secret(text) from public;
grant execute on function public.validar_datajud_cron_secret(text) to service_role;

do $$
declare
  _job record;
begin
  for _job in
    select jobid from cron.job where jobname = 'datajud-diario'
  loop
    perform cron.unschedule(_job.jobid);
  end loop;
end
$$;

select cron.schedule(
  'datajud-diario',
  '0 10 * * *',
  $job$
    select net.http_post(
      url := 'https://mzwnljgujheumdslkloc.supabase.co/functions/v1/datajud-consulta',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-datajud-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'datajud_cron_secret'
          limit 1
        )
      ),
      body := '{"modo":"agendado"}'::jsonb
    );
  $job$
);
