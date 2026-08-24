CREATE TABLE public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  cor text NOT NULL DEFAULT '#BC943F',
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.processos_tags (
  processo_id uuid NOT NULL REFERENCES public.processos(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (processo_id, tag_id)
);

CREATE INDEX idx_proc_tags_tag ON public.processos_tags(tag_id);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processos_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read tags" ON public.tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write tags" ON public.tags FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update tags" ON public.tags FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete tags" ON public.tags FOR DELETE TO authenticated USING (true);

CREATE POLICY "auth read pt" ON public.processos_tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write pt" ON public.processos_tags FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth delete pt" ON public.processos_tags FOR DELETE TO authenticated USING (true);

INSERT INTO public.tags (nome, cor) VALUES
  ('Urgente', '#ef4444'),
  ('Aguardando INSS', '#f59e0b'),
  ('Aguardando Perícia', '#8b5cf6'),
  ('RPV Liberada', '#10b981'),
  ('Recurso Pendente', '#3b82f6'),
  ('Acordo em Andamento', '#06b6d4'),
  ('Sem Documentos', '#6b7280'),
  ('Prioritário', '#BC943F')
ON CONFLICT (nome) DO NOTHING;