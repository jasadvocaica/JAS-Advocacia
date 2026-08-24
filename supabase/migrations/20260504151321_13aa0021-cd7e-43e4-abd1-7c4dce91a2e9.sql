
-- Extens\u00f5es para cron e http
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Relat\u00f3rios gerados por IA
CREATE TABLE IF NOT EXISTS public.ia_relatorios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  mes_referencia date,
  titulo text NOT NULL,
  conteudo text NOT NULL,
  dados jsonb DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ia_rel_tipo ON public.ia_relatorios(tipo, criado_em DESC);

-- An\u00e1lises iniciais por cliente
CREATE TABLE IF NOT EXISTS public.ia_analises_cliente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'analise_inicial',
  conteudo text NOT NULL,
  modelo text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ia_an_cliente ON public.ia_analises_cliente(cliente_id, criado_em DESC);

-- Log de execu\u00e7\u00f5es
CREATE TABLE IF NOT EXISTS public.ia_execucoes_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funcao text NOT NULL,
  status text NOT NULL,
  detalhes jsonb DEFAULT '{}'::jsonb,
  erro text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ia_log_funcao ON public.ia_execucoes_log(funcao, criado_em DESC);

ALTER TABLE public.ia_relatorios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ia_analises_cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ia_execucoes_log ENABLE ROW LEVEL SECURITY;

-- S\u00f3 gestor/advogado podem ler
CREATE POLICY "ia_rel_select" ON public.ia_relatorios FOR SELECT TO authenticated
  USING (public.is_gestor(auth.uid()) OR public.has_role(auth.uid(), 'advogado'));
CREATE POLICY "ia_an_select" ON public.ia_analises_cliente FOR SELECT TO authenticated
  USING (public.is_gestor(auth.uid()) OR public.has_role(auth.uid(), 'advogado'));
CREATE POLICY "ia_log_select" ON public.ia_execucoes_log FOR SELECT TO authenticated
  USING (public.is_gestor(auth.uid()));

-- Gestor pode deletar relat\u00f3rios/an\u00e1lises antigas
CREATE POLICY "ia_rel_del" ON public.ia_relatorios FOR DELETE TO authenticated
  USING (public.is_gestor(auth.uid()));
CREATE POLICY "ia_an_del" ON public.ia_analises_cliente FOR DELETE TO authenticated
  USING (public.is_gestor(auth.uid()));

-- Inserts ocorrem via service role (edge functions), n\u00e3o precisam policy

-- Coluna para sinalizar pedido manual de gera\u00e7\u00e3o de pe\u00e7a
ALTER TABLE public.processos
  ADD COLUMN IF NOT EXISTS ia_peticao_pendente text;

-- Trigger: ao cadastrar cliente, dispara edge function de an\u00e1lise inicial (best effort)
CREATE OR REPLACE FUNCTION public.trg_ia_analisar_novo_cliente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_anon text;
BEGIN
  -- L\u00ea config opcional do GUC; se ausente, sai silenciosamente
  BEGIN
    v_url := current_setting('app.functions_url', true);
    v_anon := current_setting('app.anon_key', true);
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;
  IF v_url IS NULL OR v_anon IS NULL THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url := v_url || '/ia-analise-novo-cliente',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey', v_anon,
      'Authorization', 'Bearer ' || v_anon
    ),
    body := jsonb_build_object('cliente_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ia_analisar_novo_cliente ON public.clientes;
CREATE TRIGGER trg_ia_analisar_novo_cliente
  AFTER INSERT ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.trg_ia_analisar_novo_cliente();

-- Trigger: gera\u00e7\u00e3o de pe\u00e7a quando ia_peticao_pendente \u00e9 setado
CREATE OR REPLACE FUNCTION public.trg_ia_gerar_peticao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_anon text;
BEGIN
  IF NEW.ia_peticao_pendente IS NULL OR NEW.ia_peticao_pendente = '' THEN RETURN NEW; END IF;
  IF OLD.ia_peticao_pendente IS NOT DISTINCT FROM NEW.ia_peticao_pendente THEN RETURN NEW; END IF;

  BEGIN
    v_url := current_setting('app.functions_url', true);
    v_anon := current_setting('app.anon_key', true);
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;
  IF v_url IS NULL OR v_anon IS NULL THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url := v_url || '/ia-gerar-peticao',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey', v_anon,
      'Authorization', 'Bearer ' || v_anon
    ),
    body := jsonb_build_object('processo_id', NEW.id, 'tipo_peticao', NEW.ia_peticao_pendente)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ia_gerar_peticao ON public.processos;
CREATE TRIGGER trg_ia_gerar_peticao
  AFTER UPDATE OF ia_peticao_pendente ON public.processos
  FOR EACH ROW EXECUTE FUNCTION public.trg_ia_gerar_peticao();
