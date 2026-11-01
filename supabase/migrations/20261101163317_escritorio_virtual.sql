-- Analistas contratados executam somente relatórios agregados, sem ações jurídicas.
alter table public.agentes_ia
  add column executor text,
  add column supervisor_id uuid references auth.users(id) on delete restrict,
  add column intervalo_minutos integer check (intervalo_minutos in (60,240,1440)),
  add column proxima_execucao timestamptz;

create function public.escritorio_reservar_analista(_agente uuid, _origem text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare a public.agentes_ia; v_id uuid;
begin
  select * into a from public.agentes_ia where id=_agente for update;
  if not found or not a.ativo or a.executor is distinct from 'analista_operacional' then return null; end if;
  if not public.is_interno_ativo(a.supervisor_id) or not public.is_gestor(a.supervisor_id) then return null; end if;
  if _origem not in ('manual','rotina') then raise exception 'Origem inválida'; end if;
  if exists(select 1 from public.agente_execucoes where agente_id=a.id and status in ('executando','aguardando_aprovacao')) then return null; end if;
  insert into public.agente_execucoes(agente_id,disparado_por,origem,status,entrada)
    values(a.id,a.supervisor_id,_origem,'executando',jsonb_build_object('funcao','analista_operacional')) returning id into v_id;
  update public.agentes_ia set proxima_execucao=case when intervalo_minutos is not null
    then now()+make_interval(mins=>intervalo_minutos) end where id=a.id;
  return v_id;
end; $$;
revoke all on function public.escritorio_reservar_analista(uuid,text) from public,anon,authenticated;
grant execute on function public.escritorio_reservar_analista(uuid,text) to service_role;

-- Não inclui dados pessoais, peças ou publicações no contexto enviado ao modelo.
create function public.escritorio_contexto_analista() returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('coletado_em',now(),'fuso','America/Cuiaba',
  'tarefas_por_status',(select coalesce(jsonb_object_agg(status,total),'{}') from
    (select status,count(*) total from public.controladoria_itens group by status) s),
  'execucoes_24h',(select coalesce(jsonb_object_agg(status,total),'{}') from
    (select status,count(*) total from public.agente_execucoes where iniciado_em>now()-interval '24 hours' group by status) s));
$$;
revoke all on function public.escritorio_contexto_analista() from public,anon,authenticated;
grant execute on function public.escritorio_contexto_analista() to service_role;

create function public.escritorio_agendar_analistas() returns integer
language plpgsql security invoker set search_path='' as $$
declare a record; v_secret text; v_total integer:=0;
begin
  -- Encerramento observável de workers interrompidos; reservas financeiras permanecem.
  update public.agente_execucoes e set status='erro',erro='Execução interrompida; confira antes de repetir.',finalizado_em=now()
    from public.agentes_ia a where a.id=e.agente_id and a.executor='analista_operacional'
    and e.status='executando' and e.iniciado_em<now()-interval '10 minutes';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='djen_cron_secret';
  if v_secret is null then return 0; end if;
  for a in select id,slug from public.agentes_ia where ativo and executor='analista_operacional'
    and intervalo_minutos is not null and proxima_execucao<=now()
    order by proxima_execucao limit 3 for update skip locked
  loop
    perform net.http_post(url:='https://mzwnljgujheumdslkloc.supabase.co/functions/v1/agentes-escritorio',
      headers:=jsonb_build_object('Content-Type','application/json','x-djen-cron-secret',v_secret),
      body:=jsonb_build_object('acao','rotina','agente_id',a.id),timeout_milliseconds:=120000);
    -- Repetição somente se o worker não adquirir o trabalho em cinco minutos.
    update public.agentes_ia set proxima_execucao=now()+interval '5 minutes' where id=a.id;
    v_total:=v_total+1;
  end loop;
  return v_total;
end; $$;
revoke all on function public.escritorio_agendar_analistas() from public,anon,authenticated;
grant execute on function public.escritorio_agendar_analistas() to service_role;
-- O worker faz a reserva sob lock; a verificação de vencimento cabe ao despachante.
-- A coleta DJEN, triagem e conector de agenda existentes continuam únicos.
select cron.schedule('escritorio-analistas','*/5 * * * *','select public.escritorio_agendar_analistas();');

-- O monitor agendado passa a aparecer na mesma mesa das execuções manuais.
alter table public.agente_execucoes add column consulta_djen_id uuid unique references public.pje_sync_log(id) on delete set null;
create function public.escritorio_registrar_consulta() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.modo<>'agendado' then return new; end if;
 insert into public.agente_execucoes(agente_id,origem,status,consulta_djen_id,iniciado_em,finalizado_em,duracao_ms,resumo,erro,saida)
 select a.id,'agendado',case when new.status='erro' then 'erro'::public.status_execucao
   when new.finalizado_em is not null then 'concluida'::public.status_execucao else 'executando'::public.status_execucao end,
   new.id,new.iniciado_em,new.finalizado_em,new.duracao_ms,
   case when new.finalizado_em is null then 'Consultando as fontes DJEN.' else format('DJEN: %s publicações novas, %s vinculadas, %s falhas.',new.total_novas,new.total_vinculadas,new.total_erros) end,
   case when new.status='erro' then coalesce(new.mensagem,'Falha na consulta DJEN') end,
   jsonb_build_object('novas',new.total_novas,'vinculadas',new.total_vinculadas,'erros',new.total_erros)
 from public.agentes_ia a where a.slug='monitor-djen'
 on conflict(consulta_djen_id) do update set status=excluded.status,finalizado_em=excluded.finalizado_em,
   duracao_ms=excluded.duracao_ms,resumo=excluded.resumo,erro=excluded.erro,saida=excluded.saida;
 return new;
end; $$;
revoke all on function public.escritorio_registrar_consulta() from public,anon,authenticated;
create trigger escritorio_consulta_djen after insert or update on public.pje_sync_log
 for each row execute function public.escritorio_registrar_consulta();
-- Reprocessa somente o espelhamento dos logs existentes; não consulta novamente o DJEN.
update public.pje_sync_log set status=status where modo='agendado' and iniciado_em>now()-interval '7 days';
