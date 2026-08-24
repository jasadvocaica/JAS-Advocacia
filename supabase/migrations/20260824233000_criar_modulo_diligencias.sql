-- Módulo de diligências: agenda, execução, custos e recebimentos
create table if not exists public.diligencias (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes(id) on delete set null,
  processo_id uuid references public.processos(id) on delete set null,
  contratante_nome text not null,
  contratante_telefone text,
  descricao text not null,
  tipo text not null default 'outra',
  data_hora timestamptz not null,
  local text,
  status text not null default 'solicitada'
    check (status in ('solicitada','agendada','em_execucao','concluida','cancelada')),
  pagamento_status text not null default 'a_receber'
    check (pagamento_status in ('nao_informado','a_receber','parcial','recebido','cancelado')),
  valor_contratado numeric(12,2) check (valor_contratado is null or valor_contratado >= 0),
  valor_recebido numeric(12,2) not null default 0 check (valor_recebido >= 0),
  data_recebimento date,
  forma_pagamento text,
  paginas_impressas integer not null default 0 check (paginas_impressas >= 0),
  custo_papel numeric(12,2) not null default 0 check (custo_papel >= 0),
  custo_tinta numeric(12,2) not null default 0 check (custo_tinta >= 0),
  km_rodado numeric(10,2) not null default 0 check (km_rodado >= 0),
  custo_combustivel numeric(12,2) not null default 0 check (custo_combustivel >= 0),
  outras_despesas numeric(12,2) not null default 0 check (outras_despesas >= 0),
  custo_total numeric(12,2) generated always as
    (custo_papel + custo_tinta + custo_combustivel + outras_despesas) stored,
  lucro_previsto numeric(12,2) generated always as
    (coalesce(valor_contratado,0) - custo_papel - custo_tinta - custo_combustivel - outras_despesas) stored,
  lucro_realizado numeric(12,2) generated always as
    (valor_recebido - custo_papel - custo_tinta - custo_combustivel - outras_despesas) stored,
  sincronizar_google boolean not null default true,
  google_event_id text,
  google_calendar_id text default 'primary',
  google_ultimo_sync timestamptz,
  google_ultimo_erro text,
  observacoes text,
  origem text not null default 'sistema',
  referencia_externa text unique,
  criado_por uuid references auth.users(id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists diligencias_data_hora_idx on public.diligencias(data_hora);
create index if not exists diligencias_status_idx on public.diligencias(status);
create index if not exists diligencias_pagamento_status_idx on public.diligencias(pagamento_status);
create index if not exists diligencias_cliente_id_idx on public.diligencias(cliente_id);
create index if not exists diligencias_processo_id_idx on public.diligencias(processo_id);

create or replace function public.atualizar_diligencia_timestamp()
returns trigger language plpgsql set search_path=public as $$
begin new.atualizado_em=now(); return new; end;
$$;
drop trigger if exists diligencias_atualizar_timestamp on public.diligencias;
create trigger diligencias_atualizar_timestamp before update on public.diligencias
for each row execute function public.atualizar_diligencia_timestamp();

alter table public.diligencias enable row level security;
drop policy if exists "equipe autorizada visualiza diligencias" on public.diligencias;
create policy "equipe autorizada visualiza diligencias" on public.diligencias
for select to authenticated using (
  has_role(auth.uid(),'gestor'::app_role) or has_role(auth.uid(),'advogado'::app_role)
  or has_role(auth.uid(),'controladoria'::app_role)
);
drop policy if exists "equipe autorizada cria diligencias" on public.diligencias;
create policy "equipe autorizada cria diligencias" on public.diligencias
for insert to authenticated with check (
  has_role(auth.uid(),'gestor'::app_role) or has_role(auth.uid(),'advogado'::app_role)
  or has_role(auth.uid(),'controladoria'::app_role)
);
drop policy if exists "equipe autorizada edita diligencias" on public.diligencias;
create policy "equipe autorizada edita diligencias" on public.diligencias
for update to authenticated using (
  has_role(auth.uid(),'gestor'::app_role) or has_role(auth.uid(),'advogado'::app_role)
  or has_role(auth.uid(),'controladoria'::app_role)
) with check (
  has_role(auth.uid(),'gestor'::app_role) or has_role(auth.uid(),'advogado'::app_role)
  or has_role(auth.uid(),'controladoria'::app_role)
);
drop policy if exists "gestor exclui diligencias" on public.diligencias;
create policy "gestor exclui diligencias" on public.diligencias
for delete to authenticated using (has_role(auth.uid(),'gestor'::app_role));
