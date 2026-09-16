create or replace function public.subtrair_dias_uteis(_data_fim date, _dias integer)
returns date
language plpgsql
stable
security invoker
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
revoke all on function public.subtrair_dias_uteis(date, integer) from anon;
grant execute on function public.subtrair_dias_uteis(date, integer) to authenticated, service_role;

create index if not exists idx_controladoria_itens_prazo_conferido_por
  on public.controladoria_itens (prazo_conferido_por)
  where prazo_conferido_por is not null;