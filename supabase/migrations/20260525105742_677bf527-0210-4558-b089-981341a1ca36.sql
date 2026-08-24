-- Fases padronizadas do escritório
CREATE TABLE public.processo_fases_padrao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  cor text NOT NULL DEFAULT '#94a3b8',
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.processo_fases_padrao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "equipe le fases padrao" ON public.processo_fases_padrao
  FOR SELECT TO authenticated USING (is_authenticated_active());
CREATE POLICY "equipe cria fases padrao" ON public.processo_fases_padrao
  FOR INSERT TO authenticated WITH CHECK (is_authenticated_active());
CREATE POLICY "equipe atualiza fases padrao" ON public.processo_fases_padrao
  FOR UPDATE TO authenticated USING (is_authenticated_active()) WITH CHECK (is_authenticated_active());
CREATE POLICY "equipe remove fases padrao" ON public.processo_fases_padrao
  FOR DELETE TO authenticated USING (is_authenticated_active());

CREATE TRIGGER trg_fases_padrao_updated
  BEFORE UPDATE ON public.processo_fases_padrao
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed das fases iniciais
INSERT INTO public.processo_fases_padrao (nome, ordem, cor, descricao) VALUES
  ('Petição inicial', 1, '#3b82f6', 'Processo distribuído, aguardando análise inicial'),
  ('Citação', 2, '#8b5cf6', 'Parte contrária sendo notificada'),
  ('Contestação', 3, '#a855f7', 'Aguardando ou analisando a defesa'),
  ('Instrução', 4, '#ec4899', 'Produção de provas e depoimentos'),
  ('Audiência', 5, '#f59e0b', 'Audiência designada ou realizada'),
  ('Sentença', 6, '#10b981', 'Decisão de primeiro grau proferida'),
  ('Recurso', 7, '#f97316', 'Recurso interposto, aguardando julgamento'),
  ('Trânsito em julgado', 8, '#22c55e', 'Decisão final, sem mais recursos');

-- FK opcional em processos
ALTER TABLE public.processos
  ADD COLUMN fase_padrao_id uuid REFERENCES public.processo_fases_padrao(id) ON DELETE SET NULL;

CREATE INDEX idx_processos_fase_padrao ON public.processos(fase_padrao_id);

-- Toggle de notificação automática por processo
ALTER TABLE public.cliente_portal_processos
  ADD COLUMN notificar_cliente_mudancas boolean NOT NULL DEFAULT false;

-- Visibilidade de diligências no portal
ALTER TABLE public.checklist_diligencias
  ADD COLUMN visivel_cliente boolean NOT NULL DEFAULT false;