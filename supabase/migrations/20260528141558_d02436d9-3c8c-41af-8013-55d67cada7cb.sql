
-- Função: insere notificação de comentário; se já existe no dia (índice dedup), reabre como não lida
CREATE OR REPLACE FUNCTION public.notificar_comentario_controladoria(
  _user_id uuid,
  _item_id uuid,
  _titulo text,
  _descricao text,
  _link text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notificacoes (user_id, item_id, tipo, titulo, descricao, link, lida, criado_em, dia_chave)
  VALUES (_user_id, _item_id, 'controladoria_comentario', _titulo, _descricao, _link, false, now(), CURRENT_DATE)
  ON CONFLICT (user_id, item_id, tipo, dia_chave) WHERE item_id IS NOT NULL
  DO UPDATE SET
    lida = false,
    lida_em = NULL,
    titulo = EXCLUDED.titulo,
    descricao = EXCLUDED.descricao,
    link = EXCLUDED.link,
    criado_em = now();
END;
$$;

-- Trigger function: notifica o responsável quando há novo comentário
CREATE OR REPLACE FUNCTION public.trg_notificar_comentario_controladoria()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_autor_nome text;
  v_titulo text;
  v_descricao text;
  v_link text;
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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_comentario_controladoria ON public.controladoria_comentarios;
CREATE TRIGGER trg_notif_comentario_controladoria
AFTER INSERT ON public.controladoria_comentarios
FOR EACH ROW EXECUTE FUNCTION public.trg_notificar_comentario_controladoria();

-- RPC chamada pelo client para notificar menções @
CREATE OR REPLACE FUNCTION public.notificar_mencoes_controladoria(
  _item_id uuid,
  _user_ids uuid[]
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_autor_nome text;
  v_titulo text;
  v_link text;
  v_uid uuid;
BEGIN
  IF _user_ids IS NULL OR array_length(_user_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  SELECT id, titulo INTO v_item FROM public.controladoria_itens WHERE id = _item_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(nome, 'Alguém') INTO v_autor_nome
  FROM public.profiles WHERE id = auth.uid();

  v_titulo := COALESCE(v_autor_nome, 'Alguém') || ' marcou você em "' || COALESCE(v_item.titulo, 'item') || '"';
  v_link := '/controladoria?item=' || v_item.id::text;

  FOREACH v_uid IN ARRAY _user_ids LOOP
    IF v_uid IS NULL OR v_uid = auth.uid() THEN CONTINUE; END IF;
    PERFORM public.notificar_comentario_controladoria(
      v_uid, v_item.id, v_titulo, 'Você foi mencionado em um comentário.', v_link
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notificar_mencoes_controladoria(uuid, uuid[]) TO authenticated;
