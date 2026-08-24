ALTER TABLE public.andamentos DROP CONSTRAINT IF EXISTS andamentos_fonte_check;
ALTER TABLE public.andamentos ADD CONSTRAINT andamentos_fonte_check
  CHECK (fonte = ANY (ARRAY['manual'::text, 'cnj'::text, 'datajud'::text, 'pje_comunica'::text, 'documentos'::text, 'sistema'::text, 'inss_portal'::text, 'pdpj_pdf'::text]));