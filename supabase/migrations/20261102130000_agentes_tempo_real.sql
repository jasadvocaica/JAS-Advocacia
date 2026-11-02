-- Escritório em tempo real: o app recebe na hora quando uma execução de agente começa,
-- termina ou muda de estado. As políticas RLS existentes continuam filtrando quem recebe.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='agente_execucoes'
  ) then
    alter publication supabase_realtime add table public.agente_execucoes;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='escritorio_mensagens'
  ) then
    alter publication supabase_realtime add table public.escritorio_mensagens;
  end if;
end
$$;
