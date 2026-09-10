create table if not exists public.whatsapp_conversa_historico (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.whatsapp_conversas(id) on delete cascade,
  evento text not null check (evento in ('criada','status_alterado','responsavel_alterado')),
  status_anterior text,
  status_novo text,
  responsavel_anterior_id uuid references auth.users(id) on delete set null,
  responsavel_novo_id uuid references auth.users(id) on delete set null,
  alterado_por uuid references auth.users(id) on delete set null,
  ocorrido_em timestamptz not null default now()
);

create index if not exists whatsapp_conversa_historico_conversa_idx
  on public.whatsapp_conversa_historico (conversa_id, ocorrido_em desc);

alter table public.whatsapp_conversa_historico enable row level security;

create policy whatsapp_conversa_historico_select
  on public.whatsapp_conversa_historico
  for select to authenticated
  using (public.has_permission((select auth.uid()), 'marketing'::modulo, 'visualizar'::acao_permissao));

grant select on public.whatsapp_conversa_historico to authenticated;

create or replace function public.registrar_whatsapp_conversa_historico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.whatsapp_conversa_historico (
      conversa_id, evento, status_novo, responsavel_novo_id, alterado_por
    ) values (
      new.id, 'criada', new.status, new.responsavel_id, auth.uid()
    );
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.whatsapp_conversa_historico (
      conversa_id, evento, status_anterior, status_novo, alterado_por
    ) values (
      new.id, 'status_alterado', old.status, new.status, auth.uid()
    );
  end if;

  if new.responsavel_id is distinct from old.responsavel_id then
    insert into public.whatsapp_conversa_historico (
      conversa_id, evento, responsavel_anterior_id, responsavel_novo_id, alterado_por
    ) values (
      new.id, 'responsavel_alterado', old.responsavel_id, new.responsavel_id, auth.uid()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists whatsapp_conversa_historico_trigger on public.whatsapp_conversas;
create trigger whatsapp_conversa_historico_trigger
after insert or update of status, responsavel_id on public.whatsapp_conversas
for each row execute function public.registrar_whatsapp_conversa_historico();

comment on table public.whatsapp_conversa_historico is
  'Auditoria imutável de abertura, status e atribuição; não duplica conteúdo nem telefone.';