alter table public.assistente_config add column limite_tokens_diario bigint not null default 50000
  check (limite_tokens_diario between 1000 and 10000000);

create table public.assistente_reservas_tokens (
  solicitacao_id uuid not null references public.assistente_consumo(id) on delete cascade,
  rodada smallint not null check (rodada between 0 and 3),
  dia date not null default ((now() at time zone 'America/Cuiaba')::date),
  reservados integer not null check (reservados > 0),
  entrada integer not null default 0 check (entrada >= 0),
  saida integer not null default 0 check (saida >= 0),
  confirmada boolean not null default false,
  criado_em timestamptz not null default now(),
  primary key (solicitacao_id, rodada)
);
alter table public.assistente_reservas_tokens enable row level security;
revoke all on public.assistente_reservas_tokens from public, anon, authenticated;
grant all on public.assistente_reservas_tokens to service_role;
create index assistente_tokens_dia on public.assistente_reservas_tokens(dia);

create function public.assistente_reservar_tokens(p_id uuid,p_rodada integer,p_entrada integer,p_saida_max integer)
returns boolean language plpgsql security invoker set search_path = ''
as $$
declare v_dia date := (now() at time zone 'America/Cuiaba')::date;
  v_limite bigint; v_usado bigint; v_anterior bigint;
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  if p_rodada is null or p_rodada not between 0 and 3 or p_entrada is null or p_entrada not between 0 and 200000
    or p_saida_max is null or p_saida_max not between 1 and 1000 then raise exception 'Reserva de tokens inválida'; end if;
  perform pg_advisory_xact_lock(79415622);
  if exists(select 1 from public.assistente_reservas_tokens where solicitacao_id=p_id and rodada=p_rodada) then return false; end if;
  if not exists(select 1 from public.assistente_consumo where id=p_id and status='reservado') then
    raise exception 'Solicitação indisponível';
  end if;
  select limite_tokens_diario into v_limite from public.assistente_config where id and habilitado;
  if v_limite is null then raise exception 'Assistente desativado'; end if;
  select coalesce(sum(case when confirmada then entrada+saida else reservados end),0)
    into v_usado from public.assistente_reservas_tokens where dia=v_dia;
  -- Inclui consumo do dia anterior à implantação deste controle, sem duplicá-lo.
  select coalesce(sum(c.tokens_entrada+c.tokens_saida),0) into v_anterior from public.assistente_consumo c
    where (c.criado_em at time zone 'America/Cuiaba')::date=v_dia
      and not exists(select 1 from public.assistente_reservas_tokens r where r.solicitacao_id=c.id);
  if v_usado+v_anterior+p_entrada+p_saida_max > v_limite then
    raise exception 'Limite diário de tokens atingido. O saldo renova à meia-noite de Cuiabá.';
  end if;
  insert into public.assistente_reservas_tokens(solicitacao_id,rodada,dia,reservados)
    values(p_id,p_rodada,v_dia,p_entrada+p_saida_max);
  return true;
end;
$$;
revoke all on function public.assistente_reservar_tokens(uuid,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.assistente_reservar_tokens(uuid,integer,integer,integer) to service_role;

create function public.assistente_confirmar_tokens(p_id uuid,p_rodada integer,p_entrada integer,p_saida integer)
returns boolean language plpgsql security invoker set search_path = ''
as $$
declare r public.assistente_reservas_tokens%rowtype;
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  if p_entrada is null or p_saida is null or p_entrada < 0 or p_saida < 0 then raise exception 'Consumo inválido'; end if;
  perform pg_advisory_xact_lock(79415622);
  select * into r from public.assistente_reservas_tokens where solicitacao_id=p_id and rodada=p_rodada for update;
  if not found then raise exception 'Reserva não encontrada'; end if;
  if r.confirmada then return r.entrada=p_entrada and r.saida=p_saida; end if;
  update public.assistente_reservas_tokens set entrada=p_entrada,saida=p_saida,confirmada=true
    where solicitacao_id=p_id and rodada=p_rodada;
  if p_entrada+p_saida > r.reservados then
    -- Não oculta cobrança inesperada do provedor; interrompe novas chamadas.
    update public.assistente_config set habilitado=false where id;
    return false;
  end if;
  return true;
end;
$$;
revoke all on function public.assistente_confirmar_tokens(uuid,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.assistente_confirmar_tokens(uuid,integer,integer,integer) to service_role;

create function assistente_privado.tokens_dia()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_dia date := (now() at time zone 'America/Cuiaba')::date;
  v_usado bigint; v_reservado bigint; v_anterior bigint; v_limite bigint;
begin
  if auth.uid() is null or not public.is_interno_ativo(auth.uid()) then raise exception 'Sem acesso' using errcode='42501'; end if;
  select limite_tokens_diario into v_limite from public.assistente_config where id;
  select coalesce(sum(entrada+saida) filter(where confirmada),0),
    coalesce(sum(reservados) filter(where not confirmada),0) into v_usado,v_reservado
    from public.assistente_reservas_tokens where dia=v_dia;
  select coalesce(sum(c.tokens_entrada+c.tokens_saida),0) into v_anterior from public.assistente_consumo c
    where (c.criado_em at time zone 'America/Cuiaba')::date=v_dia
      and not exists(select 1 from public.assistente_reservas_tokens r where r.solicitacao_id=c.id);
  return jsonb_build_object('dia',v_dia,'limite',v_limite,'usados',v_usado+v_anterior,
    'reservados',v_reservado,'disponiveis',greatest(0,v_limite-v_usado-v_anterior-v_reservado));
end;
$$;
revoke all on function assistente_privado.tokens_dia() from public,anon;
grant execute on function assistente_privado.tokens_dia() to authenticated;
create function public.assistente_tokens_dia() returns jsonb language sql stable security invoker set search_path = ''
as $$ select assistente_privado.tokens_dia(); $$;
revoke all on function public.assistente_tokens_dia() from public,anon;
grant execute on function public.assistente_tokens_dia() to authenticated;
