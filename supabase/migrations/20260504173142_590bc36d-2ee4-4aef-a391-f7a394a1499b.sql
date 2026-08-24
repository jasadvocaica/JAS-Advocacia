-- 1. Atualiza trigger para ler o tipo do metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_nome TEXT;
  v_is_gestor BOOLEAN;
  v_tipo_meta TEXT;
  v_tipo_portal TEXT;
BEGIN
  v_nome := COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
  v_tipo_meta := COALESCE(NEW.raw_user_meta_data->>'tipo', '');

  -- Mapeia o tipo de portal a partir do metadata
  v_tipo_portal := CASE
    WHEN v_tipo_meta IN ('cliente_portal','cliente') THEN 'cliente'
    WHEN v_tipo_meta IN ('parceiro_portal','parceiro') THEN 'parceiro'
    ELSE 'interno'
  END;

  -- Só vira gestor se for o e-mail fundador E for usuário interno
  v_is_gestor := (NEW.email = 'ju.contatoaraujo@gmail.com') AND v_tipo_portal = 'interno';

  INSERT INTO public.profiles (id, nome, email, ativo, primeiro_acesso, tipo_portal)
  VALUES (
    NEW.id,
    v_nome,
    NEW.email,
    CASE WHEN v_tipo_portal = 'interno' THEN v_is_gestor ELSE TRUE END,
    CASE WHEN v_tipo_portal = 'interno' THEN NOT v_is_gestor ELSE FALSE END,
    v_tipo_portal
  );

  IF v_is_gestor THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'gestor');
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Corrige perfis existentes que são clientes do portal
UPDATE public.profiles p
SET tipo_portal = 'cliente'
FROM public.cliente_usuarios cu
WHERE cu.user_id = p.id
  AND p.tipo_portal <> 'cliente';

-- 3. Corrige perfis existentes que são parceiros do portal (se a tabela existir)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='parceiro_usuarios') THEN
    EXECUTE $upd$
      UPDATE public.profiles p
      SET tipo_portal = 'parceiro'
      FROM public.parceiro_usuarios pu
      WHERE pu.user_id = p.id
        AND p.tipo_portal <> 'parceiro'
    $upd$;
  END IF;
END $$;

-- 4. Remove papéis internos atribuídos por engano a usuários do portal
DELETE FROM public.user_roles ur
USING public.profiles p
WHERE ur.user_id = p.id
  AND p.tipo_portal IN ('cliente','parceiro');