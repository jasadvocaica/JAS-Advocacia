-- Adiciona colunas faltantes
ALTER TABLE public.notificacoes
  ADD COLUMN IF NOT EXISTS item_id UUID REFERENCES public.controladoria_itens(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS dia_chave DATE NOT NULL DEFAULT CURRENT_DATE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_dedup
  ON public.notificacoes(user_id, item_id, tipo, dia_chave)
  WHERE item_id IS NOT NULL;

ALTER TABLE public.notificacoes REPLICA IDENTITY FULL;

-- Função de trigger
CREATE OR REPLACE FUNCTION public.notif_controladoria_item()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.responsavel_id IS NOT NULL AND
     (TG_OP = 'INSERT' OR OLD.responsavel_id IS DISTINCT FROM NEW.responsavel_id) THEN
    INSERT INTO public.notificacoes (user_id, item_id, tipo, titulo, descricao, link)
    VALUES (
      NEW.responsavel_id,
      NEW.id,
      'atribuicao',
      'Item atribuído a você',
      NEW.titulo,
      '/controladoria?item=' || NEW.id
    )
    ON CONFLICT (user_id, item_id, tipo, dia_chave) DO NOTHING;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.responsavel_id IS NOT NULL
     AND NEW.data_vencimento IS NOT NULL
     AND NEW.data_vencimento::timestamptz <= now() + interval '48 hours'
     AND NEW.data_vencimento::timestamptz > now() THEN
    INSERT INTO public.notificacoes (user_id, item_id, tipo, titulo, descricao, link)
    VALUES (
      NEW.responsavel_id,
      NEW.id,
      'prazo_proximo',
      'Prazo nas próximas 48h',
      NEW.titulo || ' — vence ' || to_char(NEW.data_vencimento, 'DD/MM HH24:MI'),
      '/controladoria?item=' || NEW.id
    )
    ON CONFLICT (user_id, item_id, tipo, dia_chave) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_controladoria_item ON public.controladoria_itens;
CREATE TRIGGER trg_notif_controladoria_item
AFTER INSERT OR UPDATE OF responsavel_id ON public.controladoria_itens
FOR EACH ROW EXECUTE FUNCTION public.notif_controladoria_item();