-- Novos tipos de evento
ALTER TYPE public.tipo_item_controladoria ADD VALUE IF NOT EXISTS 'pericia';
ALTER TYPE public.tipo_item_controladoria ADD VALUE IF NOT EXISTS 'conciliacao';

-- Campos de preparação e relatório pós-evento
ALTER TABLE public.controladoria_itens
  ADD COLUMN IF NOT EXISTS o_que_levar text,
  ADD COLUMN IF NOT EXISTS orientacoes text,
  ADD COLUMN IF NOT EXISTS cliente_confirmado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS proximo_passo text,
  ADD COLUMN IF NOT EXISTS documentos_entregues text,
  ADD COLUMN IF NOT EXISTS documentos_recebidos text,
  ADD COLUMN IF NOT EXISTS alerta_3dias_enviado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS alerta_1dia_enviado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelado_motivo text;
