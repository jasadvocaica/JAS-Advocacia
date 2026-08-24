
-- ============================================================
-- 1. ESTENDER TABELA processos
-- ============================================================
ALTER TABLE public.processos
  ADD COLUMN IF NOT EXISTS numero_cnj_limpo text,
  ADD COLUMN IF NOT EXISTS tribunal_sigla text,
  ADD COLUMN IF NOT EXISTS tribunal_nome text,
  ADD COLUMN IF NOT EXISTS datajud_alias text,
  ADD COLUMN IF NOT EXISTS instancia text CHECK (instancia IN ('1grau','2grau','superior','turma_recursal')),
  ADD COLUMN IF NOT EXISTS dib date,
  ADD COLUMN IF NOT EXISTS dcb date,
  ADD COLUMN IF NOT EXISTS fase_administrativa text,
  ADD COLUMN IF NOT EXISTS data_encerramento date,
  ADD COLUMN IF NOT EXISTS datajud_ultima_consulta timestamp with time zone,
  ADD COLUMN IF NOT EXISTS datajud_ultimo_andamento_id text,
  ADD COLUMN IF NOT EXISTS datajud_ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS datajud_ultimo_erro text;

-- Backfill numero_cnj_limpo a partir de numero_cnj existente
UPDATE public.processos
SET numero_cnj_limpo = regexp_replace(numero_cnj, '\D', '', 'g')
WHERE numero_cnj IS NOT NULL AND numero_cnj_limpo IS NULL;

CREATE INDEX IF NOT EXISTS idx_processos_numero_cnj_limpo ON public.processos(numero_cnj_limpo);
CREATE INDEX IF NOT EXISTS idx_processos_nb_inss ON public.processos(nb_inss);
CREATE INDEX IF NOT EXISTS idx_processos_status ON public.processos(status);
CREATE INDEX IF NOT EXISTS idx_processos_responsavel ON public.processos(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_processos_datajud_ativo ON public.processos(datajud_ativo) WHERE datajud_ativo = true;

-- ============================================================
-- 2. ESTENDER TABELA andamentos
-- ============================================================
ALTER TABLE public.andamentos
  ADD COLUMN IF NOT EXISTS datajud_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS codigo_movimento integer,
  ADD COLUMN IF NOT EXISTS complemento_tpu jsonb,
  ADD COLUMN IF NOT EXISTS gera_acao boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acao_gerada_tipo text,
  ADD COLUMN IF NOT EXISTS acao_gerada_id uuid;

CREATE INDEX IF NOT EXISTS idx_andamentos_processo_data ON public.andamentos(processo_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_andamentos_codigo ON public.andamentos(codigo_movimento);
CREATE INDEX IF NOT EXISTS idx_andamentos_fonte ON public.andamentos(fonte);

-- ============================================================
-- 3. TABELA processo_status (status customizáveis)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.processo_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  cor text NOT NULL DEFAULT '#888780',
  ordem integer NOT NULL DEFAULT 0,
  tipo_processo text NOT NULL DEFAULT 'ambos' CHECK (tipo_processo IN ('judicial','administrativo','ambos')),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.processo_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "todos veem status processo"
  ON public.processo_status FOR SELECT TO authenticated USING (true);

CREATE POLICY "gestor gerencia status processo"
  ON public.processo_status FOR ALL TO authenticated
  USING (is_gestor(auth.uid()))
  WITH CHECK (is_gestor(auth.uid()));

-- Seed
INSERT INTO public.processo_status (nome, cor, ordem, tipo_processo) VALUES
  ('Em andamento',           '#185FA5', 1, 'ambos'),
  ('Aguardando despacho',    '#BA7517', 2, 'judicial'),
  ('Aguardando perícia',     '#BA7517', 3, 'ambos'),
  ('Em fase recursal',       '#534AB7', 4, 'judicial'),
  ('Aguardando julgamento',  '#534AB7', 5, 'judicial'),
  ('Transitado em julgado',  '#3B6D11', 6, 'judicial'),
  ('Processo suspenso',      '#5F5E5A', 7, 'ambos'),
  ('Cumprimento de sentença','#0F6E56', 8, 'judicial'),
  ('Encerrado — procedente', '#3B6D11', 9, 'ambos'),
  ('Encerrado — improcedente','#A32D2D',10, 'ambos'),
  ('Arquivado',              '#5F5E5A', 11, 'ambos'),
  ('Requerimento protocolado','#185FA5',12, 'administrativo'),
  ('Em análise INSS',        '#BA7517', 13, 'administrativo'),
  ('Deferido',               '#3B6D11', 14, 'administrativo'),
  ('Indeferido',             '#A32D2D', 15, 'administrativo'),
  ('Recurso CRPS',           '#534AB7', 16, 'administrativo'),
  ('Cessado',                '#A32D2D', 17, 'administrativo')
ON CONFLICT (nome) DO NOTHING;

-- ============================================================
-- 4. TABELA processo_partes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.processo_partes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id uuid NOT NULL REFERENCES public.processos(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('autor','reu','interessado','terceiro')),
  nome text NOT NULL,
  cpf_cnpj text,
  advogado_nome text,
  advogado_oab text,
  origem text NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual','datajud')),
  criado_em timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_processo_partes_processo ON public.processo_partes(processo_id);

ALTER TABLE public.processo_partes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ver partes processo"
  ON public.processo_partes FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'processos'::modulo, 'visualizar'::acao_permissao));

