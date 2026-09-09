-- Base técnica segura para webhooks do WhatsApp Business.
-- Armazena apenas metadados mínimos para idempotência e auditoria.
-- O payload bruto, tokens e assinaturas nunca devem ser persistidos.

create table if not exists public.whatsapp_webhook_eventos (
  id uuid primary key default gen_random_uuid(),
  provedor text not null default 'meta',
  provedor_evento_id text not null,
  tipo text not null,
  conexao_id uuid references public.whatsapp_conexoes(id) on delete set null,
  status text not null default 'recebido'
    check (status in ('recebido', 'processando', 'processado', 'ignorado', 'erro')),
  tentativas integer not null default 0 check (tentativas >= 0),
  erro text,
  recebido_em timestamptz not null default now(),
  processado_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (provedor, provedor_evento_id)
);

create index if not exists whatsapp_webhook_eventos_status_idx
  on public.whatsapp_webhook_eventos (status, recebido_em);

create index if not exists whatsapp_webhook_eventos_conexao_idx
  on public.whatsapp_webhook_eventos (conexao_id, recebido_em desc);

alter table public.whatsapp_webhook_eventos enable row level security;

comment on table public.whatsapp_webhook_eventos is
  'Registro técnico mínimo para idempotência e auditoria de webhooks. O payload bruto e credenciais não são persistidos.';
comment on column public.whatsapp_webhook_eventos.provedor_evento_id is
  'Identificador externo único usado para impedir processamento duplicado.';
comment on column public.whatsapp_webhook_eventos.erro is
  'Mensagem técnica sanitizada; nunca deve conter token, assinatura ou payload integral.';
