-- Agendador dedicado às automações comerciais. O segredo nunca entra no Git.
-- Aplicar depois de publicar a versão correspondente de whatsapp-automacoes.
create extension if not exists pgcrypto with schema extensions;
do $$
begin
  if not exists (
    select 1 from vault.secrets
    where name = 'jas_whatsapp_automacoes_cron_secret'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'jas_whatsapp_automacoes_cron_secret',
      'Segredo exclusivo do agendador de automações comerciais'
    );
  end if;
end
$$;

create or replace function public.validar_whatsapp_automacoes_cron_secret(_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    length(coalesce(_secret, '')) = 64
    and exists (
      select 1
      from vault.decrypted_secrets
      where name = 'jas_whatsapp_automacoes_cron_secret'
        and decrypted_secret = _secret
    );
$$;
revoke all on function public.validar_whatsapp_automacoes_cron_secret(text)
  from public, anon, authenticated;
grant execute on function public.validar_whatsapp_automacoes_cron_secret(text)
  to service_role;

do $$
declare _job record;
begin
  for _job in
    select jobid from cron.job where jobname = 'jas_whatsapp_automacoes'
  loop
    perform cron.unschedule(_job.jobid);
  end loop;
end
$$;

select cron.schedule(
  'jas_whatsapp_automacoes',
  '* * * * *',
  $job$
    select net.http_post(
      url := 'https://mzwnljgujheumdslkloc.supabase.co/functions/v1/whatsapp-automacoes',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'jas_whatsapp_automacoes_cron_secret'
          limit 1
        )
      ),
      body := '{}'::jsonb
    );
  $job$
);