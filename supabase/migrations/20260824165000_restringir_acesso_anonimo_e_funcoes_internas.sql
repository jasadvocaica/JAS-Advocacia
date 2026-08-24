-- Segurança: remove acesso anônimo aos dados internos e impede RPC direto em triggers.
-- Aplicado inicialmente no projeto Supabase mzwnljgujheumdslkloc e mantido aqui para reprodutibilidade.

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon;

REVOKE EXECUTE ON FUNCTION public.catalogo_homologacao_controlada() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.comunicacao_marcar_comunicada(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.producao_aguardar_documentos(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.producao_retomar_producao(uuid, text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.producao_revisor_padrao() FROM anon, PUBLIC;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prorettype = 'trigger'::regtype
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon, authenticated, PUBLIC',
      r.nspname,
      r.proname,
      r.args
    );
  END LOOP;
END $$;
