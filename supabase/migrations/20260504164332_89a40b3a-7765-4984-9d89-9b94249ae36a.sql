CREATE TABLE public.bia_preferencias (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  tipo_item TEXT NOT NULL CHECK (tipo_item IN ('publicacao','item_controladoria','processo','geral')),
  nivel_autonomia TEXT NOT NULL DEFAULT 'sugerir_confirmar' CHECK (nivel_autonomia IN ('sugerir','sugerir_confirmar','aplicar_auto')),
  estilo TEXT NOT NULL DEFAULT 'objetivo' CHECK (estilo IN ('objetivo','detalhado','formal','direto')),
  tom TEXT NOT NULL DEFAULT 'neutro' CHECK (tom IN ('neutro','tecnico','didatico')),
  prioridade_padrao TEXT CHECK (prioridade_padrao IN ('urgente','alta','media','baixa')),
  prazo_padrao_dias INTEGER,
  instrucoes_extras TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, tipo_item)
);

ALTER TABLE public.bia_preferencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own bia prefs" ON public.bia_preferencias
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own bia prefs" ON public.bia_preferencias
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own bia prefs" ON public.bia_preferencias
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own bia prefs" ON public.bia_preferencias
  FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.tg_bia_prefs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_bia_preferencias_updated_at
  BEFORE UPDATE ON public.bia_preferencias
  FOR EACH ROW EXECUTE FUNCTION public.tg_bia_prefs_updated_at();

CREATE INDEX idx_bia_prefs_user ON public.bia_preferencias(user_id);