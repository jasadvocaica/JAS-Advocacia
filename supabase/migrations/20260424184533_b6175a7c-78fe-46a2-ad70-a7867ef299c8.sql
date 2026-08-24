-- Tabela de modelos de notificação (referências para a IA)
CREATE TABLE IF NOT EXISTS public.ferramentas_modelos_notificacao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  conteudo TEXT NOT NULL,
  file_name TEXT,
  file_data TEXT,
  file_mime TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_por UUID,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Histórico de notificações geradas
CREATE TABLE IF NOT EXISTS public.ferramentas_notificacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  notificante_nome TEXT,
  notificado_nome TEXT,
  notificado_cpf TEXT,
  referencia TEXT,
  total_geral NUMERIC(14,2) DEFAULT 0,
  dados_completos JSONB NOT NULL DEFAULT '{}'::jsonb,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  processo_id UUID REFERENCES public.processos(id) ON DELETE SET NULL,
  pdf_notificacao_url TEXT,
  pdf_recibo_url TEXT,
  criado_por UUID,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ferramentas_notificacoes_cliente ON public.ferramentas_notificacoes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ferramentas_notificacoes_processo ON public.ferramentas_notificacoes(processo_id);
CREATE INDEX IF NOT EXISTS idx_ferramentas_notificacoes_criado_em ON public.ferramentas_notificacoes(criado_em DESC);

DROP TRIGGER IF EXISTS trg_ferramentas_modelos_notificacao_updated ON public.ferramentas_modelos_notificacao;
CREATE TRIGGER trg_ferramentas_modelos_notificacao_updated
  BEFORE UPDATE ON public.ferramentas_modelos_notificacao
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_ferramentas_notificacoes_updated ON public.ferramentas_notificacoes;
CREATE TRIGGER trg_ferramentas_notificacoes_updated
  BEFORE UPDATE ON public.ferramentas_notificacoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.ferramentas_modelos_notificacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ferramentas_notificacoes ENABLE ROW LEVEL SECURITY;

-- Modelos
CREATE POLICY "modelos_notif_select_ativos"
  ON public.ferramentas_modelos_notificacao FOR SELECT
  TO authenticated
  USING (public.is_authenticated_active());

CREATE POLICY "modelos_notif_insert_ativos"
  ON public.ferramentas_modelos_notificacao FOR INSERT
  TO authenticated
  WITH CHECK (public.is_authenticated_active() AND criado_por = auth.uid());

CREATE POLICY "modelos_notif_update_owner_or_gestor"
  ON public.ferramentas_modelos_notificacao FOR UPDATE
  TO authenticated
  USING (criado_por = auth.uid() OR public.is_gestor(auth.uid()));

CREATE POLICY "modelos_notif_delete_owner_or_gestor"
  ON public.ferramentas_modelos_notificacao FOR DELETE
  TO authenticated
  USING (criado_por = auth.uid() OR public.is_gestor(auth.uid()));

-- Notificações geradas
CREATE POLICY "notif_select_ativos"
  ON public.ferramentas_notificacoes FOR SELECT
  TO authenticated
  USING (public.is_authenticated_active());

CREATE POLICY "notif_insert_ativos"
  ON public.ferramentas_notificacoes FOR INSERT
  TO authenticated
  WITH CHECK (public.is_authenticated_active() AND criado_por = auth.uid());

CREATE POLICY "notif_update_owner_or_gestor"
  ON public.ferramentas_notificacoes FOR UPDATE
  TO authenticated
  USING (criado_por = auth.uid() OR public.is_gestor(auth.uid()));

CREATE POLICY "notif_delete_owner_or_gestor"
  ON public.ferramentas_notificacoes FOR DELETE
  TO authenticated
  USING (criado_por = auth.uid() OR public.is_gestor(auth.uid()));