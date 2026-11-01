\set ON_ERROR_STOP on
begin;
do $$ declare item uuid; begin
  insert into public.controladoria_itens(origem) values (null) returning id into item;
  if exists(select 1 from djen_agenda_fila where item_id=item) then raise exception 'Enfileirou origem fora do DJEN'; end if;
  delete from public.controladoria_itens where id=item;
  if exists(select 1 from djen_agenda_fila where item_id=item) then raise exception 'Enfileirou exclusão fora do DJEN'; end if;
end; $$;
insert into public.profiles(id) values ('00000000-0000-0000-0000-000000000001');
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000001');
insert into public.processos(id, numero_cnj_limpo, responsavel_id)
values ('00000000-0000-0000-0000-000000000010','12345678901234567890','00000000-0000-0000-0000-000000000001');
insert into public.pje_publicacoes(id,pje_id,numero_processo_limpo,texto_publicacao)
values ('00000000-0000-0000-0000-000000000100','oficial-1','12345678901234567890','Intime-se para manifestação.');

do $$ declare primeiro uuid; segundo uuid; begin
  primeiro := public.djen_preparar_triagem('00000000-0000-0000-0000-000000000100');
  segundo := public.djen_preparar_triagem('00000000-0000-0000-0000-000000000100');
  if primeiro <> segundo or (select count(*) from controladoria_itens) <> 1 then raise exception 'Duplicou na repetição'; end if;
  if (select count(*) from controladoria_responsaveis where item_id=primeiro) <> 1 then raise exception 'Responsável não foi salvo'; end if;
  if exists(select 1 from controladoria_itens where data_prazo_judicial is not null or prazo_conferido) then raise exception 'Inventou prazo judicial'; end if;
  if not exists(select 1 from djen_agenda_fila where item_id=primeiro and acao='upsert') then raise exception 'Não enfileirou agenda'; end if;
end; $$;

-- Uma publicação recebida por outro monitoramento reaproveita o mesmo item.
insert into public.pje_publicacoes(pje_id,numero_processo_limpo,texto_publicacao)
values ('oficial-1','12345678901234567890','Mesmo fato, outro monitoramento');
select public.djen_processar_pendencias(25);
do $$ begin
  if (select count(*) from controladoria_itens) <> 1 then raise exception 'Duplicou entre monitoramentos'; end if;
end; $$;

-- Falha na segunda gravação reverte também andamento e tarefa.
create function public.teste_falhar_responsavel() returns trigger language plpgsql as $$
begin raise exception 'Falha simulada de persistência'; end; $$;
create trigger teste_falha before insert on public.controladoria_responsaveis
for each row execute function public.teste_falhar_responsavel();
insert into public.pje_publicacoes(id,pje_id,numero_processo_limpo)
values ('00000000-0000-0000-0000-000000000101','oficial-2','12345678901234567890');
select public.djen_processar_pendencias(25);
do $$ begin
  if (select count(*) from controladoria_itens) <> 1 or (select count(*) from andamentos) <> 1 then raise exception 'Falha parcial não foi revertida'; end if;
  if not exists(select 1 from pje_publicacoes where pje_id='oficial-2' and triagem_erro is not null and triagem_tentativas=1) then raise exception 'Falha não ficou visível'; end if;
end; $$;
drop trigger teste_falha on public.controladoria_responsaveis;
select public.djen_reprocessar_pendencias();
do $$ begin
  if (select count(*) from controladoria_itens) <> 2 then raise exception 'Não recuperou a falha'; end if;
end; $$;

-- Ausência de responsável vira pendência; não escolhe alguém por inferência.
insert into public.processos(numero_cnj_limpo) values ('99999999999999999999');
insert into public.pje_publicacoes(pje_id,numero_processo_limpo) values ('sem-responsavel','99999999999999999999');
select public.djen_processar_pendencias(25);
do $$ begin
  if not exists(select 1 from pje_publicacoes where pje_id='sem-responsavel' and triagem_erro like 'Defina%') then raise exception 'Não exigiu responsável'; end if;
end; $$;

-- Falta de segredo não conclui trabalho de agenda e permite nova tentativa.
select public.djen_despachar_agenda(25);
do $$ begin
  if not exists(select 1 from djen_agenda_fila where erro='Segredo da agenda não configurado') then raise exception 'Falha de agenda sumiu'; end if;
end; $$;
insert into vault.decrypted_secrets values ('calendar_sync_secret','segredo-sintetico-exclusivo-do-teste');
update public.djen_agenda_fila set proxima_tentativa=now();
select public.djen_despachar_agenda(25);
insert into net._http_response select request_id, 200, null from public.djen_agenda_fila;
update public.djen_agenda_fila set proxima_tentativa=now();
select public.djen_despachar_agenda(25);
do $$ begin
  if exists(select 1 from djen_agenda_fila) then raise exception 'Não confirmou resposta da agenda'; end if;
end; $$;

-- Nova versão do prazo não é confirmada pela resposta de uma versão antiga.
update public.controladoria_itens set data_prazo_judicial='2026-12-31', prazo_conferido=true;
select public.djen_despachar_agenda(25);
update public.controladoria_itens set data_prazo_judicial='2027-01-05';
insert into net._http_response select request_id,200,null from public.djen_agenda_fila where request_id is not null;
do $$ begin
  if exists(select 1 from djen_agenda_fila where request_id is not null) then raise exception 'Reaproveitou confirmação antiga'; end if;
end; $$;

-- RPCs administrativas não são executáveis por usuários nem anonimamente.
insert into public.agente_execucoes(id, agente_id, status)
select '00000000-0000-0000-0000-000000000200', id, 'executando'
from public.agentes_ia where slug='minuta-pecas';
do $$ declare falhou boolean := false; begin
  begin
    perform public.agentes_finalizar_execucao('00000000-0000-0000-0000-000000000200','{}',null);
  exception when raise_exception then falhou := true;
  end;
  if not falhou then raise exception 'Concluiu sem resultado de revisão'; end if;
  perform public.agentes_finalizar_execucao('00000000-0000-0000-0000-000000000200','{"resultado":{"minuta":"revisar"}}', 'Pronto para revisão');
  perform public.agentes_finalizar_execucao('00000000-0000-0000-0000-000000000200','{"resultado":{}}', null);
  if (select count(*) from agente_aprovacoes) <> 1 then raise exception 'Duplicou a aprovação'; end if;
  perform public.agentes_registrar_decisao('00000000-0000-0000-0000-000000000200','aprovado','00000000-0000-0000-0000-000000000001',null);
  falhou := false;
  begin
    perform public.agentes_registrar_decisao('00000000-0000-0000-0000-000000000200','rejeitado','00000000-0000-0000-0000-000000000001',null);
  exception when raise_exception then falhou := true;
  end;
  if not falhou then raise exception 'Aceitou segunda decisão'; end if;
end; $$;
do $$ begin
  if has_function_privilege('authenticated','public.djen_preparar_triagem(uuid)','EXECUTE')
    or has_function_privilege('anon','public.djen_processar_pendencias(integer)','EXECUTE')
    or has_function_privilege('authenticated','public.djen_despachar_agenda(integer)','EXECUTE')
    or has_function_privilege('authenticated','public.agentes_finalizar_execucao(uuid,jsonb,text)','EXECUTE') then
    raise exception 'RPC administrativa exposta';
  end if;
end; $$;
rollback;
select 'Fluxo DJEN: repetição, deduplicação, rollback, recuperação, responsáveis, agenda e privilégios OK' as resultado;
