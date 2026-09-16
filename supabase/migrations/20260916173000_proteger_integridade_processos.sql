-- Garante que o cadastro operacional de processos permaneça vinculado ao cliente
-- e que números CNJ sejam armazenados de forma única e normalizada.

alter table public.processos
  alter column cliente_id set not null,
  alter column tipo set not null;

alter table public.processos
  drop constraint if exists processos_tipo_check,
  add constraint processos_tipo_check
    check (tipo in ('judicial', 'administrativo')) not valid,
  validate constraint processos_tipo_check;

alter table public.processos
  drop constraint if exists processos_judicial_exige_cnj_check,
  add constraint processos_judicial_exige_cnj_check
    check (tipo <> 'judicial' or numero_cnj is not null) not valid,
  validate constraint processos_judicial_exige_cnj_check;

create or replace function public.normalizar_numero_processo()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  cnj_limpo text;
begin
  cnj_limpo := nullif(regexp_replace(coalesce(new.numero_cnj, ''), '[^0-9]', '', 'g'), '');

  if new.tipo = 'judicial' and (cnj_limpo is null or length(cnj_limpo) <> 20) then
    raise exception 'Processo judicial exige número CNJ com 20 dígitos'
      using errcode = '23514';
  end if;

  if cnj_limpo is not null and length(cnj_limpo) <> 20 then
    raise exception 'Número CNJ deve possuir 20 dígitos'
      using errcode = '23514';
  end if;

  new.numero_cnj := cnj_limpo;
  new.numero_cnj_limpo := cnj_limpo;
  return new;
end;
$$;

revoke all on function public.normalizar_numero_processo() from public, anon, authenticated;

drop trigger if exists trg_normalizar_numero_processo on public.processos;
create trigger trg_normalizar_numero_processo
before insert or update of numero_cnj, numero_cnj_limpo, tipo
on public.processos
for each row execute function public.normalizar_numero_processo();

alter table public.processos
  drop constraint if exists processos_cnj_campos_consistentes_check,
  add constraint processos_cnj_campos_consistentes_check
    check (numero_cnj is not distinct from numero_cnj_limpo) not valid,
  validate constraint processos_cnj_campos_consistentes_check;
