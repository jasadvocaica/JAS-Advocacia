-- Tokens de acesso para o MCP Server (usados pelo Claude.ai)
CREATE TABLE public.mcp_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  ultimo_uso_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz
);

ALTER TABLE public.mcp_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestores gerenciam tokens MCP"
  ON public.mcp_tokens
  FOR ALL
  TO authenticated
  USING (public.is_gestor(auth.uid()))
  WITH CHECK (public.is_gestor(auth.uid()));

CREATE INDEX idx_mcp_tokens_hash ON public.mcp_tokens(token_hash) WHERE ativo = true;

-- Log de chamadas MCP
CREATE TABLE public.mcp_chamadas_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid REFERENCES public.mcp_tokens(id) ON DELETE SET NULL,
  ferramenta text NOT NULL,
  args jsonb,
  sucesso boolean NOT NULL DEFAULT true,
  erro text,
  duracao_ms integer,
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mcp_chamadas_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestores leem log MCP"
  ON public.mcp_chamadas_log
  FOR SELECT
  TO authenticated
  USING (public.is_gestor(auth.uid()));

CREATE INDEX idx_mcp_log_data ON public.mcp_chamadas_log(criado_em DESC);