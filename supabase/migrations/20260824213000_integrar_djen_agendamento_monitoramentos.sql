-- Integração DJEN: monitoramentos automáticos, segredo no Vault e job diário.
create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (select 1 from vault.secrets where name='djen_cron_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'djen_cron_secret',
      'Segredo interno para sincronização diária do DJEN'
    );
  end if;
end
$$;

create or replace function public.validar_djen_cron_secret(_secret text)
returns boolean
language sql
stable
security definer
set search_path=public, pg_temp
as $$
  select length(coalesce(_secret,'')) >= 32
    and exists (
      select 1 from vault.decrypted_secrets
      where name='djen_cron_secret' and decrypted_secret=_secret
    );
$$;

revoke all on function public.validar_djen_cron_secret(text) from public;
grant execute on function public.validar_djen_cron_secret(text) to service_role;

insert into public.pje_monitoramentos (tipo, valor, rotulo, ativo, observacoes)
select 'cnj'::public.pje_monitoramento_tipo, p.numero_cnj_limpo,
       coalesce(p.numero_cnj,p.numero_cnj_limpo), true,
       'Criado automaticamente a partir do cadastro do processo'
from public.processos p
where p.tipo='judicial'
  and length(coalesce(p.numero_cnj_limpo,''))=20
  and not exists (
    select 1 from public.pje_monitoramentos m
    where m.ativo=true and m.tipo='cnj'
      and lower(m.valor)=lower(p.numero_cnj_limpo)
  );

insert into public.pje_monitoramentos (tipo, valor, uf_oab, rotulo, ativo, observacoes)
select 'oab'::public.pje_monitoramento_tipo, '34182', 'MT',
       'Juliana Araujo da Silva', true,
       'OAB identificada em comunicação oficial do DJEN'
where not exists (
  select 1 from public.pje_monitoramentos m
  where m.ativo=true and m.tipo='oab'
    and regexp_replace(m.valor,'\D','','g')='34182'
    and upper(coalesce(m.uf_oab,''))='MT'
);

create or replace function public.criar_monitoramento_djen_processo()
returns trigger
language plpgsql
security definer
set search_path=public, pg_temp
as $$
begin
  if new.tipo='judicial'
     and length(coalesce(new.numero_cnj_limpo,''))=20
     and not exists (
       select 1 from public.pje_monitoramentos m
       where m.ativo=true and m.tipo='cnj'
         and lower(m.valor)=lower(new.numero_cnj_limpo)
     )
  then
    insert into public.pje_monitoramentos (tipo, valor, rotulo, ativo, observacoes)
    values ('cnj'::public.pje_monitoramento_tipo, new.numero_cnj_limpo,
            coalesce(new.numero_cnj,new.numero_cnj_limpo), true,
            'Criado automaticamente a partir do cadastro do processo');
  end if;
  return new;
end
$$;

drop trigger if exists trg_criar_monitoramento_djen_processo on public.processos;
create trigger trg_criar_monitoramento_djen_processo
after insert or update of numero_cnj_limpo, tipo on public.processos
for each row execute function public.criar_monitoramento_djen_processo();

do $$
declare _job record;
begin
  for _job in select jobid from cron.job where jobname='djen-diario'
  loop
    perform cron.unschedule(_job.jobid);
  end loop;
end
$$;

select cron.schedule(
  'djen-diario',
  '30 10 * * *',
  $job$
    select net.http_post(
      url := 'https://mzwnljgujheumdslkloc.supabase.co/functions/v1/pje-comunica-sync',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-djen-cron-secret',(
          select decrypted_secret from vault.decrypted_secrets
          where name='djen_cron_secret' limit 1
        )
      ),
      body := '{"modo":"agendado","dias":7}'::jsonb,
      timeout_milliseconds := 120000
    );
  $job$
);
