create or replace function public.escritorio_agendar_analistas() returns integer
language plpgsql security invoker set search_path='' as $$
declare a record; v_secret text; v_total integer:=0;
begin
  -- Encerramento observável de workers interrompidos; reservas financeiras permanecem.
  update public.agente_execucoes e set status='erro',erro='Execução interrompida; confira antes de repetir.',finalizado_em=now()
    from public.agentes_ia catalogo where catalogo.id=e.agente_id and catalogo.executor='analista_operacional'
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
