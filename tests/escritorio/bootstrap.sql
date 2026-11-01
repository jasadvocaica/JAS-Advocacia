-- Completa apenas os contratos mínimos do banco descartável DJEN.
alter table public.pje_sync_log add column id uuid primary key default gen_random_uuid(),
 add column modo text, add column iniciado_em timestamptz default now(),
 add column duracao_ms integer, add column total_novas integer default 0,
 add column total_vinculadas integer default 0, add column total_erros integer default 0, add column mensagem text;
create function public.is_gestor(_user_id uuid) returns boolean language sql as $$select public.is_interno_ativo(_user_id);$$;
\i supabase/migrations/20261101163317_escritorio_virtual.sql
\i supabase/migrations/20261101163406_escritorio_agendamento_corrigir.sql
