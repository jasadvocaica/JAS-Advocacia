-- Higienização e proteção da base principal de clientes e processos.
create or replace function public.normalizar_cliente_processo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'clientes' then
    new.nome := regexp_replace(trim(new.nome), '\s+', ' ', 'g');
    new.cpf_cnpj := nullif(regexp_replace(coalesce(new.cpf_cnpj, ''), '[^0-9]', '', 'g'), '');
    new.email := nullif(lower(trim(coalesce(new.email, ''))), '');
    new.whatsapp := nullif(regexp_replace(coalesce(new.whatsapp, ''), '[^0-9]', '', 'g'), '');
    new.telefone_adicional := nullif(regexp_replace(coalesce(new.telefone_adicional, ''), '[^0-9]', '', 'g'), '');
  elsif tg_table_name = 'processos' then
    new.numero_cnj := nullif(regexp_replace(coalesce(new.numero_cnj, ''), '[^0-9]', '', 'g'), '');
    new.numero_cnj_limpo := new.numero_cnj;
    new.tipo_acao := nullif(regexp_replace(trim(coalesce(new.tipo_acao, '')), '\s+', ' ', 'g'), '');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_normalizar_clientes on public.clientes;
create trigger trg_normalizar_clientes
before insert or update on public.clientes
for each row execute function public.normalizar_cliente_processo();

drop trigger if exists trg_normalizar_processos on public.processos;
create trigger trg_normalizar_processos
before insert or update on public.processos
for each row execute function public.normalizar_cliente_processo();

update public.clientes
set nome = regexp_replace(trim(nome), '\s+', ' ', 'g'),
    cpf_cnpj = nullif(regexp_replace(coalesce(cpf_cnpj, ''), '[^0-9]', '', 'g'), ''),
    email = nullif(lower(trim(coalesce(email, ''))), ''),
    whatsapp = nullif(regexp_replace(coalesce(whatsapp, ''), '[^0-9]', '', 'g'), '');

update public.processos
set numero_cnj = nullif(regexp_replace(coalesce(numero_cnj, ''), '[^0-9]', '', 'g'), ''),
    numero_cnj_limpo = nullif(regexp_replace(coalesce(numero_cnj, ''), '[^0-9]', '', 'g'), '');

alter table public.clientes drop constraint if exists clientes_cpf_cnpj_valido_check;
alter table public.clientes add constraint clientes_cpf_cnpj_valido_check
check (cpf_cnpj is null or length(cpf_cnpj) in (11,14)) not valid;
alter table public.clientes validate constraint clientes_cpf_cnpj_valido_check;

alter table public.processos drop constraint if exists processos_numero_cnj_valido_check;
alter table public.processos add constraint processos_numero_cnj_valido_check
check (numero_cnj is null or length(numero_cnj)=20) not valid;
alter table public.processos validate constraint processos_numero_cnj_valido_check;

create unique index if not exists clientes_cpf_cnpj_unico_idx
on public.clientes (cpf_cnpj) where cpf_cnpj is not null;

create unique index if not exists processos_numero_cnj_unico_idx
on public.processos (numero_cnj) where numero_cnj is not null;

drop policy if exists "excluir clientes" on public.clientes;
create policy "somente gestor exclui clientes"
on public.clientes for delete to authenticated
using (public.has_role(auth.uid(), 'gestor'::public.app_role));

drop policy if exists "excluir processos" on public.processos;
create policy "somente gestor exclui processos"
on public.processos for delete to authenticated
using (public.has_role(auth.uid(), 'gestor'::public.app_role));

create or replace function public.auditar_base_clientes_processos()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select case when public.has_role(auth.uid(), 'gestor'::public.app_role) then
    jsonb_build_object(
      'clientes_total', (select count(*) from public.clientes),
      'clientes_sem_documento', (select count(*) from public.clientes where cpf_cnpj is null),
      'clientes_sem_email', (select count(*) from public.clientes where email is null),
      'clientes_sem_whatsapp', (select count(*) from public.clientes where whatsapp is null),
      'processos_total', (select count(*) from public.processos),
      'judiciais_sem_cnj', (select count(*) from public.processos where tipo='judicial' and numero_cnj is null),
      'processos_sem_responsavel', (select count(*) from public.processos where responsavel_id is null),
      'migracao_total', (select count(*) from public.migracao_clientes_processos),
      'migracao_revisar', (select count(*) from public.migracao_clientes_processos where situacao_validacao='revisar'),
      'migracao_prontos', (select count(*) from public.migracao_clientes_processos where situacao_validacao='pronto'),
      'migracao_importados', (select count(*) from public.migracao_clientes_processos where situacao_validacao='importado')
    )
  else
    jsonb_build_object('erro','acesso_negado')
  end;
$$;

revoke all on function public.auditar_base_clientes_processos() from public;
grant execute on function public.auditar_base_clientes_processos() to authenticated;