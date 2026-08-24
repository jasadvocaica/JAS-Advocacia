
ALTER TABLE public.cliente_portal_processos
  ADD COLUMN IF NOT EXISTS tipo_beneficio text,
  ADD COLUMN IF NOT EXISTS motivo_negativa text,
  ADD COLUMN IF NOT EXISTS cid_codigo text,
  ADD COLUMN IF NOT EXISTS cid_descricao text,
  ADD COLUMN IF NOT EXISTS fase_atual_explicacao text,
  ADD COLUMN IF NOT EXISTS proximas_etapas text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS via_processual text,
  ADD COLUMN IF NOT EXISTS ficha_atualizada_em timestamptz;
