begin;
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000981');
insert into profiles(id) values ('00000000-0000-0000-0000-000000000981');
insert into agentes_ia(id,slug,nome,executor,supervisor_id,sala,exige_aprovacao)
values ('00000000-0000-0000-0000-000000000982','chat-teste','Analista','analista_operacional','00000000-0000-0000-0000-000000000981','marketing',true);
do $$declare v_exec uuid; v_chat uuid; begin
 if has_table_privilege('anon','public.escritorio_mensagens','select') then raise exception 'Canal anônimo'; end if;
 if has_table_privilege('authenticated','public.escritorio_mensagens','insert') then raise exception 'Cliente pode falsificar mensagens'; end if;
 if has_function_privilege('authenticated','public.escritorio_finalizar_chat(uuid,text,integer)','execute') then raise exception 'Finalização pública'; end if;
 begin update agentes_ia set sala='invalida' where slug='chat-teste';raise exception 'Sala inválida aceita';exception when check_violation then null;end;
 v_exec:=public.escritorio_reservar_analista('00000000-0000-0000-0000-000000000982','manual');
 perform public.agentes_finalizar_execucao(v_exec,'{"resultado":{"relatorio":"Teste"}}','Relatório de teste');
 if not exists(select 1 from escritorio_mensagens where execucao_id=v_exec and origem='sistema') then raise exception 'Entrega não publicada';end if;
 update agente_execucoes set resumo=resumo where id=v_exec;
 if (select count(*) from escritorio_mensagens where execucao_id=v_exec)<>1 then raise exception 'Aviso duplicado';end if;
 v_chat:=public.escritorio_reservar_analista('00000000-0000-0000-0000-000000000982','chat');
 if v_chat is null then raise exception 'Chat bloqueado por revisão de relatório';end if;
 if public.escritorio_reservar_analista('00000000-0000-0000-0000-000000000982','chat') is not null then raise exception 'Chat concorrente aceito';end if;
 if not public.escritorio_finalizar_chat(v_chat,'Resposta de teste com indicadores reais',20) then raise exception 'Chat não finalizado';end if;
 if public.escritorio_finalizar_chat(v_chat,'Duplicado',20) then raise exception 'Resposta repetida';end if;
 if (select count(*) from escritorio_mensagens where execucao_id=v_chat)<>1 then raise exception 'Resposta duplicada';end if;
 if not exists(select 1 from agente_execucoes where id=v_chat and status='concluida') then raise exception 'Resposta e estado inconsistentes';end if;
end;$$;
-- A passagem Monitor -> Controladoria é um registro real, não fala simulada.
insert into agente_execucoes(agente_id,origem,status,resumo)
select id,'agendado','concluida','Consulta real de teste' from agentes_ia where slug='monitor-djen';
do $$begin if not exists(select 1 from escritorio_mensagens m join agentes_ia a on a.id=m.agente_id join agentes_ia d on d.id=m.destinatario_id where a.slug='monitor-djen' and d.slug='monitor-prazos' and m.texto='Consulta real de teste') then raise exception 'Encaminhamento ausente';end if;end;$$;
rollback;
