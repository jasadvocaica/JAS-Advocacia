-- =========================================================
-- MURAL DE AVISOS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.mural_avisos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  conteudo text NOT NULL,
  prioridade text NOT NULL DEFAULT 'normal' CHECK (prioridade IN ('urgente','normal','informativo')),
  fixado boolean NOT NULL DEFAULT false,
  destinatarias uuid[] NOT NULL DEFAULT '{}',
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz,
  leituras jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_mural_avisos_ordem ON public.mural_avisos (fixado DESC, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_mural_avisos_expira ON public.mural_avisos (expira_em);

ALTER TABLE public.mural_avisos ENABLE ROW LEVEL SECURITY;

-- Validação por trigger (em vez de CHECK não-imutável)
CREATE OR REPLACE FUNCTION public.trg_mural_validar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.expira_em IS NOT NULL AND NEW.expira_em <= NEW.criado_em THEN
    RAISE EXCEPTION 'expira_em deve ser posterior à criação';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_mural_validar ON public.mural_avisos;
CREATE TRIGGER trg_mural_validar
  BEFORE INSERT OR UPDATE ON public.mural_avisos
  FOR EACH ROW EXECUTE FUNCTION public.trg_mural_validar();

-- RLS Mural
DROP POLICY IF EXISTS "mural select destinatarios" ON public.mural_avisos;
CREATE POLICY "mural select destinatarios" ON public.mural_avisos
FOR SELECT TO authenticated
USING (
  public.is_gestor(auth.uid())
  OR cardinality(destinatarias) = 0
  OR public.gp_membro_id_do_usuario(auth.uid()) = ANY(destinatarias)
);

DROP POLICY IF EXISTS "mural gestor insere" ON public.mural_avisos;
CREATE POLICY "mural gestor insere" ON public.mural_avisos
FOR INSERT TO authenticated
WITH CHECK (public.is_gestor(auth.uid()));

DROP POLICY IF EXISTS "mural gestor edita" ON public.mural_avisos;
CREATE POLICY "mural gestor edita" ON public.mural_avisos
FOR UPDATE TO authenticated
USING (public.is_gestor(auth.uid()))
WITH CHECK (public.is_gestor(auth.uid()));

DROP POLICY IF EXISTS "mural gestor exclui" ON public.mural_avisos;
CREATE POLICY "mural gestor exclui" ON public.mural_avisos
FOR DELETE TO authenticated
USING (public.is_gestor(auth.uid()));

-- Função para destinatária marcar leitura (bypass RLS de UPDATE para gestor)
CREATE OR REPLACE FUNCTION public.mural_marcar_lido(_aviso_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_membro uuid;
  v_aviso RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sessão inválida'; END IF;
  v_membro := public.gp_membro_id_do_usuario(v_uid);

  SELECT * INTO v_aviso FROM public.mural_avisos WHERE id = _aviso_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aviso não encontrado'; END IF;

  -- valida se a usuária é destinatária ou gestor
  IF NOT (
    public.is_gestor(v_uid)
    OR cardinality(v_aviso.destinatarias) = 0
    OR v_membro = ANY(v_aviso.destinatarias)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para marcar este aviso';
  END IF;

  -- já leu?
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_aviso.leituras) e
    WHERE e->>'user_id' = v_uid::text
  ) THEN
    RETURN;
  END IF;

  UPDATE public.mural_avisos
  SET leituras = leituras || jsonb_build_array(
    jsonb_build_object('user_id', v_uid::text, 'lido_em', now())
  )
  WHERE id = _aviso_id;
END $$;

CREATE OR REPLACE FUNCTION public.mural_marcar_todos_lidos()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_membro uuid;
  v_count int := 0;
  r RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sessão inválida'; END IF;
  v_membro := public.gp_membro_id_do_usuario(v_uid);

  FOR r IN
    SELECT id FROM public.mural_avisos
    WHERE (expira_em IS NULL OR expira_em > now())
      AND (
        public.is_gestor(v_uid)
        OR cardinality(destinatarias) = 0
        OR v_membro = ANY(destinatarias)
      )
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(leituras) e
        WHERE e->>'user_id' = v_uid::text
      )
  LOOP
    PERFORM public.mural_marcar_lido(r.id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.mural_avisos;
ALTER TABLE public.mural_avisos REPLICA IDENTITY FULL;

-- =========================================================
-- PONTO — RLS estagiária + RPC self-service
-- =========================================================

-- SELECT do próprio ponto
DROP POLICY IF EXISTS "Membro vê próprio ponto" ON public.gp_ponto_registros;
CREATE POLICY "Membro vê próprio ponto" ON public.gp_ponto_registros
FOR SELECT TO authenticated
USING (membro_id = public.gp_membro_id_do_usuario(auth.uid()));

-- RPC self-service: registra entrada/saida_almoco/retorno_almoco/saida do dia atual
CREATE OR REPLACE FUNCTION public.ponto_registrar_evento(_evento text)
RETURNS public.gp_ponto_registros
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_membro uuid;
  v_data date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  v_hora time := (now() AT TIME ZONE 'America/Cuiaba')::time;
  v_reg public.gp_ponto_registros;
  v_horas numeric(5,2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sessão inválida'; END IF;
  IF _evento NOT IN ('entrada','saida_almoco','retorno_almoco','saida') THEN
    RAISE EXCEPTION 'Evento inválido';
  END IF;

  v_membro := public.gp_membro_id_do_usuario(v_uid);
  IF v_membro IS NULL THEN RAISE EXCEPTION 'Usuário não vinculado a um membro da equipe'; END IF;

  -- Cria linha do dia se não existir
  INSERT INTO public.gp_ponto_registros (membro_id, data, registrado_por, tipo_registro)
  VALUES (v_membro, v_data, v_uid, 'manual')
  ON CONFLICT (membro_id, data) DO NOTHING;

  SELECT * INTO v_reg FROM public.gp_ponto_registros
  WHERE membro_id = v_membro AND data = v_data FOR UPDATE;

  -- Bloqueia sobrescrita
  IF _evento = 'entrada' AND v_reg.entrada IS NOT NULL THEN
    RAISE EXCEPTION 'Entrada já registrada hoje';
  ELSIF _evento = 'saida_almoco' AND v_reg.saida_almoco IS NOT NULL THEN
    RAISE EXCEPTION 'Saída para almoço já registrada';
  ELSIF _evento = 'retorno_almoco' AND v_reg.retorno_almoco IS NOT NULL THEN
    RAISE EXCEPTION 'Retorno do almoço já registrado';
  ELSIF _evento = 'saida' AND v_reg.saida IS NOT NULL THEN
    RAISE EXCEPTION 'Saída já registrada';
  END IF;

  -- Validações de ordem
  IF _evento <> 'entrada' AND v_reg.entrada IS NULL THEN
    RAISE EXCEPTION 'Registre a entrada primeiro';
  END IF;
  IF _evento = 'retorno_almoco' AND v_reg.saida_almoco IS NULL THEN
    RAISE EXCEPTION 'Registre a saída para almoço primeiro';
  END IF;
  IF _evento = 'saida' AND v_reg.saida_almoco IS NOT NULL AND v_reg.retorno_almoco IS NULL THEN
    RAISE EXCEPTION 'Registre o retorno do almoço primeiro';
  END IF;

  -- Aplica
  IF _evento = 'entrada' THEN
    UPDATE public.gp_ponto_registros SET entrada = v_hora WHERE id = v_reg.id;
  ELSIF _evento = 'saida_almoco' THEN
    UPDATE public.gp_ponto_registros SET saida_almoco = v_hora WHERE id = v_reg.id;
  ELSIF _evento = 'retorno_almoco' THEN
    UPDATE public.gp_ponto_registros SET retorno_almoco = v_hora WHERE id = v_reg.id;
  ELSIF _evento = 'saida' THEN
    -- calcula horas trabalhadas (saida - entrada - almoço)
    v_horas := EXTRACT(EPOCH FROM (v_hora - v_reg.entrada))/3600.0;
    IF v_reg.saida_almoco IS NOT NULL AND v_reg.retorno_almoco IS NOT NULL THEN
      v_horas := v_horas - EXTRACT(EPOCH FROM (v_reg.retorno_almoco - v_reg.saida_almoco))/3600.0;
    END IF;
    UPDATE public.gp_ponto_registros
    SET saida = v_hora,
        horas_trabalhadas = ROUND(v_horas::numeric, 2)
    WHERE id = v_reg.id;
  END IF;

  SELECT * INTO v_reg FROM public.gp_ponto_registros WHERE id = v_reg.id;
  RETURN v_reg;
END $$;

GRANT EXECUTE ON FUNCTION public.mural_marcar_lido(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mural_marcar_todos_lidos() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ponto_registrar_evento(text) TO authenticated;