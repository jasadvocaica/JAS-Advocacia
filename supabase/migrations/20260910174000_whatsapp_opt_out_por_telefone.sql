create or replace function public.normalizar_whatsapp(numero text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when length(regexp_replace(numero, '[^0-9]', '', 'g')) in (10, 11)
      then '55' || regexp_replace(numero, '[^0-9]', '', 'g')
    else regexp_replace(numero, '[^0-9]', '', 'g')
  end
$$;

alter table public.whatsapp_conversas
  add column if not exists telefone_normalizado text
  generated always as (public.normalizar_whatsapp(telefone)) stored;

create index if not exists whatsapp_conversas_telefone_normalizado_idx
  on public.whatsapp_conversas(telefone_normalizado);

create table if not exists public.whatsapp_contatos_bloqueados (
  telefone_normalizado text primary key,
  revogado_em timestamptz not null,
  termo text,
  conversa_origem_id uuid references public.whatsapp_conversas(id) on delete set null,
  mensagem_origem_id uuid references public.whatsapp_mensagens(id) on delete set null,
  restaurado_em timestamptz,
  restaurado_por uuid references auth.users(id) on delete set null,
  atualizado_em timestamptz not null default now(),
  constraint whatsapp_contatos_bloqueados_telefone_check
    check (telefone_normalizado ~ '^[0-9]{8,20}$')
);

alter table public.whatsapp_contatos_bloqueados enable row level security;

create policy whatsapp_contatos_bloqueados_select
  on public.whatsapp_contatos_bloqueados
  for select to authenticated
  using (has_permission((select auth.uid()), 'marketing'::modulo, 'visualizar'::acao_permissao));

create policy whatsapp_contatos_bloqueados_update_gestao
  on public.whatsapp_contatos_bloqueados
  for update to authenticated
  using (has_role((select auth.uid()), 'gestor'::app_role))
  with check (has_role((select auth.uid()), 'gestor'::app_role));

grant select, update on public.whatsapp_contatos_bloqueados to authenticated;

create or replace function public.whatsapp_herdar_bloqueio_contato()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  bloqueio public.whatsapp_contatos_bloqueados%rowtype;
begin
  select * into bloqueio
  from public.whatsapp_contatos_bloqueados
  where telefone_normalizado = public.normalizar_whatsapp(new.telefone)
    and restaurado_em is null;

  if found then
    new.opt_out_em := bloqueio.revogado_em;
    new.opt_out_termo := bloqueio.termo;
    new.opt_out_mensagem_id := bloqueio.mensagem_origem_id;
  end if;
  return new;
end;
$$;

drop trigger if exists whatsapp_conversas_herdar_bloqueio on public.whatsapp_conversas;
create trigger whatsapp_conversas_herdar_bloqueio
before insert or update of telefone on public.whatsapp_conversas
for each row execute function public.whatsapp_herdar_bloqueio_contato();

revoke all on function public.whatsapp_herdar_bloqueio_contato() from public, anon, authenticated;

comment on table public.whatsapp_contatos_bloqueados is
  'Bloqueio por telefone normalizado, preservado entre conversas até restauração formal pela gestão.';
