-- Somente após tests/agentes/bootstrap.sql, em banco descartável.
create schema assistente_privado;
grant usage on schema assistente_privado to authenticated,service_role;
create table public.assistente_config(id boolean primary key default true, habilitado boolean default false);
insert into public.assistente_config(id) values(true);
create table public.assistente_consumo(
  id uuid primary key, user_id uuid references auth.users(id),
  status text default 'reservado', criado_em timestamptz default now(),
  tokens_entrada bigint default 0,tokens_saida bigint default 0
);
grant all on public.assistente_config,public.assistente_consumo to service_role;
\i supabase/migrations/20261101154020_limite_diario_tokens_openai.sql
