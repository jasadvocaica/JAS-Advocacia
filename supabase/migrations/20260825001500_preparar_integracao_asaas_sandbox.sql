-- Integração Asaas inicialmente restrita ao ambiente Sandbox.
alter table public.clientes
  add column if not exists asaas_customer_id text;

create unique index if not exists clientes_asaas_customer_id_uidx
  on public.clientes (asaas_customer_id)
  where asaas_customer_id is not null;

alter table public.diligencias
  add column if not exists data_vencimento_cobranca date,
  add column if not exists asaas_payment_id text,
  add column if not exists asaas_status text,
  add column if not exists asaas_billing_type text,
  add column if not exists asaas_invoice_url text,
  add column if not exists asaas_bank_slip_url text,
  add column if not exists asaas_ultimo_sync timestamptz,
  add column if not exists asaas_ultimo_erro text;

create unique index if not exists diligencias_asaas_payment_id_uidx
  on public.diligencias (asaas_payment_id)
  where asaas_payment_id is not null;

alter table public.honorarios_parcelas
  add column if not exists asaas_payment_id text,
  add column if not exists asaas_status text,
  add column if not exists asaas_billing_type text,
  add column if not exists asaas_invoice_url text,
  add column if not exists asaas_bank_slip_url text,
  add column if not exists asaas_ultimo_sync timestamptz,
  add column if not exists asaas_ultimo_erro text;

create unique index if not exists honorarios_parcelas_asaas_payment_id_uidx
  on public.honorarios_parcelas (asaas_payment_id)
  where asaas_payment_id is not null;

create table if not exists public.asaas_webhook_eventos (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null,
  payment_id text,
  payload jsonb not null default '{}'::jsonb,
  processado boolean not null default false,
  erro text,
  recebido_em timestamptz not null default now(),
  processado_em timestamptz
);

create index if not exists asaas_webhook_eventos_payment_id_idx
  on public.asaas_webhook_eventos (payment_id);

alter table public.asaas_webhook_eventos enable row level security;

drop policy if exists "Gestores visualizam eventos Asaas" on public.asaas_webhook_eventos;
create policy "Gestores visualizam eventos Asaas"
  on public.asaas_webhook_eventos for select
  to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'gestor'
    )
  );

create table if not exists public.asaas_integracao_log (
  id uuid primary key default gen_random_uuid(),
  acao text not null,
  entidade_tipo text,
  entidade_id uuid,
  asaas_id text,
  sucesso boolean not null default false,
  erro text,
  detalhes jsonb not null default '{}'::jsonb,
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now()
);

alter table public.asaas_integracao_log enable row level security;

drop policy if exists "Gestores visualizam logs Asaas" on public.asaas_integracao_log;
create policy "Gestores visualizam logs Asaas"
  on public.asaas_integracao_log for select
  to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'gestor'
    )
  );