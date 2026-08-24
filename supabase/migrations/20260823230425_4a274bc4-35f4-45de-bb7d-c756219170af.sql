-- 1) Tabela de pendências de comunicação pós-protocolo
CREATE TABLE IF NOT EXISTS public.comunicacoes_cliente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.controladoria_itens(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  processo_id uuid REFERENCES public.processos(id) ON DELETE SET NULL,
  origem text NOT NULL DEFAULT 'protocolo_finalizado',
  status text NOT NULL DEFAULT 'pendente',
  responsavel_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- SLA OPERACIONAL da comunicação: nada a ver com prazo judicial (data_vencimento)
  sla_preferencial_em date,
  sla_limite_em date,
  comunicado_em timestamptz,
  comunicado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  observacao text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comunicacoes_cliente_status_chk CHECK (status IN ('pendente','concluida','cancelada'))
);

-- Idempotência absoluta: uma única comunicação por tarefa e origem
CREATE UNIQUE INDEX IF NOT EXISTS comunicacoes_cliente_item_origem_uidx
  ON public.comunicacoes_cliente (item_id, origem);
CREATE INDEX IF NOT EXISTS comunicacoes_cliente_resp_status_idx
  ON public.comunicacoes_cliente (responsavel_id, status);

GRANT SELECT, INSERT, UPDATE ON public.comunicacoes_cliente TO authenticated;
GRANT ALL ON public.comunicacoes_cliente TO service_role;

ALTER TABLE public.comunicacoes_cliente ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Equipe interna ativa vê comunicações"
  ON public.comunicacoes_cliente FOR SELECT TO authenticated
  USING (public.is_interno_ativo(auth.uid()));

CREATE POLICY "Gestor gerencia comunicações"
  ON public.comunicacoes_cliente FOR UPDATE TO authenticated
  USING (public.is_gestor(auth.uid()))
  WITH CHECK (public.is_gestor(auth.uid()));

CREATE TRIGGER trg_comunicacoes_cliente_updated
  BEFORE UPDATE ON public.comunicacoes_cliente
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Configuração explícita do responsável comercial pela comunicação
INSERT INTO public.configuracoes_sistema (secao, chave, valor, descricao, tipo, editavel_por, publica)
VALUES ('comercial', 'responsavel_comunicacao_user_id', NULL,
        'Usuário responsável por comunicar o cliente após o protocolo', 'texto', 'gestor', false)
ON CONFLICT DO NOTHING;

-- 3) Geração idempotente da pendência ao finalizar/protocolar
CREATE OR REPLACE FUNCTION public.trg_gerar_comunicacao_pos_protocolo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _resp uuid;
  _resp_valido uuid;
  _novo uuid;
BEGIN
  IF coalesce(NEW.etapa_workflow,'') <> 'finalizado'
     OR coalesce(OLD.etapa_workflow,'') = 'finalizado' THEN
    RETURN NEW;
  END IF;

  -- Só gera com cliente ou processo confiável
  IF NEW.cliente_id IS NULL AND NEW.processo_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT nullif(btrim(coalesce(valor,'')),'')::uuid INTO _resp
  FROM public.configuracoes_sistema
  WHERE secao = 'comercial' AND chave = 'responsavel_comunicacao_user_id';

  -- Sem fallback: só usa o responsável configurado se for interno ativo
  IF _resp IS NOT NULL AND public.is_interno_ativo(_resp) THEN
    _resp_valido := _resp;
  END IF;

  INSERT INTO public.comunicacoes_cliente
    (item_id, cliente_id, processo_id, origem, responsavel_id, sla_preferencial_em, sla_limite_em)
  VALUES (
    NEW.id, NEW.cliente_id, NEW.processo_id, 'protocolo_finalizado', _resp_valido,
    public.adicionar_dias_uteis(current_date, 1),
    public.adicionar_dias_uteis(current_date, 3)
  )
  ON CONFLICT (item_id, origem) DO NOTHING
  RETURNING id INTO _novo;

  IF _novo IS NULL THEN
    RETURN NEW; -- já existia: nada a fazer
  END IF;

  IF _resp_valido IS NULL THEN
    -- Pendência gerencial, sem repassar para ninguém
    INSERT INTO public.producao_juridica_pendencias
      (origem_tipo, origem_id, cliente_id, codigo, status, contexto)
    VALUES ('controladoria_item', NEW.id, NEW.cliente_id,
            'SEM_RESPONSAVEL_COMUNICACAO', 'aberta',
            jsonb_build_object('comunicacao_id', _novo, 'item_id', NEW.id));
  ELSE
    INSERT INTO public.notificacoes (user_id, titulo, descricao, tipo, item_id, link)
    VALUES (_resp_valido, 'Comunicar cliente', NEW.titulo, 'controladoria', NEW.id,
            '/controladoria?item=' || NEW.id::text);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_comunicacao_pos_protocolo ON public.controladoria_itens;
CREATE TRIGGER trg_comunicacao_pos_protocolo
  AFTER UPDATE OF etapa_workflow ON public.controladoria_itens
  FOR EACH ROW EXECUTE FUNCTION public.trg_gerar_comunicacao_pos_protocolo();

-- 4) RPC canônica para marcar "Cliente comunicado"
CREATE OR REPLACE FUNCTION public.comunicacao_marcar_comunicada(_id uuid, _observacao text DEFAULT NULL)
RETURNS public.comunicacoes_cliente
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _row public.comunicacoes_cliente;
  _obs text := nullif(btrim(coalesce(_observacao,'')),'');
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT * INTO _row FROM public.comunicacoes_cliente WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Comunicação não encontrada';
  END IF;

  IF NOT (
    _uid = _row.responsavel_id
    OR public.is_gestor(_uid)
    OR public.has_permission(_uid, 'clientes'::modulo, 'editar'::acao_permissao)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para encerrar esta comunicação';
  END IF;

  IF _row.status = 'concluida' THEN
    RETURN _row; -- idempotente
  END IF;

  UPDATE public.comunicacoes_cliente
     SET status = 'concluida',
         comunicado_em = now(),
         comunicado_por = _uid,
         observacao = coalesce(_obs, observacao)
   WHERE id = _id
   RETURNING * INTO _row;

  -- Histórico auditável no chat da tarefa (não altera a tarefa nem prazos)
  INSERT INTO public.controladoria_comentarios (item_id, processo_id, user_id, texto)
  VALUES (_row.item_id, _row.processo_id, _uid,
          '📞 **Cliente comunicado**' || CASE WHEN _obs IS NOT NULL THEN ' — ' || _obs ELSE '' END);

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.comunicacao_marcar_comunicada(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.comunicacao_marcar_comunicada(uuid, text) TO authenticated;