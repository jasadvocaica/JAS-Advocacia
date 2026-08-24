-- 1. Flags de compartilhamento
ALTER TABLE public.documentos
  ADD COLUMN IF NOT EXISTS compartilhar_com_parceiro boolean NOT NULL DEFAULT false;

ALTER TABLE public.controladoria_itens
  ADD COLUMN IF NOT EXISTS visivel_parceiro boolean NOT NULL DEFAULT false;

-- 2. Tabela de log de acesso a documentos pelo parceiro
CREATE TABLE IF NOT EXISTS public.parceiro_documento_acesso_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parceiro_id uuid NOT NULL REFERENCES public.parceiros(id) ON DELETE CASCADE,
  documento_id uuid NOT NULL REFERENCES public.documentos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  acao text NOT NULL DEFAULT 'visualizou',
  user_agent text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parc_doc_log_parceiro
  ON public.parceiro_documento_acesso_log(parceiro_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_parc_doc_log_documento
  ON public.parceiro_documento_acesso_log(documento_id);

ALTER TABLE public.parceiro_documento_acesso_log ENABLE ROW LEVEL SECURITY;

-- Parceiro insere registro do próprio acesso
CREATE POLICY "parceiro registra proprio acesso"
  ON public.parceiro_documento_acesso_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND parceiro_id = public.parceiro_id_do_usuario(auth.uid())
  );

-- Parceiro vê seus próprios logs (transparência)
CREATE POLICY "parceiro ve proprio log"
  ON public.parceiro_documento_acesso_log
  FOR SELECT
  TO authenticated
  USING (parceiro_id = public.parceiro_id_do_usuario(auth.uid()));

-- Equipe com permissão em parceiros vê tudo
CREATE POLICY "equipe ve log de acesso parceiros"
  ON public.parceiro_documento_acesso_log
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'parceiros'::modulo, 'visualizar'::acao_permissao));

-- 3. Atualiza policy do parceiro em documentos para exigir flag
DROP POLICY IF EXISTS "parceiro ve docs de seus processos" ON public.documentos;
CREATE POLICY "parceiro ve docs compartilhados de seus processos"
  ON public.documentos
  FOR SELECT
  TO authenticated
  USING (
    compartilhar_com_parceiro = true
    AND processo_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.processos p
      WHERE p.id = documentos.processo_id
        AND p.parceiro_id = public.parceiro_id_do_usuario(auth.uid())
    )
  );

-- 4. Atualiza policy do parceiro em controladoria_itens para exigir flag
DROP POLICY IF EXISTS "parceiro ve itens de seus processos" ON public.controladoria_itens;
CREATE POLICY "parceiro ve itens visiveis de seus processos"
  ON public.controladoria_itens
  FOR SELECT
  TO authenticated
  USING (
    visivel_parceiro = true
    AND processo_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.processos p
      WHERE p.id = controladoria_itens.processo_id
        AND p.parceiro_id = public.parceiro_id_do_usuario(auth.uid())
    )
  );

-- 5. Permite parceiro marcar tarefa dele como concluída (UPDATE restrito)
DROP POLICY IF EXISTS "parceiro conclui tarefa propria" ON public.controladoria_itens;
CREATE POLICY "parceiro conclui tarefa propria"
  ON public.controladoria_itens
  FOR UPDATE
  TO authenticated
  USING (
    visivel_parceiro = true
    AND processo_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.processos p
      WHERE p.id = controladoria_itens.processo_id
        AND p.parceiro_id = public.parceiro_id_do_usuario(auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.controladoria_responsaveis cr
      WHERE cr.item_id = controladoria_itens.id
        AND cr.user_id = auth.uid()
    )
  )
  WITH CHECK (
    visivel_parceiro = true
    AND processo_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.processos p
      WHERE p.id = controladoria_itens.processo_id
        AND p.parceiro_id = public.parceiro_id_do_usuario(auth.uid())
    )
  );