CREATE POLICY "criar partes processo"
  ON public.processo_partes FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'processos'::modulo, 'editar'::acao_permissao));

CREATE POLICY "editar partes processo"
  ON public.processo_partes FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'processos'::modulo, 'editar'::acao_permissao));

CREATE POLICY "excluir partes processo"
  ON public.processo_partes FOR DELETE TO authenticated
  USING (has_permission(auth.uid(), 'processos'::modulo, 'editar'::acao_permissao));

-- ============================================================
-- 5. TABELA datajud_regras_acao
-- ============================================================
CREATE TABLE IF NOT EXISTS public.datajud_regras_acao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_movimento integer NOT NULL,
  nome_movimento text NOT NULL,
  acao text NOT NULL CHECK (acao IN ('nenhuma','notificar','criar_tarefa','criar_prazo','disparar_fluxo')),
  prazo_dias integer,
  prazo_tipo text DEFAULT 'uteis' CHECK (prazo_tipo IN ('uteis','corridos')),
  fluxo_template_id uuid REFERENCES public.fluxos_templates(id) ON DELETE SET NULL,
  titulo_tarefa text,
  prioridade prioridade NOT NULL DEFAULT 'alta',
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (codigo_movimento, nome_movimento)
);

CREATE TRIGGER set_updated_at_datajud_regras
  BEFORE UPDATE ON public.datajud_regras_acao
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.datajud_regras_acao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "todos veem regras datajud"
  ON public.datajud_regras_acao FOR SELECT TO authenticated USING (true);

CREATE POLICY "gestor gerencia regras datajud"
  ON public.datajud_regras_acao FOR ALL TO authenticated
  USING (is_gestor(auth.uid()))
  WITH CHECK (is_gestor(auth.uid()));

-- Seed regras
INSERT INTO public.datajud_regras_acao (codigo_movimento, nome_movimento, acao, prazo_dias, prazo_tipo, titulo_tarefa, prioridade) VALUES
  (11009, 'Sentença', 'criar_prazo', 15, 'uteis', 'Sentença recebida — analisar recurso — {{numero_processo}} — {{cliente}}', 'urgente'),
  (11010, 'Acórdão', 'criar_prazo', 15, 'uteis', 'Verificar acórdão e decidir recurso — {{numero_processo}}', 'urgente'),
  (848,   'Despacho', 'notificar', NULL, NULL, NULL, 'media'),
  (11007, 'Decisão interlocutória', 'criar_tarefa', NULL, NULL, 'Analisar decisão interlocutória — {{numero_processo}}', 'alta'),
  (11014, 'Audiência designada', 'criar_tarefa', NULL, NULL, 'Audiência marcada — {{numero_processo}} — {{cliente}}', 'alta'),
  (7863,  'Citação', 'criar_prazo', 15, 'uteis', 'Contestação — prazo fatal — {{numero_processo}}', 'urgente'),
  (7864,  'Intimação', 'criar_tarefa', NULL, NULL, 'Analisar intimação — {{numero_processo}}', 'alta'),
  (22,    'Juntada', 'notificar', NULL, NULL, NULL, 'baixa'),
  (864,   'Embargos de declaração', 'criar_prazo', 5, 'uteis', 'Contrarrazões de embargos — prazo 5 dias úteis — {{numero_processo}}', 'urgente'),
  (11008, 'Perícia designada', 'criar_tarefa', NULL, NULL, 'Preparar cliente para perícia — {{numero_processo}}', 'alta'),
  (12,    'Distribuição', 'notificar', NULL, NULL, NULL, 'baixa'),
  (123,   'Conclusão', 'notificar', NULL, NULL, NULL, 'media'),
  (193,   'Baixa definitiva', 'criar_tarefa', NULL, NULL, 'Verificar baixa definitiva e encerrar processo — {{numero_processo}}', 'alta')
ON CONFLICT (codigo_movimento, nome_movimento) DO NOTHING;

-- ============================================================
-- 6. TABELA datajud_log_execucoes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.datajud_log_execucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iniciado_em timestamp with time zone NOT NULL DEFAULT now(),
  finalizado_em timestamp with time zone,
  modo text NOT NULL DEFAULT 'agendado' CHECK (modo IN ('agendado','manual','processo_unico')),
  total_consultados integer NOT NULL DEFAULT 0,
  total_andamentos_novos integer NOT NULL DEFAULT 0,
  total_acoes_geradas integer NOT NULL DEFAULT 0,
  total_erros integer NOT NULL DEFAULT 0,
  duracao_ms integer,
  detalhes jsonb,
  disparado_por uuid
);

CREATE INDEX idx_datajud_log_iniciado ON public.datajud_log_execucoes(iniciado_em DESC);

ALTER TABLE public.datajud_log_execucoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gestor le log datajud"
  ON public.datajud_log_execucoes FOR SELECT TO authenticated
  USING (is_gestor(auth.uid()));

CREATE POLICY "sistema insere log datajud"
  ON public.datajud_log_execucoes FOR INSERT TO authenticated
  WITH CHECK (is_authenticated_active());

CREATE POLICY "sistema atualiza log datajud"
  ON public.datajud_log_execucoes FOR UPDATE TO authenticated
  USING (is_authenticated_active());

-- ============================================================
-- 7. Trigger updated_at em processos (já existia? Garantir)
-- ============================================================
DROP TRIGGER IF EXISTS set_updated_at_processos ON public.processos;
CREATE TRIGGER set_updated_at_processos
  BEFORE UPDATE ON public.processos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
