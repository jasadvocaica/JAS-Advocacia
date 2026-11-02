-- Área de produção: contexto persistente, histórico atômico e controle de concorrência.
ALTER TABLE public.doc_pecas ADD COLUMN contexto_producao jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.doc_pecas_versoes ADD COLUMN contexto_producao jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.validar_workspace_documento()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  tarefa public.controladoria_itens%ROWTYPE;
BEGIN
  -- Rotinas internas existentes usam papéis de manutenção, sem sessão de usuário.
  -- O endpoint do workspace, abaixo, continua exigindo auth.uid() em qualquer chamada.
  IF auth.uid() IS NULL AND current_user IN ('postgres', 'service_role', 'supabase_admin') THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão necessária' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = NEW.cliente_id) THEN
    RAISE EXCEPTION 'Cliente indisponível para este usuário' USING ERRCODE = '42501';
  END IF;
  IF NEW.processo_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.processos WHERE id = NEW.processo_id AND cliente_id = NEW.cliente_id
  ) THEN RAISE EXCEPTION 'O processo deve pertencer ao cliente selecionado'; END IF;
  IF COALESCE(NEW.contexto_producao->>'tarefa_id', '') <> '' THEN
    SELECT * INTO tarefa FROM public.controladoria_itens WHERE id = (NEW.contexto_producao->>'tarefa_id')::uuid;
    IF NOT FOUND OR tarefa.cliente_id IS DISTINCT FROM NEW.cliente_id
      OR (tarefa.processo_id IS NOT NULL AND tarefa.processo_id IS DISTINCT FROM NEW.processo_id) THEN
      RAISE EXCEPTION 'Tarefa não encontrada ou não vinculada ao mesmo cliente/processo';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.status <> 'rascunho' THEN RAISE EXCEPTION 'Novas peças devem iniciar como rascunho'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (OLD.status = 'protocolado' OR (OLD.status = 'finalizado' AND NEW.status <> 'rascunho')) AND (
      NEW.conteudo_html IS DISTINCT FROM OLD.conteudo_html OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
      OR NEW.processo_id IS DISTINCT FROM OLD.processo_id OR NEW.contexto_producao IS DISTINCT FROM OLD.contexto_producao
      OR NEW.titulo IS DISTINCT FROM OLD.titulo OR NEW.categoria IS DISTINCT FROM OLD.categoria
      OR NEW.fonte IS DISTINCT FROM OLD.fonte OR NEW.tamanho_fonte IS DISTINCT FROM OLD.tamanho_fonte
      OR NEW.espacamento_entre_linhas IS DISTINCT FROM OLD.espacamento_entre_linhas
      OR (OLD.status = 'protocolado' AND NEW.protocolado_em IS DISTINCT FROM OLD.protocolado_em)
    ) THEN RAISE EXCEPTION 'Documento finalizado: reabra para revisão antes de editar'; END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (
        (OLD.status = 'rascunho' AND NEW.status = 'em_revisao') OR
        (OLD.status = 'em_revisao' AND NEW.status IN ('rascunho', 'revisado')) OR
        (OLD.status = 'revisado' AND NEW.status IN ('rascunho', 'finalizado')) OR
        (OLD.status = 'finalizado' AND NEW.status IN ('rascunho', 'protocolado'))
      ) THEN RAISE EXCEPTION 'Transição de revisão inválida'; END IF;
      IF (NEW.status IN ('revisado', 'finalizado', 'protocolado') OR OLD.status = 'finalizado') AND NOT (
        public.is_gestor(auth.uid()) OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'advogado')
      ) THEN RAISE EXCEPTION 'A aprovação exige advogado ou gestão' USING ERRCODE = '42501'; END IF;
      IF NEW.status IN ('em_revisao', 'revisado', 'finalizado', 'protocolado') AND (
        btrim(regexp_replace(NEW.conteudo_html, '<[^>]*>', '', 'g')) = '' OR
        NEW.conteudo_html ~* '\{\{[^}]+\}\}|\[(INSERIR|PENDENTE|CONFERIR)[^\]]*\]'
      ) THEN RAISE EXCEPTION 'Preencha o documento e seus campos pendentes'; END IF;
      IF NEW.status IN ('revisado', 'finalizado', 'protocolado') THEN
        IF NOT COALESCE((NEW.contexto_producao->'checklist') @> '["fatos","pedido","fontes","anexos","formatacao"]'::jsonb, false)
          THEN RAISE EXCEPTION 'Conclua a conferência de revisão'; END IF;
        IF EXISTS (SELECT 1 FROM public.doc_comentarios WHERE peca_id = NEW.id AND NOT resolvido)
          THEN RAISE EXCEPTION 'Há comentários de revisão abertos'; END IF;
        IF (COALESCE(NEW.contexto_producao->>'intimacao', '') <> '' OR COALESCE(NEW.contexto_producao->>'prazo_processual', '') <> '')
          AND NOT COALESCE((NEW.contexto_producao->>'prazo_conferido')::boolean, false)
          THEN RAISE EXCEPTION 'Confirme a conferência do prazo'; END IF;
      END IF;
      IF NEW.status = 'revisado' THEN NEW.revisado_por := auth.uid(); END IF;
      IF NEW.status = 'finalizado' THEN NEW.finalizado_por := auth.uid(); NEW.finalizado_em := now(); END IF;
      IF NEW.status = 'protocolado' AND NEW.protocolado_em IS NULL THEN RAISE EXCEPTION 'Informe a data efetiva do protocolo'; END IF;
      IF NEW.status = 'rascunho' THEN
        NEW.revisado_por := NULL; NEW.finalizado_por := NULL; NEW.finalizado_em := NULL;
      END IF;
    ELSIF OLD.status = 'revisado' AND (NEW.conteudo_html IS DISTINCT FROM OLD.conteudo_html OR NEW.contexto_producao IS DISTINCT FROM OLD.contexto_producao) THEN
      NEW.status := 'rascunho'; NEW.revisado_por := NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER validar_workspace_documento BEFORE INSERT OR UPDATE ON public.doc_pecas
