-- Executar somente após publicar telegram e motor-missoes com os handlers 24h.
-- IDs são resolvidos pelos vínculos existentes; nenhum segredo é retornado.
begin;
set local role service_role;
do $$declare dono uuid;cfg record;begin
 select usuario_id into strict dono from escritorio_privado.operacao24h_config where ativo;
 for cfg in select c.* from escritorio_privado.agente_configuracoes c join public.agentes_ia a on a.id=c.agente_id
  where a.supervisor_id=dono and a.ativo and a.executor='analista_operacional' and a.nome in('Manu','Helena') loop
  if cfg.dados->>'intervalo_minutos' is not null then
   perform public.escritorio_salvar_config(dono,cfg.agente_id,cfg.revisao,jsonb_set(cfg.dados,'{intervalo_minutos}','null'::jsonb));
  end if;
 end loop;
 update marketing_privado.ia_rotinas set dias_uteis=false,
  proxima_execucao=case when ativa then least(proxima_execucao,marketing_privado.ia_proxima(hora,false,now())) else proxima_execucao end
  where criada_por=dono;
end;$$;
reset role;
select cron.alter_job((select jobid from cron.job where jobname='operacao24h-pulso'),active:=true);
commit;
