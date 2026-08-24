
-- Fix search_path
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NEW.atualizado_em = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.adicionar_dias_uteis(_data_inicio DATE, _dias INTEGER)
RETURNS DATE LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_data DATE := _data_inicio; v_count INTEGER := 0;
BEGIN
  WHILE v_count < _dias LOOP
    v_data := v_data + 1;
    IF EXTRACT(DOW FROM v_data) NOT IN (0,6) AND NOT EXISTS (SELECT 1 FROM public.feriados WHERE data = v_data) THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_data;
END; $$;

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES
  ('documentos','documentos',false),
  ('chat-anexos','chat-anexos',false),
  ('avatares','avatares',true),
  ('comprovantes','comprovantes',false)
ON CONFLICT (id) DO NOTHING;

-- Policies
CREATE POLICY "auth ve documentos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('documentos','chat-anexos','comprovantes') AND public.is_authenticated_active());

CREATE POLICY "auth upload documentos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('documentos','chat-anexos','comprovantes') AND public.is_authenticated_active());

CREATE POLICY "auth deleta proprios uploads"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('documentos','chat-anexos','comprovantes') AND owner = auth.uid());

CREATE POLICY "publico ve avatares"
  ON storage.objects FOR SELECT TO public USING (bucket_id = 'avatares');

CREATE POLICY "auth gerencia proprio avatar"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'avatares' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'avatares' AND owner = auth.uid());
