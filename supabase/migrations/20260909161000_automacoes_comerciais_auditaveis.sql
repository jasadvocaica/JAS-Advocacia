create table if not exists public.mkt_automacoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 3 and 120),
  categoria text not null default 'follow_up' check (categoria in ('follow_up','crm','captacao','mensagem')),
  gatilho text not null check (gatilho in ('lead_criado','lead_sem_resposta','etapa_alterada','consulta_agendada','contrato_assinado')),
  atraso_minutos integer not null default 0 check (atraso_minutos between 0 and 43200),
  mensagem_template text not null check (char_length(btrim(mensagem_template)) between 1 and 4096),
  status text not null default 'rascunho' check (status in ('rascunho','ativa','pausada')),
  criado_por uuid references auth.users(id) on delete set null,
  atualizado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create table if not exists public.mkt_automacao_execucoes (
  id uuid primary key default gen_random_uuid(),
  automacao_id uuid not null references public.mkt_automacoes(id) on delete restrict,
  lead_id uuid references public.mkt_leads(id) on delete set null,
  conversa_id uuid references public.whatsapp_conversas(id) on delete set null,
  status text not null default 'pendente' check (status in ('pendente','processando','sucesso','falha','cancelada')),
  agendada_para timestamptz not null,
  executada_em timestamptz,
  erro_resumo text,
  provider_message_id text,
  criado_em timestamptz not null default now(),
  constraint mkt_automacao_execucao_alvo check (lead_id is not null or conversa_id is not null)
);
create index if not exists idx_mkt_automacoes_status on public.mkt_automacoes(status);
create index if not exists idx_mkt_automacao_execucoes_fila on public.mkt_automacao_execucoes(status, agendada_para);
create unique index if not exists idx_mkt_automacao_execucoes_provider on public.mkt_automacao_execucoes(provider_message_id) where provider_message_id is not null;
alter table public.mkt_automacoes enable row level security;
alter table public.mkt_automacao_execucoes enable row level security;
create policy mkt_automacoes_select on public.mkt_automacoes for select using (public.has_permission((select auth.uid()), 'marketing'::modulo, 'visualizar'::acao_permissao));
create policy mkt_automacoes_insert on public.mkt_automacoes for insert with check (public.has_permission((select auth.uid()), 'marketing'::modulo, 'criar'::acao_permissao));
create policy mkt_automacoes_update on public.mkt_automacoes for update using (public.has_permission((select auth.uid()), 'marketing'::modulo, 'editar'::acao_permissao)) with check (public.has_permission((select auth.uid()), 'marketing'::modulo, 'editar'::acao_permissao));
create policy mkt_automacao_execucoes_select on public.mkt_automacao_execucoes for select using (public.has_permission((select auth.uid()), 'marketing'::modulo, 'visualizar'::acao_permissao));
create or replace function public.mkt_automacao_definir_status(_id uuid, _status text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.has_permission(auth.uid(), 'marketing'::modulo, 'editar'::acao_permissao) then raise exception 'Sem permissão para alterar automações.'; end if;
  if _status not in ('rascunho','ativa','pausada') then raise exception 'Status inválido.'; end if;
  if _status = 'ativa' and not exists (select 1 from public.whatsapp_conexoes where ativo=true and status='conectado') then
    raise exception 'Conecte e homologue o canal oficial antes de ativar automações.';
  end if;
  update public.mkt_automacoes set status=_status, atualizado_por=auth.uid(), atualizado_em=now() where id=_id;
  if not found then raise exception 'Automação não encontrada.'; end if;
end;
$$;
revoke all on function public.mkt_automacao_definir_status(uuid,text) from public;
grant execute on function public.mkt_automacao_definir_status(uuid,text) to authenticated;
comment on table public.mkt_automacoes is 'Regras comerciais configuráveis; rascunhos não executam ações.';
comment on table public.mkt_automacao_execucoes is 'Fila e histórico auditável de execuções comerciais reais.';