-- Rascunhos podem existir antes da definição da data editorial. Não altera datas existentes.
ALTER TABLE public.mkt_conteudo ALTER COLUMN data_planejada DROP NOT NULL;
