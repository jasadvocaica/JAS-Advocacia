alter table public.agentes_ia add column sala text not null default 'operacional'
  check(sala in ('diretoria','operacional','comercial','reuniao','diligencias','marketing'));
update public.agentes_ia set sala='diretoria' where area='gestao';
update public.agentes_ia set sala=area where area in ('comercial','diligencias','marketing');

create table public.escritorio_mensagens(
 id uuid primary key default gen_random_uuid(),
 agente_id uuid references public.agentes_ia(id) on delete restrict,
 destinatario_id uuid references public.agentes_ia(id) on delete restrict,
 usuario_id uuid references auth.users(id) on delete set null,
 execucao_id uuid references public.agente_execucoes(id) on delete set null,
 origem text not null check(origem in ('usuario','agente','sistema')),
 texto text not null check(length(texto) between 1 and 10000),
 criado_em timestamptz not null default now()
);
alter table public.escritorio_mensagens enable row level security;
grant select on public.escritorio_mensagens to authenticated;
grant all on public.escritorio_mensagens to service_role;
create policy "gestor acompanha conversas" on public.escritorio_mensagens for select to authenticated
 using(public.is_interno_ativo((select auth.uid())) and public.is_gestor((select auth.uid())));
create index escritorio_mensagens_criado on public.escritorio_mensagens(criado_em desc);
create index escritorio_mensagens_execucao on public.escritorio_mensagens(execucao_id);
create index escritorio_mensagens_agente on public.escritorio_mensagens(agente_id,criado_em desc);
create index escritorio_mensagens_destinatario on public.escritorio_mensagens(destinatario_id);
create index escritorio_mensagens_usuario on public.escritorio_mensagens(usuario_id);

create function public.escritorio_publicar_entrega() returns trigger
language plpgsql security invoker set search_path='' as $$
declare v_destinatario uuid;
begin
 if new.origem='chat' or new.status not in ('concluida','erro','aguardando_aprovacao','rejeitada') then return new; end if;
 if tg_op='UPDATE' then if old.status=new.status then return new; end if; end if;
 if exists(select 1 from public.agentes_ia where id=new.agente_id and slug='monitor-djen') then
  select id into v_destinatario from public.agentes_ia where slug='monitor-prazos';
 end if;
 insert into public.escritorio_mensagens(agente_id,destinatario_id,execucao_id,origem,texto)
 values(new.agente_id,v_destinatario,new.id,'sistema',
  left(case when new.status='rejeitada' then 'Diretoria rejeitou a entrega. Confira o histórico da execução.'
    when tg_op='UPDATE' and new.status='concluida' and old.status='aguardando_aprovacao' then 'Diretoria aprovou a entrega. A aprovação não executa ações externas.'
    when new.status='erro' then 'Execução com falha: '||coalesce(new.erro,'Confira o histórico.')
    when new.status='aguardando_aprovacao' then coalesce(new.resumo,'Entrega disponível.')||' Aguarda revisão da diretoria.'
    else coalesce(new.resumo,'Execução concluída; consulte o resultado registrado.') end,10000));
 return new;
end; $$;
revoke all on function public.escritorio_publicar_entrega() from public,anon,authenticated;
create trigger escritorio_entrega_chat after insert or update on public.agente_execucoes
 for each row execute function public.escritorio_publicar_entrega();

-- Conversas são consultas sem ferramentas de escrita, com reserva por agente.
create or replace function public.escritorio_reservar_analista(_agente uuid,_origem text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare a public.agentes_ia; v_id uuid;
begin
 select * into a from public.agentes_ia where id=_agente for update;
 if not found or not a.ativo or a.executor is distinct from 'analista_operacional' then return null; end if;
 if not public.is_interno_ativo(a.supervisor_id) or not public.is_gestor(a.supervisor_id) then return null; end if;
 if _origem not in ('manual','rotina','chat') then raise exception 'Origem inválida'; end if;
 if exists(select 1 from public.agente_execucoes where agente_id=a.id and
   (status='executando' or (_origem<>'chat' and status='aguardando_aprovacao'))) then return null; end if;
 insert into public.agente_execucoes(agente_id,disparado_por,origem,status,entrada)
  values(a.id,a.supervisor_id,_origem,'executando',jsonb_build_object('funcao','analista_operacional')) returning id into v_id;
 if _origem<>'chat' then
  update public.agentes_ia set proxima_execucao=case when intervalo_minutos is not null
   then now()+make_interval(mins=>intervalo_minutos) end where id=a.id;
 end if;
 return v_id;
end; $$;

create function public.escritorio_finalizar_chat(_execucao uuid,_texto text,_tokens integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare e public.agente_execucoes;
begin
 select * into e from public.agente_execucoes where id=_execucao for update;
 if not found or e.origem<>'chat' or e.status<>'executando' then return false; end if;
 insert into public.escritorio_mensagens(agente_id,execucao_id,origem,texto)
  values(e.agente_id,e.id,'agente',_texto);
 update public.agente_execucoes set status='concluida',saida=jsonb_build_object('resposta',_texto,'tokens',_tokens),
  resumo='Resposta à diretoria entregue no chat.',finalizado_em=now(),
  duracao_ms=(extract(epoch from now()-iniciado_em)*1000)::integer where id=e.id;
 return true;
end; $$;
revoke all on function public.escritorio_finalizar_chat(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.escritorio_finalizar_chat(uuid,text,integer) to service_role;

-- Publica apenas evidências já registradas, preservando a data original.
insert into public.escritorio_mensagens(agente_id,execucao_id,origem,texto,criado_em)
 select e.agente_id,e.id,'sistema',left('Histórico de execução · '||coalesce(e.erro,e.resumo,'Resultado disponível no histórico.'),10000),coalesce(e.finalizado_em,e.iniciado_em)
 from public.agente_execucoes e where e.status in ('concluida','erro','aguardando_aprovacao')
 and not exists(select 1 from public.escritorio_mensagens m where m.execucao_id=e.id)
 order by e.iniciado_em desc limit 12;
