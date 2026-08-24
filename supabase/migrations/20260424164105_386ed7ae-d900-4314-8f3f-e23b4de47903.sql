-- =====================================================================
-- Módulo: PJe Comunica (publicações eletrônicas)
-- =====================================================================

-- 1) OABs monitoradas
CREATE TABLE public.pje_oabs_monitoradas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  numero_oab TEXT NOT NULL,
  uf_oab TEXT NOT NULL CHECK (length(uf_oab) = 2),
  nome_advogado TEXT NOT NULL,
  membro_id UUID REFERENCES public.equipe_membros(id) ON DELETE SET NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  ultima_sync_em TIMESTAMPTZ,
  ultima_sync_qtd INTEGER NOT NULL DEFAULT 0,
  observacoes TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por UUID,
  CONSTRAINT pje_oabs_monitoradas_unica UNIQUE (numero_oab, uf_oab)
);

CREATE INDEX idx_pje_oabs_ativo ON public.pje_oabs_monitoradas(ativo) WHERE ativo = true;
CREATE INDEX idx_pje_oabs_membro ON public.pje_oabs_monitoradas(membro_id);

ALTER TABLE public.pje_oabs_monitoradas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "OABs visíveis a usuários ativos"
ON public.pje_oabs_monitoradas FOR SELECT TO authenticated
USING (public.is_authenticated_active());

CREATE POLICY "Gestores gerenciam OABs"
ON public.pje_oabs_monitoradas FOR ALL TO authenticated
USING (public.is_gestor(auth.uid()))
WITH CHECK (public.is_gestor(auth.uid()));

CREATE TRIGGER pje_oabs_set_updated_at
BEFORE UPDATE ON public.pje_oabs_monitoradas
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Publicações capturadas
CREATE TABLE public.pje_publicacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pje_id TEXT,                      -- id externo do PJe (quando vem)
  hash_dedup TEXT NOT NULL UNIQUE,  -- chave determinística para dedup
  oab_monitorada_id UUID REFERENCES public.pje_oabs_monitoradas(id) ON DELETE SET NULL,
  numero_processo TEXT,             -- CNJ formatado retornado pela API
  numero_processo_limpo TEXT,       -- só dígitos, para join com processos
  sigla_tribunal TEXT,
  nome_orgao TEXT,
  tipo_comunicacao TEXT,
  meio TEXT,                        -- D=DJ, E=Eletrônico
  texto_publicacao TEXT,
  data_disponibilizacao DATE,
  data_publicacao DATE,
  destinatarios JSONB NOT NULL DEFAULT '[]'::jsonb,
  destinatario_advogados JSONB NOT NULL DEFAULT '[]'::jsonb,
  link_certidao TEXT,
  hash_pje TEXT,
  status_leitura TEXT NOT NULL DEFAULT 'nova'
    CHECK (status_leitura IN ('nova','vista','arquivada')),
  vista_em TIMESTAMPTZ,
  vista_por UUID,
  processo_id UUID REFERENCES public.processos(id) ON DELETE SET NULL,
  andamento_id UUID REFERENCES public.andamentos(id) ON DELETE SET NULL,
  item_controladoria_id UUID REFERENCES public.controladoria_itens(id) ON DELETE SET NULL,
  capturada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload_bruto JSONB
);

CREATE INDEX idx_pje_pub_oab ON public.pje_publicacoes(oab_monitorada_id);
CREATE INDEX idx_pje_pub_processo ON public.pje_publicacoes(processo_id);
CREATE INDEX idx_pje_pub_cnj_limpo ON public.pje_publicacoes(numero_processo_limpo);
CREATE INDEX idx_pje_pub_status ON public.pje_publicacoes(status_leitura);
CREATE INDEX idx_pje_pub_data_disp ON public.pje_publicacoes(data_disponibilizacao DESC);

ALTER TABLE public.pje_publicacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Publicações visíveis a quem vê processos"
ON public.pje_publicacoes FOR SELECT TO authenticated
USING (public.has_permission(auth.uid(), 'processos'::modulo, 'visualizar'::acao_permissao));

CREATE POLICY "Edição de publicações por quem edita processos"
ON public.pje_publicacoes FOR UPDATE TO authenticated
USING (public.has_permission(auth.uid(), 'processos'::modulo, 'editar'::acao_permissao))
WITH CHECK (public.has_permission(auth.uid(), 'processos'::modulo, 'editar'::acao_permissao));

CREATE POLICY "Inserção de publicações por gestores ou edge function"
ON public.pje_publicacoes FOR INSERT TO authenticated
WITH CHECK (public.is_gestor(auth.uid()));

CREATE POLICY "Exclusão de publicações por gestores"
ON public.pje_publicacoes FOR DELETE TO authenticated
USING (public.is_gestor(auth.uid()));

-- 3) Log de sincronização
CREATE TABLE public.pje_sync_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  modo TEXT NOT NULL DEFAULT 'manual' CHECK (modo IN ('manual','agendado')),
  oab_id UUID REFERENCES public.pje_oabs_monitoradas(id) ON DELETE SET NULL,
  data_inicio DATE,
  data_fim DATE,
  total_consultadas INTEGER NOT NULL DEFAULT 0,
  total_novas INTEGER NOT NULL DEFAULT 0,
  total_duplicadas INTEGER NOT NULL DEFAULT 0,
  total_vinculadas INTEGER NOT NULL DEFAULT 0,
  total_erros INTEGER NOT NULL DEFAULT 0,
  duracao_ms INTEGER,
  iniciado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalizado_em TIMESTAMPTZ,
  disparado_por UUID,
  status TEXT NOT NULL DEFAULT 'em_andamento'
    CHECK (status IN ('em_andamento','concluido','erro')),
  mensagem TEXT,
  detalhes JSONB
);

