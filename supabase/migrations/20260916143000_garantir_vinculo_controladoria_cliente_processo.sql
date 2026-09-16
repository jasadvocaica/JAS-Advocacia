create or replace function public.controladoria_validar_vinculo_cliente_processo()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cliente_processo uuid;
begin
  if new.processo_id is null then
    return new;
  end if;

  select p.cliente_id
    into v_cliente_processo
    from public.processos p
   where p.id = new.processo_id;

  if not found then
    raise exception 'Processo vinculado nao encontrado';
  end if;

  if new.cliente_id is null then
    new.cliente_id := v_cliente_processo;
  elsif v_cliente_processo is not null and new.cliente_id <> v_cliente_processo then
    raise exception 'O cliente da tarefa deve ser o mesmo cliente do processo';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_controladoria_validar_vinculo on public.controladoria_itens;
create trigger trg_controladoria_validar_vinculo
before insert or update of processo_id, cliente_id on public.controladoria_itens
for each row execute function public.controladoria_validar_vinculo_cliente_processo();

alter table public.controladoria_itens
  drop constraint if exists controladoria_itens_exige_vinculo_check,
  add constraint controladoria_itens_exige_vinculo_check
    check (cliente_id is not null or processo_id is not null)
    not valid;

alter table public.controladoria_itens
  validate constraint controladoria_itens_exige_vinculo_check;

comment on constraint controladoria_itens_exige_vinculo_check on public.controladoria_itens is
  'Toda providencia deve pertencer a um cliente ou processo.';