-- Banco descartável para os testes das migrations DJEN. As tabelas abaixo
-- reproduzem somente os contratos usados pelo fluxo; não são schema de produção.
do $$ begin create role anon; exception when duplicate_object then null; end; $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end; $$;
do $$ begin create role service_role bypassrls; exception when duplicate_object then null; end; $$;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create table public.profiles(id uuid primary key, ativo boolean not null default true);
create function public.is_interno_ativo(_user_id uuid) returns boolean language sql as $$
  select exists(select 1 from public.profiles where id = _user_id and ativo);
$$;
create function public.has_permission(_user_id uuid, _modulo text, _acao text)
returns boolean language sql as $$ select public.is_interno_ativo(_user_id); $$;
create function public.set_updated_at() returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end; $$;
create type public.status_item as enum ('pendente','concluido','cancelado');
create table public.processos (
  id uuid primary key default gen_random_uuid(), numero_cnj_limpo text unique,
  cliente_id uuid, responsavel_id uuid references public.profiles(id)
);
create table public.clientes(id uuid primary key);
create table public.controladoria_itens (
  id uuid primary key default gen_random_uuid(), tipo text, titulo text, descricao text,
  processo_id uuid references public.processos, cliente_id uuid,
  responsavel_id uuid references public.profiles, data_vencimento timestamptz,
  data_prazo_interno date, data_prazo_judicial date,
  prioridade text, status public.status_item, origem text, prazo_conferido boolean
);
create table public.controladoria_responsaveis (
  item_id uuid references public.controladoria_itens, user_id uuid references public.profiles,
  papel text, primary key(item_id,user_id)
);
create table public.andamentos (
  id uuid primary key default gen_random_uuid(), processo_id uuid references public.processos,
  data date, descricao text, fonte text, datajud_id text,
  unique(processo_id,datajud_id)
);
create table public.pje_publicacoes (
  id uuid primary key default gen_random_uuid(), pje_id text, hash_pje text,
  numero_processo_limpo text, numero_processo text, data_disponibilizacao date,
  texto_publicacao text, tipo_comunicacao text, nome_orgao text, sigla_tribunal text, link_certidao text,
  processo_id uuid references public.processos, andamento_id uuid references public.andamentos,
  item_controladoria_id uuid references public.controladoria_itens
);
create table public.feriados(data date primary key);
create table public.pje_monitoramentos(id uuid primary key, ativo boolean not null default true);
create function public.adicionar_dias_uteis(_data_inicio date, _dias integer)
returns date language plpgsql as $$
declare d date := _data_inicio; n integer := 0;
begin
  while n < _dias loop
    d := d + 1;
    if extract(isodow from d) < 6 and not exists(select 1 from feriados where data = d) then n := n + 1; end if;
  end loop;
  return d;
end; $$;
create table public.controladoria_google_eventos (
  item_id uuid primary key references public.controladoria_itens on delete cascade,
  google_event_id text, google_calendar_id text, ultimo_erro text
);
create table public.pje_sync_log(finalizado_em timestamptz, status text);
create schema cron;
create table cron.job(jobid bigint generated always as identity, jobname text, schedule text, command text, active boolean default true);
create function cron.schedule(text,text,text) returns bigint language plpgsql as $$
declare i bigint;
begin insert into cron.job(jobname,schedule,command) values ($1,$2,$3) returning jobid into i; return i; end; $$;
create function cron.alter_job(job_id bigint, schedule text default null, active boolean default null) returns void language sql as $$
  update cron.job j set schedule = coalesce($2, j.schedule), active = coalesce($3, j.active) where j.jobid = $1;
$$;
create schema vault;
create table vault.decrypted_secrets(name text, decrypted_secret text);
create schema net;
create table net._http_response(id bigint, status_code integer, error_msg text);
create sequence net.request_id;
create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer)
returns bigint language sql as $$ select nextval('net.request_id'); $$;

\i supabase/migrations/20261031120000_agentes_ia_controle.sql
\i supabase/migrations/20261101142313_agentes_djen_nativos.sql
\i supabase/migrations/20261101143142_djen_agenda_recuperavel.sql
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