CREATE INDEX idx_pje_log_iniciado ON public.pje_sync_log(iniciado_em DESC);

ALTER TABLE public.pje_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Logs PJe visíveis a gestores"
ON public.pje_sync_log FOR SELECT TO authenticated
USING (public.is_gestor(auth.uid()));

-- 4) Função: vincular publicação a processo (gera andamento + item controladoria)
CREATE OR REPLACE FUNCTION public.pje_vincular_publicacao_a_processo(
  _publicacao_id UUID,
  _processo_id UUID,
  _criar_item_controladoria BOOLEAN DEFAULT true,
  _prazo_dias INTEGER DEFAULT 5
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_pub RECORD;
  v_proc RECORD;
  v_andamento_id UUID;
  v_item_id UUID;
  v_descricao TEXT;
  v_data_venc DATE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sessão inválida'; END IF;
  IF NOT public.has_permission(v_uid, 'processos'::modulo, 'editar'::acao_permissao) THEN
    RAISE EXCEPTION 'Sem permissão para vincular publicações';
  END IF;

  SELECT * INTO v_pub FROM public.pje_publicacoes WHERE id = _publicacao_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Publicação não encontrada'; END IF;

  SELECT id, responsavel_id, cliente_id INTO v_proc FROM public.processos WHERE id = _processo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Processo não encontrado'; END IF;

  v_descricao := COALESCE(v_pub.tipo_comunicacao, 'Publicação PJe')
                 || COALESCE(' — ' || NULLIF(v_pub.nome_orgao, ''), '')
                 || E'\n\n'
                 || COALESCE(v_pub.texto_publicacao, '');

  -- Cria andamento (idempotente: reusa se já existir)
  IF v_pub.andamento_id IS NULL THEN
    INSERT INTO public.andamentos (
      processo_id, descricao, data, fonte, criado_por, gera_acao
    ) VALUES (
      _processo_id,
      v_descricao,
      COALESCE(v_pub.data_disponibilizacao::timestamptz, now()),
      'pje_comunica',
      v_uid,
      _criar_item_controladoria
    )
    RETURNING id INTO v_andamento_id;
  ELSE
    v_andamento_id := v_pub.andamento_id;
  END IF;

  -- Cria item de controladoria com prazo padrão
  IF _criar_item_controladoria AND v_pub.item_controladoria_id IS NULL THEN
    v_data_venc := public.adicionar_dias_uteis(
      COALESCE(v_pub.data_disponibilizacao, CURRENT_DATE),
      GREATEST(_prazo_dias, 1)
    );
    INSERT INTO public.controladoria_itens (
      titulo,
      descricao,
      tipo,
      prioridade,
      data_vencimento,
      data_intimacao,
      cliente_id,
      processo_id,
      criado_por,
      status
    ) VALUES (
      'Publicação PJe: ' || COALESCE(v_pub.tipo_comunicacao, 'comunicação'),
      v_descricao,
      'prazo_processual'::public.tipo_item_controladoria,
      'alta'::public.prioridade,
      (v_data_venc::timestamp AT TIME ZONE 'UTC'),
      COALESCE(v_pub.data_disponibilizacao::timestamptz, now()),
      v_proc.cliente_id,
      _processo_id,
      v_uid,
      'pendente'::public.status_item
    )
    RETURNING id INTO v_item_id;

    IF v_proc.responsavel_id IS NOT NULL THEN
      INSERT INTO public.controladoria_responsaveis (item_id, user_id, papel)
      VALUES (v_item_id, v_proc.responsavel_id, 'responsavel_principal'::public.papel_responsavel)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  -- Atualiza vínculos na publicação
  UPDATE public.pje_publicacoes
  SET processo_id = _processo_id,
      andamento_id = COALESCE(andamento_id, v_andamento_id),
      item_controladoria_id = COALESCE(item_controladoria_id, v_item_id),
      status_leitura = CASE WHEN status_leitura = 'nova' THEN 'vista' ELSE status_leitura END,
      vista_em = COALESCE(vista_em, now()),
      vista_por = COALESCE(vista_por, v_uid)
  WHERE id = _publicacao_id;

  -- Notifica responsável
  IF v_proc.responsavel_id IS NOT NULL AND v_proc.responsavel_id <> v_uid AND v_item_id IS NOT NULL THEN
    INSERT INTO public.notificacoes (user_id, tipo, titulo, descricao, link)
    VALUES (
      v_proc.responsavel_id,
      'tarefa_atribuida',
      'Nova publicação PJe vinculada ao processo',
      COALESCE(v_pub.tipo_comunicacao, 'Publicação')
        || COALESCE(' — ' || NULLIF(v_pub.numero_processo, ''), ''),
      '/processos/' || _processo_id::text
    );
  END IF;

  RETURN v_andamento_id;
END;
$$;