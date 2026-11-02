-- Contratos mínimos da produção para testar o motor num banco DESCARTÁVEL.
-- Nunca executar em projeto real.
create role service_role;
create role authenticated;
create role anon;
create schema auth;
create table auth.users(id uuid primary key);
create type public.modulo as enum ('clientes','processos','controladoria','financeiro','documentos','relatorios','usuarios','parceiros','equipe','dashboard','marketing');
create type public.acao_permissao as enum ('visualizar','criar','editar','excluir','exportar');
create table public.teste_pessoas(id uuid primary key, gestor boolean not null default false, ativo boolean not null default true);
create table public.teste_permissoes(user_id uuid, modulo public.modulo, acao public.acao_permissao);
create function public.is_gestor(_user_id uuid) returns boolean language sql stable as
 $$ select coalesce((select gestor from public.teste_pessoas where id=_user_id), false) $$;
create function public.is_interno_ativo(_user_id uuid) returns boolean language sql stable as
 $$ select coalesce((select ativo from public.teste_pessoas where id=_user_id), false) $$;
create function public.has_permission(_user_id uuid, _modulo public.modulo, _acao public.acao_permissao) returns boolean language sql stable as
 $$ select public.is_gestor(_user_id) or exists(select 1 from public.teste_permissoes where user_id=_user_id and modulo=_modulo and acao=_acao) $$;
create table public.agentes_ia(id uuid primary key default gen_random_uuid(), slug text unique not null, nome text not null,
 ativo boolean not null default true, executor text, supervisor_id uuid);
create type public.status_execucao as enum ('pendente','executando','aguardando_aprovacao','concluida','rejeitada','erro','cancelada');
create table public.agente_execucoes(id uuid primary key default gen_random_uuid(), agente_id uuid not null references public.agentes_ia(id),
 disparado_por uuid, origem text not null default 'manual', status public.status_execucao not null default 'pendente',
 entrada jsonb not null default '{}', saida jsonb, resumo text, erro text, iniciado_em timestamptz not null default now(), finalizado_em timestamptz);
grant select, insert, update on public.agentes_ia, public.agente_execucoes, public.teste_pessoas, public.teste_permissoes to service_role;
create table public.pje_publicacoes(id uuid primary key default gen_random_uuid(), numero_processo text,
 sigla_tribunal text, nome_orgao text, tipo_comunicacao text, texto_publicacao text,
 data_disponibilizacao date, link_certidao text);
