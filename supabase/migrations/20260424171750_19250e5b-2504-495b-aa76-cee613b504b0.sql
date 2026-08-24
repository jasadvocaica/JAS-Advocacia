-- Função dedicada para profiles (apenas verifica desativação do último gestor)
CREATE OR REPLACE FUNCTION public.trg_proteger_ultimo_gestor_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qtd INTEGER;
BEGIN
  IF OLD.ativo = true AND NEW.ativo = false THEN
    SELECT COUNT(*) INTO v_qtd
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.role = 'gestor' AND p.ativo = true AND p.id <> OLD.id;
    IF v_qtd = 0 AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = OLD.id AND role = 'gestor') THEN
      RAISE EXCEPTION 'Não é possível inativar o último gestor ativo do sistema.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Função dedicada para user_roles (apenas verifica remoção do papel gestor)
CREATE OR REPLACE FUNCTION public.trg_proteger_ultimo_gestor_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qtd INTEGER;
BEGIN
  IF OLD.role = 'gestor' THEN
    SELECT COUNT(*) INTO v_qtd
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.role = 'gestor' AND p.ativo = true AND ur.user_id <> OLD.user_id;
    IF v_qtd = 0 THEN
      RAISE EXCEPTION 'Não é possível remover o papel de gestor do último gestor ativo.';
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

-- Recria os triggers apontando para as novas funções
DROP TRIGGER IF EXISTS proteger_gestor_profile ON public.profiles;
CREATE TRIGGER proteger_gestor_profile
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_proteger_ultimo_gestor_profile();

DROP TRIGGER IF EXISTS proteger_gestor_role ON public.user_roles;
CREATE TRIGGER proteger_gestor_role
  BEFORE DELETE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_proteger_ultimo_gestor_role();