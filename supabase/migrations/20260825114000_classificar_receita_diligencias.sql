alter table public.diligencias
  add column if not exists natureza_receita text not null default 'escritorio',
  add column if not exists incluir_relatorio_contabil boolean
    generated always as (natureza_receita = 'escritorio') stored;

alter table public.diligencias
  drop constraint if exists diligencias_natureza_receita_check;

alter table public.diligencias
  add constraint diligencias_natureza_receita_check
  check (natureza_receita in ('escritorio', 'pessoal'));

create index if not exists idx_diligencias_relatorio_contabil
  on public.diligencias (data_recebimento, pagamento_status)
  where natureza_receita = 'escritorio';

comment on column public.diligencias.natureza_receita is
  'Define se o recebimento pertence ao escritório ou à pessoa física da titular.';
comment on column public.diligencias.incluir_relatorio_contabil is
  'Calculado automaticamente. Somente receitas do escritório entram nos relatórios contábeis.';
