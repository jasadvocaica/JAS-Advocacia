create table if not exists public.mkt_lead_historico (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.mkt_leads(id) on delete restrict,
  evento text not null check (evento in ('criado','atualizado')),
  estado_anterior jsonb,
  estado_novo jsonb not null,
  alterado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists idx_mkt_lead_historico_lead on public.mkt_lead_historico(lead_id,criado_em desc);
alter table public.mkt_lead_historico enable row level security;
create policy mkt_lead_historico_select on public.mkt_lead_historico for select using (public.has_permission((select auth.uid()),'marketing'::modulo,'visualizar'::acao_permissao));
create or replace function public.mkt_lead_registrar_historico() returns trigger language plpgsql security definer set search_path=public as $$
declare _novo jsonb; _anterior jsonb;
begin
  _novo:=jsonb_build_object('status',new.status,'responsavel_id',new.responsavel_id,'campanha_id',new.campanha_id,'area_direito',new.area_direito,'canal',new.canal,'valor_contrato',new.valor_contrato,'motivo_perda',new.motivo_perda);
  if tg_op='INSERT' then
    insert into public.mkt_lead_historico(lead_id,evento,estado_novo,alterado_por) values(new.id,'criado',_novo,coalesce(auth.uid(),new.registrado_por));
  else
    _anterior:=jsonb_build_object('status',old.status,'responsavel_id',old.responsavel_id,'campanha_id',old.campanha_id,'area_direito',old.area_direito,'canal',old.canal,'valor_contrato',old.valor_contrato,'motivo_perda',old.motivo_perda);
    if _novo is distinct from _anterior then
      insert into public.mkt_lead_historico(lead_id,evento,estado_anterior,estado_novo,alterado_por) values(new.id,'atualizado',_anterior,_novo,auth.uid());
    end if;
  end if; return new;
end; $$;
drop trigger if exists trg_mkt_lead_historico on public.mkt_leads;
create trigger trg_mkt_lead_historico after insert or update on public.mkt_leads for each row execute function public.mkt_lead_registrar_historico();
comment on table public.mkt_lead_historico is 'Trilha imutável das decisões comerciais sem copiar dados de contato.';