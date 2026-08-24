
-- Enum para tipo de submissão
DO $$ BEGIN
  CREATE TYPE public.parceiro_submissao_tipo AS ENUM ('cliente','processo','andamento','documento');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.parceiro_submissao_status AS ENUM ('pendente','aprovado','rejeitado','cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.parceiro_submissoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parceiro_id UUID NOT NULL REFERENCES public.parceiros(id) ON DELETE CASCADE,
  tipo public.parceiro_submissao_tipo NOT NULL,
  status public.parceiro_submissao_status NOT NULL DEFAULT 'pendente',
  titulo TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processo_id UUID REFERENCES public.processos(id) ON DELETE SET NULL,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  registro_criado_id UUID,
  motivo_rejeicao TEXT,
  observacoes_parceiro TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  revisado_em TIMESTAMPTZ,
  revisado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_parc_subm_parceiro ON public.parceiro_submissoes(parceiro_id);
CREATE INDEX IF NOT EXISTS idx_parc_subm_status ON public.parceiro_submissoes(status);
CREATE INDEX IF NOT EXISTS idx_parc_subm_tipo ON public.parceiro_submissoes(tipo);
CREATE INDEX IF NOT EXISTS idx_parc_subm_criado ON public.parceiro_submissoes(criado_em DESC);

CREATE TRIGGER trg_parc_subm_updated
  BEFORE UPDATE ON public.parceiro_submissoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.parceiro_submissoes ENABLE ROW LEVEL SECURITY;

-- Parceiro: vê e cria as próprias submissões
CREATE POLICY "Parceiro vê próprias submissões"
  ON public.parceiro_submissoes FOR SELECT TO authenticated
  USING (parceiro_id = public.parceiro_id_do_usuario(auth.uid()));

CREATE POLICY "Parceiro cria próprias submissões"
  ON public.parceiro_submissoes FOR INSERT TO authenticated
  WITH CHECK (
    parceiro_id = public.parceiro_id_do_usuario(auth.uid())
    AND status = 'pendente'
  );

-- Parceiro pode cancelar a própria enquanto pendente
CREATE POLICY "Parceiro cancela própria pendente"
  ON public.parceiro_submissoes FOR UPDATE TO authenticated
  USING (parceiro_id = public.parceiro_id_do_usuario(auth.uid()) AND status = 'pendente')
  WITH CHECK (parceiro_id = public.parceiro_id_do_usuario(auth.uid()) AND status IN ('pendente','cancelado'));

-- Equipe interna: vê tudo
CREATE POLICY "Equipe vê todas submissões"
  ON public.parceiro_submissoes FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'parceiros'::public.modulo, 'visualizar'::public.acao_permissao));

-- Equipe interna: aprova/rejeita
CREATE POLICY "Equipe revisa submissões"
  ON public.parceiro_submissoes FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'parceiros'::public.modulo, 'editar'::public.acao_permissao))
  WITH CHECK (public.has_permission(auth.uid(), 'parceiros'::public.modulo, 'editar'::public.acao_permissao));

-- Notifica parceiro quando submissão é revisada
CREATE OR REPLACE FUNCTION public.trg_parc_subm_notificar_revisao()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF OLD.status = 'pendente' AND NEW.status IN ('aprovado','rejeitado') THEN
    SELECT u.id INTO v_user_id
    FROM auth.users u
    JOIN public.parceiros p ON lower(p.email) = lower(u.email)
    WHERE p.id = NEW.parceiro_id LIMIT 1;

    IF v_user_id IS NOT NULL THEN
      INSERT INTO public.notificacoes (user_id, tipo, titulo, descricao, link)
      VALUES (
        v_user_id,
        CASE WHEN NEW.status = 'aprovado' THEN 'submissao_aprovada' ELSE 'submissao_rejeitada' END,
        CASE WHEN NEW.status = 'aprovado'
             THEN 'Sua indicação foi aprovada'
             ELSE 'Sua indicação foi rejeitada' END,
        NEW.titulo || COALESCE(' — ' || NEW.motivo_rejeicao, ''),
        '/portal-parceiro/indicacoes'
      );
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_parc_subm_notif
  AFTER UPDATE ON public.parceiro_submissoes
  FOR EACH ROW EXECUTE FUNCTION public.trg_parc_subm_notificar_revisao();
