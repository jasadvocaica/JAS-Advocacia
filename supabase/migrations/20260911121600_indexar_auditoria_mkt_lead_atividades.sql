create index if not exists mkt_lead_atividades_criado_por_idx
  on public.mkt_lead_atividades (criado_por)
  where criado_por is not null;

create index if not exists mkt_lead_atividades_concluido_por_idx
  on public.mkt_lead_atividades (concluido_por)
  where concluido_por is not null;

create index if not exists mkt_lead_atividades_cancelado_por_idx
  on public.mkt_lead_atividades (cancelado_por)
  where cancelado_por is not null;
