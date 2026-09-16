-- Consolida alertas de prazo em uma única rotina nativa do Postgres.
-- Usa data_vencimento, que representa o prazo interno operacional.

create or replace function public.processar_alertas_controladoria()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_responsaveis integer := 0;
  v_gestores integer := 0;
begin
  with candidatos as (
    select ci.id, ci.titulo, ci.responsavel_id, ci.data_vencimento,
      case
        when ci.data_vencimento < now() then 'prazo_atrasado'
        when ci.data_vencimento <= now() + interval '24 hours' then 'prazo_24h'
        when ci.data_vencimento <= now() + interval '48 hours' then 'prazo_48h'
      end as tipo_alerta
    from public.controladoria_itens ci
    where ci.status not in ('concluido', 'cancelado')
      and ci.responsavel_id is not null
      and ci.data_vencimento <= now() + interval '48 hours'
  ),
  inseridos as (
    insert into public.notificacoes (user_id, item_id, tipo, titulo, descricao, link)
    select c.responsavel_id, c.id, c.tipo_alerta,
      case c.tipo_alerta
        when 'prazo_atrasado' then 'Prazo interno atrasado'
        when 'prazo_24h' then 'Prazo interno vence em até 24h'
        else 'Prazo interno vence em até 48h'
      end,
      c.titulo || ' — ' || to_char(c.data_vencimento at time zone 'America/Cuiaba', 'DD/MM/YYYY HH24:MI'),
      '/controladoria?item=' || c.id::text
    from candidatos c
    where c.tipo_alerta is not null
    on conflict (user_id, item_id, tipo, dia_chave) where item_id is not null do nothing
    returning 1
  )
  select count(*) into v_responsaveis from inseridos;

  with atrasados as (
    select ci.id, ci.titulo, ci.data_vencimento
    from public.controladoria_itens ci
    where ci.status not in ('concluido', 'cancelado')
      and ci.data_vencimento < now()
  ),
  gestores as (
    select distinct ur.user_id
    from public.user_roles ur
    where ur.role = 'gestor'
      and public.is_interno_ativo(ur.user_id)
  ),
  inseridos as (
    insert into public.notificacoes (user_id, item_id, tipo, titulo, descricao, link)
    select g.user_id, a.id, 'prazo_atrasado_gestao',
      'Prazo interno atrasado — atenção da gestão',
      a.titulo || ' — ' || to_char(a.data_vencimento at time zone 'America/Cuiaba', 'DD/MM/YYYY HH24:MI'),
      '/controladoria?item=' || a.id::text
    from atrasados a cross join gestores g
    on conflict (user_id, item_id, tipo, dia_chave) where item_id is not null do nothing
    returning 1
  )
  select count(*) into v_gestores from inseridos;

  return jsonb_build_object(
    'notificacoes_responsaveis', v_responsaveis,
    'notificacoes_gestores', v_gestores,
    'executado_em', now()
  );
end;
$$;

revoke all on function public.processar_alertas_controladoria() from public, anon, authenticated;
grant execute on function public.processar_alertas_controladoria() to service_role;

-- A atribuição continua imediata; o vencimento fica exclusivamente na rotina horária.
create or replace function public.notif_controladoria_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.responsavel_id is not null
     and (tg_op = 'INSERT' or old.responsavel_id is distinct from new.responsavel_id) then
    insert into public.notificacoes (user_id, item_id, tipo, titulo, descricao, link)
    values (
      new.responsavel_id, new.id, 'atribuicao', 'Item atribuído a você',
      new.titulo, '/controladoria?item=' || new.id
    )
    on conflict (user_id, item_id, tipo, dia_chave) where item_id is not null do nothing;
  end if;
  return new;
end;
$$;

do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'controladoria-alertas-horarios';
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;

  perform cron.schedule(
    'controladoria-alertas-horarios',
    '0 * * * *',
    'select public.processar_alertas_controladoria();'
  );
end;
$$;
