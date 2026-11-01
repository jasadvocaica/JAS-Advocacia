-- Executado em banco descartável após os bootstraps DJEN e Clara.
\i supabase/migrations/20261101192720_clara_acompanhamento_3d.sql
begin;
insert into auth.users(id) values('00000000-0000-4000-8000-000000000991'),('00000000-0000-4000-8000-000000000992');
insert into public.profiles(id,nome) values('00000000-0000-4000-8000-000000000991','Gestora A'),('00000000-0000-4000-8000-000000000992','Gestora B');
insert into homologacao.clara_tarefas(usuario_id,hash,comando,arquivo,texto,candidato,evidencias) values
('00000000-0000-4000-8000-000000000991',repeat('a',64),'PRIVADO','SEGREDO.txt','NÃO EXIBIR','{"nome":"PII"}','{"cpf":"PRIVADO"}'),
('00000000-0000-4000-8000-000000000992',repeat('b',64),'OUTRA USUÁRIA','OUTRA.txt','NÃO EXIBIR','{"nome":"OUTRA"}','{}');
do $$declare v jsonb;begin
 if has_function_privilege('anon','public.clara_m1_acompanhar(uuid)','execute') or has_function_privilege('authenticated','public.clara_m1_acompanhar(uuid)','execute') then raise exception 'Consulta privada exposta';end if;
 if not has_function_privilege('service_role','public.clara_m1_acompanhar(uuid)','execute') then raise exception 'Executor sem acesso';end if;
 v:=public.clara_m1_acompanhar('00000000-0000-4000-8000-000000000991');
 if jsonb_array_length(v->'tarefas')<>1 then raise exception 'Vazou tarefa de outra usuária';end if;
 if v::text like '%PRIVADO%' or v::text like '%PII%' or v::text like '%OUTRA%' or (v->'tarefas'->0) ? 'usuario_id' or (v->'tarefas'->0) ? 'arquivo' then raise exception 'Payload expõe dados além de operação';end if;
 if jsonb_array_length(public.clara_m1_acompanhar('00000000-0000-4000-8000-000000000993')->'tarefas')<>0 then raise exception 'Usuária sem tarefas recebeu dados';end if;
end;$$;
rollback;
