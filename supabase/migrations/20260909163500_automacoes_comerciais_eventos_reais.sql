alter table public.mkt_automacao_execucoes add column if not exists chave_idempotencia text;
create unique index if not exists idx_mkt_automacao_execucoes_chave on public.mkt_automacao_execucoes(chave_idempotencia) where chave_idempotencia is not null;
create or replace function public.mkt_automacoes_enfileirar(_gatilho text,_lead_id uuid default null,_conversa_id uuid default null,_chave_evento text default null)
returns integer language plpgsql security definer set search_path=public as $$
declare _quantidade integer := 0;
begin
  if _lead_id is null and _conversa_id is null then return 0; end if;
  insert into public.mkt_automacao_execucoes(automacao_id,lead_id,conversa_id,status,agendada_para,chave_idempotencia)
  select a.id,_lead_id,_conversa_id,'pendente',now()+make_interval(mins=>a.atraso_minutos),
    a.id::text||':'||coalesce(_chave_evento,_gatilho||':'||coalesce(_lead_id::text,_conversa_id::text))
  from public.mkt_automacoes a where a.status='ativa' and a.gatilho=_gatilho
  on conflict (chave_idempotencia) where chave_idempotencia is not null do nothing;
  get diagnostics _quantidade=row_count; return _quantidade;
end; $$;
revoke all on function public.mkt_automacoes_enfileirar(text,uuid,uuid,text) from public;
create or replace function public.mkt_automacoes_evento_lead() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then
    perform public.mkt_automacoes_enfileirar('lead_criado',new.id,null,'lead_criado:'||new.id::text);
  elsif new.status is distinct from old.status then
    perform public.mkt_automacoes_enfileirar('etapa_alterada',new.id,null,'etapa_alterada:'||new.id::text||':'||coalesce(new.status,''));
  end if; return new;
end; $$;
drop trigger if exists trg_mkt_automacoes_evento_lead on public.mkt_leads;
create trigger trg_mkt_automacoes_evento_lead after insert or update of status on public.mkt_leads for each row execute function public.mkt_automacoes_evento_lead();
create or replace function public.mkt_automacoes_evento_contrato() returns trigger language plpgsql security definer set search_path=public as $$
declare _conversa uuid; _lead uuid;
begin
  if new.data_assinatura is not null and (tg_op='INSERT' or old.data_assinatura is null) then
    select c.id into _conversa from public.whatsapp_conversas c where c.cliente_id=new.cliente_id and c.status<>'encerrada' order by c.atualizado_em desc limit 1;
    if _conversa is null then select l.id into _lead from public.mkt_leads l where l.cliente_id=new.cliente_id order by l.atualizado_em desc limit 1; end if;
    if _conversa is not null or _lead is not null then
      perform public.mkt_automacoes_enfileirar('contrato_assinado',_lead,_conversa,'contrato_assinado:'||new.id::text);
    end if;
  end if; return new;
end; $$;
drop trigger if exists trg_mkt_automacoes_evento_contrato on public.honorarios_contratos;
create trigger trg_mkt_automacoes_evento_contrato after insert or update of data_assinatura on public.honorarios_contratos for each row execute function public.mkt_automacoes_evento_contrato();
comment on function public.mkt_automacoes_enfileirar(text,uuid,uuid,text) is 'Cria execuções idempotentes somente para automações ativas e eventos com alvo real.';