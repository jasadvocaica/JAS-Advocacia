-- Tabela de auditoria de ações do parceiro no portal
CREATE TABLE public.parceiro_acesso_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parceiro_id UUID NOT NULL REFERENCES public.parceiros(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  acao TEXT NOT NULL,
  -- ex: 'acessou_processo', 'visualizou_documento', 'baixou_documento',
  --     'enviou_mensagem', 'concluiu_tarefa', 'upload_documento',
  --     'acessou_dashboard', 'acessou_financeiro'
  recurso_tipo TEXT,
  -- ex: 'processo', 'documento', 'tarefa', 'mensagem', 'pagina'
  recurso_id UUID,
  descricao TEXT,
  user_agent TEXT,
  ip_aprox TEXT,
  contexto JSONB,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_parceiro_acesso_log_parceiro ON public.parceiro_acesso_log(parceiro_id, criado_em DESC);
CREATE INDEX idx_parceiro_acesso_log_recurso ON public.parceiro_acesso_log(recurso_tipo, recurso_id);
CREATE INDEX idx_parceiro_acesso_log_acao ON public.parceiro_acesso_log(acao, criado_em DESC);

ALTER TABLE public.parceiro_acesso_log ENABLE ROW LEVEL SECURITY;

-- Gestor vê tudo
CREATE POLICY "Gestores veem todo o log de parceiros"
ON public.parceiro_acesso_log
FOR SELECT
TO authenticated
USING (public.is_gestor(auth.uid()));

-- Parceiro vê os próprios registros (transparência: ele sabe o que está sendo logado)
CREATE POLICY "Parceiro vê o próprio log"
ON public.parceiro_acesso_log
FOR SELECT
TO authenticated
USING (
  parceiro_id = public.parceiro_id_do_usuario(auth.uid())
);

-- Insert: qualquer usuário autenticado pode registrar uma ação como sua própria
-- (parceiro_id deve bater com o vínculo do usuário OU ser registrado por gestor)
CREATE POLICY "Usuário autenticado registra a própria ação"
ON public.parceiro_acesso_log
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    public.is_gestor(auth.uid())
    OR parceiro_id = public.parceiro_id_do_usuario(auth.uid())
  )
);

-- Sem UPDATE / DELETE (log imutável) — nenhuma policy criada para essas operações.
COMMENT ON TABLE public.parceiro_acesso_log IS
  'Log imutável de ações do parceiro no portal (auditoria de acessos, downloads e interações).';
