-- Normaliza números sem alterar os valores originais informados pelos usuários.
-- Os campos gerados permitem vincular eventos da API aos cadastros reais.

alter table public.mkt_leads
  add column if not exists whatsapp_normalizado text
  generated always as (regexp_replace(coalesce(whatsapp, ''), '[^0-9]', '', 'g')) stored;

alter table public.clientes
  add column if not exists whatsapp_normalizado text
  generated always as (regexp_replace(coalesce(whatsapp, ''), '[^0-9]', '', 'g')) stored;

create index if not exists mkt_leads_whatsapp_normalizado_idx
  on public.mkt_leads (whatsapp_normalizado)
  where whatsapp_normalizado <> '';

create index if not exists clientes_whatsapp_normalizado_idx
  on public.clientes (whatsapp_normalizado)
  where whatsapp_normalizado <> '';

comment on column public.mkt_leads.whatsapp_normalizado is
  'Somente dígitos, gerado automaticamente para vinculação segura com provedores de mensagem.';
comment on column public.clientes.whatsapp_normalizado is
  'Somente dígitos, gerado automaticamente para vinculação segura com provedores de mensagem.';
