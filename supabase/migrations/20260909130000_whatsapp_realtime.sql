-- Habilita atualização em tempo real da central comercial.
-- As políticas RLS existentes continuam filtrando quem pode receber as alterações.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='whatsapp_conversas'
  ) then
    alter publication supabase_realtime add table public.whatsapp_conversas;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='whatsapp_mensagens'
  ) then
    alter publication supabase_realtime add table public.whatsapp_mensagens;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='whatsapp_conexoes'
  ) then
    alter publication supabase_realtime add table public.whatsapp_conexoes;
  end if;
end
$$;
