create table if not exists public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  conexao_id uuid not null references public.whatsapp_conexoes(id) on delete cascade,
  provider_template_id text,
  nome text not null,
  idioma text not null,
  categoria text,
  status text not null,
  componentes jsonb not null default '[]'::jsonb,
  sincronizado_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique(conexao_id,nome,idioma)
);
create index if not exists idx_whatsapp_templates_status on public.whatsapp_templates(conexao_id,status);
alter table public.whatsapp_templates enable row level security;
create policy whatsapp_templates_select on public.whatsapp_templates for select using (public.has_permission((select auth.uid()),'marketing'::modulo,'visualizar'::acao_permissao));
create policy whatsapp_templates_manage on public.whatsapp_templates for all using (public.has_role((select auth.uid()),'gestor'::app_role)) with check (public.has_role((select auth.uid()),'gestor'::app_role));
comment on table public.whatsapp_templates is 'Catálogo sincronizado de templates oficiais da Meta; não armazena tokens.';