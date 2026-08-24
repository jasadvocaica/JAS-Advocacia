-- Impede duplicidade de movimentos dentro do mesmo processo sem
-- bloquear movimentos coincidentes de processos diferentes.
alter table public.andamentos
  drop constraint if exists andamentos_datajud_id_key;

drop index if exists public.andamentos_datajud_id_key;
drop index if exists public.idx_andamentos_processo_data;

create unique index if not exists andamentos_processo_datajud_uidx
  on public.andamentos (processo_id, datajud_id)
  where datajud_id is not null;
