-- ============================================================
-- Agentes de IA — controle de execuções e aprovações
-- O n8n é o cérebro; estas tabelas são a verdade do escritório.
-- ============================================================

-- 1) Catálogo de agentes (o que cada um faz)
CREATE TABLE public.agentes_ia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  descricao TEXT,
  area TEXT NOT NULL DEFAULT 'geral',
  -- Endpoint do webhook no n8n que executa este agente
  webhook_url TEXT,
  -- Se exige aprovação humana antes de ações externas
  exige_aprovacao BOOLEAN NOT NULL DEFAULT true,
  -- Tempo máximo de execução em segundos
  timeout_segundos INTEGER NOT NULL DEFAULT 300,
  ativo BOOLEAN NOT NULL DEFAULT true,
  ordem INTEGER NOT NULL DEFAULT 0,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agentes_ia ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_agentes_ia_updated BEFORE UPDATE ON public.agentes_ia
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Execuções: cada vez que um agente roda
CREATE TYPE public.status_execucao AS ENUM (
  'pendente',      -- criada, aguardando o n8n
  'executando',
  'aguardando_aprovacao', -- produziu resultado que precisa de revisão
  'concluida',
  'rejeitada',
  'erro',
  'cancelada'
);

CREATE TABLE public.agente_execucoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agente_id UUID NOT NULL REFERENCES public.agentes_ia(id) ON DELETE RESTRICT,
  -- Quem disparou (pode ser o sistema, um usuário ou um gatilho agendado)
  disparado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  origem TEXT NOT NULL DEFAULT 'manual', -- manual | agendado | evento | whatsapp
  status public.status_execucao NOT NULL DEFAULT 'pendente',
  entrada JSONB NOT NULL DEFAULT '{}'::jsonb,
  saida JSONB,
  resumo TEXT,
  erro TEXT,
  -- Entidade relacionada (processo, cliente, item) quando aplicável
  processo_id UUID REFERENCES public.processos(id) ON DELETE SET NULL,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  item_id UUID REFERENCES public.controladoria_itens(id) ON DELETE SET NULL,
  iniciado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalizado_em TIMESTAMPTZ,
  duracao_ms INTEGER
);

ALTER TABLE public.agente_execucoes ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_ag_exec_status ON public.agente_execucoes(status);
CREATE INDEX idx_ag_exec_agente ON public.agente_execucoes(agente_id, iniciado_em DESC);
CREATE INDEX idx_ag_exec_inicio ON public.agente_execucoes(iniciado_em DESC);

-- 3) Log de passos (o que o agente fez, para auditoria)
CREATE TABLE public.agente_execucao_logs (
  id BIGSERIAL PRIMARY KEY,
  execucao_id UUID NOT NULL REFERENCES public.agente_execucoes(id) ON DELETE CASCADE,
  nivel TEXT NOT NULL DEFAULT 'info', -- info | warn | erro
  mensagem TEXT NOT NULL,
  detalhe JSONB,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agente_execucao_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_ag_logs_exec ON public.agente_execucao_logs(execucao_id, id);

-- 4) Aprovações humanas
CREATE TABLE public.agente_aprovacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execucao_id UUID NOT NULL REFERENCES public.agente_execucoes(id) ON DELETE CASCADE,
  conteudo JSONB NOT NULL DEFAULT '{}'::jsonb,
  decisao TEXT, -- aprovado | rejeitado
  decidido_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decidido_em TIMESTAMPTZ,
  observacao TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agente_aprovacoes ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_ag_aprov_pend ON public.agente_aprovacoes(execucao_id) WHERE decisao IS NULL;

-- ============================================================
-- RLS: leitura para quem tem permissão de 'controladoria';
-- escrita pelas Edge Functions (service role) e gestores.
-- ============================================================
CREATE POLICY "ver agentes" ON public.agentes_ia FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'controladoria', 'visualizar'));
CREATE POLICY "gerir agentes" ON public.agentes_ia FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'controladoria', 'editar'))
  WITH CHECK (public.has_permission(auth.uid(), 'controladoria', 'editar'));

CREATE POLICY "ver execucoes" ON public.agente_execucoes FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'controladoria', 'visualizar'));
CREATE POLICY "criar execucoes" ON public.agente_execucoes FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'controladoria', 'criar'));
CREATE POLICY "atualizar execucoes" ON public.agente_execucoes FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'controladoria', 'editar'))
  WITH CHECK (public.has_permission(auth.uid(), 'controladoria', 'editar'));

CREATE POLICY "ver logs agentes" ON public.agente_execucao_logs FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'controladoria', 'visualizar'));
CREATE POLICY "inserir logs agentes" ON public.agente_execucao_logs FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'controladoria', 'criar'));

CREATE POLICY "ver aprovacoes" ON public.agente_aprovacoes FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'controladoria', 'visualizar'));
CREATE POLICY "criar aprovacoes" ON public.agente_aprovacoes FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'controladoria', 'criar'));
CREATE POLICY "decidir aprovacoes" ON public.agente_aprovacoes FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'controladoria', 'editar'))
  WITH CHECK (public.has_permission(auth.uid(), 'controladoria', 'editar'));

-- ============================================================
-- Agentes iniciais que você escolheu
-- ============================================================
INSERT INTO public.agentes_ia (slug, nome, descricao, area, exige_aprovacao, ordem) VALUES
  ('monitor-prazos',
   'Monitor de prazos',
   'Lê intimações e publicações, identifica o tipo de prazo e cria o item na Controladoria com o responsável e a data limite.',
   'processual', true, 1),
  ('minuta-pecas',
   'Redator de minutas',
   'Gera minuta de peça a partir do modelo, dos dados do processo e do histórico do cliente. Sempre passa por revisão antes de virar documento.',
   'processual', true, 2),
  ('relatorio-diario',
   'Relatório diário',
   'Consolida prazos do dia, atrasos, audiências e pendências por responsável e envia o resumo para você.',
   'gestao', false, 3);
