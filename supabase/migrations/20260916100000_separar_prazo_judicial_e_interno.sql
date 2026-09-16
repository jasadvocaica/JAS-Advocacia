-- Separa o prazo processual oficial da meta operacional interna.
-- Migration aditiva: nenhum prazo existente e recalculado ou sobrescrito.

alter table public.controladoria_itens
  add column if not exists data_prazo_judicial date,
  add column if not exists data_prazo_interno date,
  add column if not exists antecedencia_interna_dias smallint not null default 2,
  add column if not exists prazo_conferido boolean not null default false,
  add column if not exists prazo_conferido_por uuid references public.profiles(id) on delete set null,
  add column if not exists prazo_conferido_em timestamptz;

alter table public.controladoria_itens
  drop constraint if exists controladoria_itens_antecedencia_interna_check,
  add constraint controladoria_itens_antecedencia_interna_check
    check (antecedencia_interna_dias between 0 and 30),
  drop constraint if exists controladoria_itens_ordem_prazos_check,
  add constraint controladoria_itens_ordem_prazos_check
    check (
      data_prazo_judicial is null
      or data_prazo_interno is null
      or data_prazo_interno <= data_prazo_judicial
    );

create index if not exists idx_controladoria_itens_prazo_judicial
  on public.controladoria_itens (data_prazo_judicial)
  where status not in ('concluido', 'cancelado');

create index if not exists idx_controladoria_itens_prazo_interno
  on public.controladoria_itens (data_prazo_interno)
  where status not in ('concluido', 'cancelado');

create or replace function public.subtrair_dias_uteis(_data_fim date, _dias integer)
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_data date := _data_fim;
  v_count integer := 0;
begin
  if _data_fim is null or _dias is null or _dias < 0 then
    raise exception 'Data final e quantidade nao negativa sao obrigatorias';
  end if;

  while v_count < _dias loop
    v_data := v_data - 1;
    if extract(dow from v_data) not in (0, 6)
       and not exists (select 1 from public.feriados where data = v_data) then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_data;
end;
$$;

revoke all on function public.subtrair_dias_uteis(date, integer) from public;
grant execute on function public.subtrair_dias_uteis(date, integer) to authenticated, service_role;

create or replace function public.controladoria_registrar_conferencia_prazo()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.prazo_conferido
     and (tg_op = 'INSERT' or not coalesce(old.prazo_conferido, false)) then
    new.prazo_conferido_por := auth.uid();
    new.prazo_conferido_em := now();
  elsif not new.prazo_conferido then
    new.prazo_conferido_por := null;
    new.prazo_conferido_em := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_controladoria_conferencia_prazo on public.controladoria_itens;
create trigger trg_controladoria_conferencia_prazo
before insert or update of prazo_conferido on public.controladoria_itens
for each row execute function public.controladoria_registrar_conferencia_prazo();

comment on column public.controladoria_itens.data_prazo_judicial is
  'Data-limite processual oficial, sujeita a conferencia humana.';
comment on column public.controladoria_itens.data_prazo_interno is
  'Meta operacional interna; data_vencimento espelha esta data para compatibilidade.';
comment on column public.controladoria_itens.prazo_conferido is
  'Confirma que uma pessoa revisou manualmente a contagem do prazo judicial.';