-- Base segura para futura integração oficial do WhatsApp.
-- Não ativa webhooks, não envia mensagens e não cria leads automaticamente.

create table if not exists public.whatsapp_conexoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  provedor text not null default 'meta_cloud',
  numero_exibicao text,
  phone_number_id text,
  business_account_id text,
  status text not null default 'desconectado' check (status in ('desconectado','configurando','conectado','erro')),
  ativo boolean not null default true,
  ultima_sincronizacao_em timestamptz,
  erro_ultima_sincronizacao text,
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.whatsapp_conversas (
  id uuid primary key default gen_random_uuid(),
  conexao_id uuid references public.whatsapp_conexoes(id) on delete restrict,
  lead_id uuid references public.mkt_leads(id) on delete set null,
  cliente_id uuid references public.clientes(id) on delete set null,
  telefone text not null,
  nome_contato text,
  status text not null default 'aberta' check (status in ('aberta','aguardando_cliente','aguardando_escritorio','encerrada')),
  responsavel_id uuid references auth.users(id) on delete set null,
  ultima_mensagem_em timestamptz,
  ultima_mensagem_resumo text,
  nao_lidas integer not null default 0 check (nao_lidas >= 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint whatsapp_conversa_vinculo_real check (lead_id is not null or cliente_id is not null)
);

create table if not exists public.whatsapp_mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.whatsapp_conversas(id) on delete cascade,
  provider_message_id text,
  direcao text not null check (direcao in ('entrada','saida')),
  tipo text not null default 'texto' check (tipo in ('texto','audio','imagem','documento','video','localizacao','contato','sistema')),
  conteudo text,
  midia_url text,
  status text not null default 'recebida' check (status in ('pendente','enviada','entregue','lida','recebida','falha')),
  enviada_por uuid references auth.users(id) on delete set null,
  ocorrida_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
);

create unique index if not exists whatsapp_mensagens_provider_uidx on public.whatsapp_mensagens(provider_message_id) where provider_message_id is not null;
create index if not exists whatsapp_conversas_ultima_idx on public.whatsapp_conversas(ultima_mensagem_em desc);
create index if not exists whatsapp_conversas_responsavel_idx on public.whatsapp_conversas(responsavel_id,status);
create index if not exists whatsapp_conversas_lead_idx on public.whatsapp_conversas(lead_id) where lead_id is not null;
create index if not exists whatsapp_conversas_cliente_idx on public.whatsapp_conversas(cliente_id) where cliente_id is not null;
create index if not exists whatsapp_mensagens_conversa_idx on public.whatsapp_mensagens(conversa_id,ocorrida_em);

alter table public.whatsapp_conexoes enable row level security;
alter table public.whatsapp_conversas enable row level security;
alter table public.whatsapp_mensagens enable row level security;

create policy whatsapp_conexoes_select on public.whatsapp_conexoes for select to authenticated using (has_permission((select auth.uid()), 'marketing'::modulo, 'visualizar'::acao_permissao));
create policy whatsapp_conexoes_manage on public.whatsapp_conexoes for all to authenticated using (has_role((select auth.uid()), 'gestor'::app_role)) with check (has_role((select auth.uid()), 'gestor'::app_role));
create policy whatsapp_conversas_select on public.whatsapp_conversas for select to authenticated using (has_permission((select auth.uid()), 'marketing'::modulo, 'visualizar'::acao_permissao));
create policy whatsapp_conversas_insert on public.whatsapp_conversas for insert to authenticated with check (has_permission((select auth.uid()), 'marketing'::modulo, 'criar'::acao_permissao));
create policy whatsapp_conversas_update on public.whatsapp_conversas for update to authenticated using (has_permission((select auth.uid()), 'marketing'::modulo, 'editar'::acao_permissao)) with check (has_permission((select auth.uid()), 'marketing'::modulo, 'editar'::acao_permissao));
create policy whatsapp_mensagens_select on public.whatsapp_mensagens for select to authenticated using (has_permission((select auth.uid()), 'marketing'::modulo, 'visualizar'::acao_permissao));
create policy whatsapp_mensagens_insert on public.whatsapp_mensagens for insert to authenticated with check (has_permission((select auth.uid()), 'marketing'::modulo, 'criar'::acao_permissao));
create policy whatsapp_mensagens_update on public.whatsapp_mensagens for update to authenticated using (has_permission((select auth.uid()), 'marketing'::modulo, 'editar'::acao_permissao)) with check (has_permission((select auth.uid()), 'marketing'::modulo, 'editar'::acao_permissao));

grant select, insert, update on public.whatsapp_conversas to authenticated;
grant select, insert, update on public.whatsapp_mensagens to authenticated;
grant select, insert, update, delete on public.whatsapp_conexoes to authenticated;

comment on table public.whatsapp_conexoes is 'Metadados operacionais da conexão; tokens e segredos permanecem em Supabase Secrets.';
comment on table public.whatsapp_conversas is 'Conversas reais vinculadas a lead ou cliente; não cria leads por inferência.';
comment on table public.whatsapp_mensagens is 'Mensagens recebidas/enviadas por provedor oficial, com idempotência por provider_message_id.';