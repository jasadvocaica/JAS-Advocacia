CREATE OR REPLACE FUNCTION public.notif_controladoria_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    ON CONFLICT (user_id, item_id, tipo, dia_chave) WHERE item_id IS NOT NULL DO NOTHING;
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
    ON CONFLICT (user_id, item_id, tipo, dia_chave) WHERE item_id IS NOT NULL DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;