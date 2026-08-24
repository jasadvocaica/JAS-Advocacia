CREATE OR REPLACE FUNCTION public.trg_notificar_comentario_controladoria()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item RECORD;
  v_autor_nome text;
  v_titulo text;
  v_descricao text;
  v_link text;
  v_uid uuid;
BEGIN
  IF NEW.item_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id, titulo, responsavel_id, criado_por
    INTO v_item
  FROM public.controladoria_itens
  WHERE id = NEW.item_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(nome, 'Alguém') INTO v_autor_nome
  FROM public.profiles WHERE id = NEW.user_id;

  v_titulo := COALESCE(v_autor_nome, 'Alguém') || ' comentou em "' || COALESCE(v_item.titulo, 'item') || '"';
  v_descricao := LEFT(regexp_replace(NEW.texto, '\s+', ' ', 'g'), 140);
  v_link := '/controladoria?item=' || v_item.id::text;

  -- Notifica responsável (se diferente do autor)
  IF v_item.responsavel_id IS NOT NULL AND v_item.responsavel_id <> NEW.user_id THEN
    PERFORM public.notificar_comentario_controladoria(
      v_item.responsavel_id, v_item.id, v_titulo, v_descricao, v_link
    );
  END IF;

  -- Notifica todos os gestores (exceto autor e responsável já notificado)
  FOR v_uid IN
    SELECT ur.user_id
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.role = 'gestor'
      AND p.ativo = true
      AND ur.user_id <> NEW.user_id
      AND (v_item.responsavel_id IS NULL OR ur.user_id <> v_item.responsavel_id)
  LOOP
    PERFORM public.notificar_comentario_controladoria(
      v_uid, v_item.id, v_titulo, v_descricao, v_link
    );
  END LOOP;

  RETURN NEW;
END;
$function$;