FOR EACH ROW EXECUTE FUNCTION public.validar_workspace_documento();

CREATE OR REPLACE FUNCTION public.salvar_documento_workspace(
  p_id uuid, p_dados jsonb, p_atualizado_em timestamptz DEFAULT NULL,
  p_nova_versao boolean DEFAULT false, p_nome_versao text DEFAULT NULL
) RETURNS public.doc_pecas LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  anterior public.doc_pecas%ROWTYPE;
  resultado public.doc_pecas%ROWTYPE;
  numero integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão necessária' USING ERRCODE = '42501'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.doc_pecas(titulo, categoria, cliente_id, processo_id, conteudo_html, contexto_producao, fonte, tamanho_fonte, espacamento_entre_linhas, elaborado_por)
    VALUES (p_dados->>'titulo', (p_dados->>'categoria')::public.doc_categoria, (p_dados->>'cliente_id')::uuid,
      NULLIF(p_dados->>'processo_id', '')::uuid, p_dados->>'conteudo_html', COALESCE(p_dados->'contexto_producao', '{}'::jsonb),
      p_dados->>'fonte', (p_dados->>'tamanho_fonte')::integer, (p_dados->>'espacamento_entre_linhas')::numeric, auth.uid()) RETURNING * INTO resultado;
    -- Quem pode criar mas não editar continua podendo salvar sua primeira peça.
    IF public.has_permission(auth.uid(), 'documentos'::public.modulo, 'editar'::public.acao_permissao) THEN
      INSERT INTO public.doc_pecas_versoes(peca_id, numero_versao, nome_versao, conteudo_html, contexto_producao, salvo_por)
      VALUES(resultado.id, 1, 'Versão inicial', resultado.conteudo_html, resultado.contexto_producao, auth.uid());
    END IF;
  ELSE
    SELECT * INTO anterior FROM public.doc_pecas WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Documento indisponível' USING ERRCODE = '42501'; END IF;
    IF p_atualizado_em IS NULL OR anterior.atualizado_em IS DISTINCT FROM p_atualizado_em THEN
      RAISE EXCEPTION 'O documento foi alterado em outra sessão. Exporte sua minuta e recarregue antes de continuar.' USING ERRCODE = '40001';
    END IF;
    numero := anterior.versao_atual;
    IF p_nova_versao THEN
      -- Guarda também o rascunho mais recente antes de qualquer substituição.
      SELECT GREATEST(numero, COALESCE(max(numero_versao), 0)) + 1 INTO numero FROM public.doc_pecas_versoes WHERE peca_id = p_id;
      INSERT INTO public.doc_pecas_versoes(peca_id, numero_versao, nome_versao, conteudo_html, contexto_producao, salvo_por)
      VALUES(p_id, numero, 'Antes de ' || COALESCE(p_nome_versao, 'nova versão'), anterior.conteudo_html, anterior.contexto_producao, auth.uid());
      numero := numero + 1;
    END IF;
    UPDATE public.doc_pecas SET titulo = p_dados->>'titulo', categoria = (p_dados->>'categoria')::public.doc_categoria,
      cliente_id = (p_dados->>'cliente_id')::uuid, processo_id = NULLIF(p_dados->>'processo_id', '')::uuid,
      conteudo_html = p_dados->>'conteudo_html', contexto_producao = COALESCE(p_dados->'contexto_producao', '{}'::jsonb),
      fonte = p_dados->>'fonte', tamanho_fonte = (p_dados->>'tamanho_fonte')::integer,
      espacamento_entre_linhas = (p_dados->>'espacamento_entre_linhas')::numeric, versao_atual = numero,
      status = COALESCE(p_dados->>'status', anterior.status::text)::public.doc_peca_status,
      protocolado_em = COALESCE(NULLIF(p_dados->>'protocolado_em', '')::date, anterior.protocolado_em)
    WHERE id = p_id RETURNING * INTO resultado;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sem permissão para editar o documento' USING ERRCODE = '42501'; END IF;
    IF p_nova_versao THEN
      INSERT INTO public.doc_pecas_versoes(peca_id, numero_versao, nome_versao, conteudo_html, contexto_producao, salvo_por)
      VALUES(p_id, numero, p_nome_versao, resultado.conteudo_html, resultado.contexto_producao, auth.uid());
    END IF;
  END IF;
  RETURN resultado;
END $$;
REVOKE ALL ON FUNCTION public.salvar_documento_workspace(uuid,jsonb,timestamptz,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_documento_workspace(uuid,jsonb,timestamptz,boolean,text) TO authenticated;
