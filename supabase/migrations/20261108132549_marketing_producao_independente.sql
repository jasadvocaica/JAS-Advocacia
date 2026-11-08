-- A produção editorial continua mesmo quando uma fonte externa falha.
do $$declare d text; alvo text:='update marketing_privado.ia_rotinas set ativa=jsonb_array_length(_fontes)=0,proxima_execucao=case when jsonb_array_length(_fontes)=0 then marketing_privado.ia_proxima(hora,dias_uteis,now()) end where slug=''producao_original'';'; begin
 select pg_get_functiondef('marketing_privado.rotinas_ia(jsonb)'::regprocedure) into d;
 if position(alvo in d)=0 then raise exception 'Configuração das rotinas mudou; revisar a migração'; end if;
 execute replace(d,alvo,'update marketing_privado.ia_rotinas set ativa=true,proxima_execucao=coalesce(proxima_execucao,marketing_privado.ia_proxima(hora,dias_uteis,now())) where slug=''producao_original'';');
end;$$;
update marketing_privado.ia_rotinas set ativa=true,proxima_execucao=coalesce(proxima_execucao,marketing_privado.ia_proxima(hora,dias_uteis,now())) where slug='producao_original';
