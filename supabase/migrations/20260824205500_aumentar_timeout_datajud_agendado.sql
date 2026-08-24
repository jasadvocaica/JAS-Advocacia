-- O CNJ pode levar mais de 5 segundos; evita falsos erros do agendador.
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
      body := '{"modo":"agendado"}'::jsonb,
      timeout_milliseconds := 120000
    );
  $job$
);
