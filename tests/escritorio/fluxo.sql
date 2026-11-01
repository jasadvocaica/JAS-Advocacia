begin;
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000991');
insert into profiles(id) values ('00000000-0000-0000-0000-000000000991');
insert into agentes_ia(id,slug,nome,executor,supervisor_id,intervalo_minutos,proxima_execucao,exige_aprovacao)
values ('00000000-0000-0000-0000-000000000992','analista-teste','Analista de teste','analista_operacional','00000000-0000-0000-0000-000000000991',1440,now(),true);
do $$declare v_exec uuid; begin
 if has_function_privilege('authenticated','public.escritorio_reservar_analista(uuid,text)','execute') then raise exception 'Reserva pública'; end if;
 v_exec:=public.escritorio_reservar_analista('00000000-0000-0000-0000-000000000992','manual');
 if v_exec is null then raise exception 'Não reservou'; end if;
 if public.escritorio_reservar_analista('00000000-0000-0000-0000-000000000992','manual') is not null then raise exception 'Duplicou execução ativa'; end if;
 perform public.agentes_finalizar_execucao(v_exec,'{"resultado":{"relatorio":"Entrega de teste"}}', 'Relatório entregue');
 if (select status from agente_execucoes where agente_execucoes.id=v_exec)<>'aguardando_aprovacao' then raise exception 'Ignorou revisão humana'; end if;
 if public.escritorio_reservar_analista('00000000-0000-0000-0000-000000000992','rotina') is not null then raise exception 'Repetiu sem revisão'; end if;
 update agentes_ia set ativo=false where slug='analista-teste';
 if public.escritorio_reservar_analista('00000000-0000-0000-0000-000000000992','manual') is not null then raise exception 'Executou pausado'; end if;
end;$$;
insert into pje_sync_log(id,modo,status,total_novas) values ('00000000-0000-0000-0000-000000000993','agendado','executando',0);
do $$ begin
 if not exists(select 1 from agente_execucoes where consulta_djen_id='00000000-0000-0000-0000-000000000993' and status='executando') then raise exception 'Monitor invisível'; end if;
end;$$;
update pje_sync_log set status='concluido',finalizado_em=now(),total_novas=2 where id='00000000-0000-0000-0000-000000000993';
do $$ begin
 if (select count(*) from agente_execucoes where consulta_djen_id='00000000-0000-0000-0000-000000000993')<>1 then raise exception 'Duplicou consulta'; end if;
 if not exists(select 1 from agente_execucoes where consulta_djen_id='00000000-0000-0000-0000-000000000993' and status='concluida' and saida->>'novas'='2') then raise exception 'Resultado não refletiu consulta real'; end if;
end;$$;
insert into vault.decrypted_secrets values ('djen_cron_secret','test-only-not-a-secret');
update agentes_ia set ativo=true,proxima_execucao=now() where slug='analista-teste';
do $$begin if public.escritorio_agendar_analistas()<>1 then raise exception 'Despachante não enviou trabalho'; end if;end;$$;
rollback;
