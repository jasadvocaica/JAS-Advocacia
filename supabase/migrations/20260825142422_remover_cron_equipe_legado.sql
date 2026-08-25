-- Remove o agendamento legado que apontava para outro projeto Supabase.
-- O fechamento mensal permanece disponível manualmente, restrito a gestores.
do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid
    from cron.job
   where jobname = 'equipe-job-mensal'
   limit 1;

  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
end
$$;
