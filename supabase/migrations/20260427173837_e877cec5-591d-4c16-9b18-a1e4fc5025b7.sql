ALTER TABLE public.cliente_interacoes
  DROP CONSTRAINT IF EXISTS cliente_interacoes_tipo_check;

ALTER TABLE public.cliente_interacoes
  ADD CONSTRAINT cliente_interacoes_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'atendimento'::text, 'ligacao'::text, 'email'::text, 'reuniao'::text,
    'whatsapp'::text, 'telefone'::text, 'presencial'::text,
    'sistema'::text, 'outro'::text
  ]));