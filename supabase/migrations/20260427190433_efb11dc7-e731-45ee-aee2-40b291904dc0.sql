CREATE TABLE public.assistente_conversas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo TEXT,
  mensagens JSONB NOT NULL DEFAULT '[]'::jsonb,
  contexto_usado JSONB NOT NULL DEFAULT '{}'::jsonb,
  arquivada BOOLEAN NOT NULL DEFAULT false,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_assistente_conversas_user ON public.assistente_conversas(user_id, atualizado_em DESC);
CREATE INDEX idx_assistente_conversas_arquivada ON public.assistente_conversas(user_id, arquivada);

ALTER TABLE public.assistente_conversas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário vê suas conversas (ou gestor vê tudo)"
  ON public.assistente_conversas FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_gestor(auth.uid()));

CREATE POLICY "Usuário cria suas próprias conversas"
  ON public.assistente_conversas FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuário atualiza suas próprias conversas"
  ON public.assistente_conversas FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuário apaga suas próprias conversas"
  ON public.assistente_conversas FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_assistente_conversas_updated_at
  BEFORE UPDATE ON public.assistente_conversas
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();