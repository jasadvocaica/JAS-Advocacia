
-- ============ TABELA OAB ============
CREATE TABLE public.ferramentas_oab_tabelas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estado TEXT NOT NULL,
  estado_nome TEXT NOT NULL,
  oab_seccional TEXT NOT NULL,
  ano_vigencia INTEGER NOT NULL,
  arquivo_url TEXT,
  tabela_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  carregado_por UUID,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(estado, ano_vigencia)
);

ALTER TABLE public.ferramentas_oab_tabelas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados ativos veem tabelas OAB ativas"
  ON public.ferramentas_oab_tabelas FOR SELECT
  TO authenticated
  USING (public.is_authenticated_active() AND ativo = true);

CREATE POLICY "Gestor vê todas tabelas OAB"
  ON public.ferramentas_oab_tabelas FOR SELECT
  TO authenticated
  USING (public.is_gestor(auth.uid()));

CREATE POLICY "Gestor insere tabelas OAB"
  ON public.ferramentas_oab_tabelas FOR INSERT
  TO authenticated
  WITH CHECK (public.is_gestor(auth.uid()));

CREATE POLICY "Gestor atualiza tabelas OAB"
  ON public.ferramentas_oab_tabelas FOR UPDATE
  TO authenticated
  USING (public.is_gestor(auth.uid()));

CREATE POLICY "Gestor deleta tabelas OAB"
  ON public.ferramentas_oab_tabelas FOR DELETE
  TO authenticated
  USING (public.is_gestor(auth.uid()));

CREATE TRIGGER trg_ferramentas_oab_set_updated
  BEFORE UPDATE ON public.ferramentas_oab_tabelas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ CALCULOS SALVOS ============
CREATE TABLE public.ferramentas_calculos_salvos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ferramenta TEXT NOT NULL DEFAULT 'calculadora_honorarios',
  titulo TEXT NOT NULL,
  processo_id UUID REFERENCES public.processos(id) ON DELETE SET NULL,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  estado TEXT,
  ano_tabela INTEGER,
  tipo_honorario TEXT,
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  resultado JSONB NOT NULL DEFAULT '{}'::jsonb,
  proposta_url TEXT,
  criado_por UUID,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ferr_calc_processo ON public.ferramentas_calculos_salvos(processo_id);
CREATE INDEX idx_ferr_calc_cliente ON public.ferramentas_calculos_salvos(cliente_id);
CREATE INDEX idx_ferr_calc_user ON public.ferramentas_calculos_salvos(criado_por);

ALTER TABLE public.ferramentas_calculos_salvos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário vê seus cálculos"
  ON public.ferramentas_calculos_salvos FOR SELECT
  TO authenticated
  USING (criado_por = auth.uid() OR public.is_gestor(auth.uid()));

CREATE POLICY "Usuário cria seus cálculos"
  ON public.ferramentas_calculos_salvos FOR INSERT
  TO authenticated
  WITH CHECK (criado_por = auth.uid() AND public.is_authenticated_active());

CREATE POLICY "Usuário atualiza seus cálculos"
  ON public.ferramentas_calculos_salvos FOR UPDATE
  TO authenticated
  USING (criado_por = auth.uid() OR public.is_gestor(auth.uid()));

CREATE POLICY "Usuário deleta seus cálculos"
  ON public.ferramentas_calculos_salvos FOR DELETE
  TO authenticated
  USING (criado_por = auth.uid() OR public.is_gestor(auth.uid()));

-- ============ CONFIG GLOBAL ============
CREATE TABLE public.ferramentas_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chave TEXT UNIQUE NOT NULL,
  valor TEXT,
  descricao TEXT,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ferramentas_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem config"
  ON public.ferramentas_config FOR SELECT
  TO authenticated
  USING (public.is_authenticated_active());

CREATE POLICY "Gestor escreve config"
  ON public.ferramentas_config FOR ALL
  TO authenticated
  USING (public.is_gestor(auth.uid()))
  WITH CHECK (public.is_gestor(auth.uid()));

-- Trigger updated_at em config (usa coluna atualizado_em)
CREATE TRIGGER trg_ferramentas_config_set_updated
  BEFORE UPDATE ON public.ferramentas_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ STORAGE BUCKET ============
INSERT INTO storage.buckets (id, name, public)
VALUES ('ferramentas-tabelas', 'ferramentas-tabelas', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Autenticados leem tabelas OAB no storage"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'ferramentas-tabelas' AND public.is_authenticated_active());

CREATE POLICY "Gestor faz upload em tabelas OAB"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'ferramentas-tabelas' AND public.is_gestor(auth.uid()));

CREATE POLICY "Gestor atualiza arquivos de tabelas OAB"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'ferramentas-tabelas' AND public.is_gestor(auth.uid()));

CREATE POLICY "Gestor remove arquivos de tabelas OAB"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'ferramentas-tabelas' AND public.is_gestor(auth.uid()));

-- ============ SEEDS ============
INSERT INTO public.ferramentas_config (chave, valor, descricao) VALUES
  ('salario_minimo_atual', '1518.00', 'Salário mínimo vigente — atualizar manualmente em janeiro'),
  ('ufmt_valor', '1412.63', 'UFMT — Unidade Fiscal de Mato Grosso vigente'),
  ('teto_inss', '7786.02', 'Teto do INSS vigente'),
  ('indice_correcao_padrao', 'IPCA-E', 'Índice padrão para correção monetária')
ON CONFLICT (chave) DO NOTHING;

INSERT INTO public.ferramentas_oab_tabelas
  (estado, estado_nome, oab_seccional, ano_vigencia, tabela_json, observacoes)
VALUES (
  'MT', 'Mato Grosso', 'OAB/MT', 2025,
  '[
    {"categoria":"Causas Previdenciárias","itens":[
      {"descricao":"BPC/LOAS — requerimento administrativo","tipo":"fixo","valor_min":1500,"valor_max":3000,"unidade":"por processo"},
      {"descricao":"BPC/LOAS — ação judicial","tipo":"percentual_ou_fixo","valor_min":2400,"valor_max":9600,"percentual_min":10,"percentual_max":30,"base_calculo":"valor_causa","unidade":"o que for maior"},
      {"descricao":"Auxílio por incapacidade — ação judicial","tipo":"percentual","percentual_min":10,"percentual_max":30,"base_calculo":"valor_causa"},
      {"descricao":"Aposentadoria — ação judicial","tipo":"percentual","percentual_min":10,"percentual_max":30,"base_calculo":"valor_causa"},
      {"descricao":"Revisão de benefício","tipo":"percentual","percentual_min":15,"percentual_max":30,"base_calculo":"valor_do_reajuste"}
    ]},
    {"categoria":"Direito de Família","itens":[
      {"descricao":"Divórcio consensual","tipo":"fixo","valor_min":2000,"valor_max":6000},
      {"descricao":"Divórcio litigioso","tipo":"fixo","valor_min":4000,"valor_max":15000},
      {"descricao":"Guarda e alimentos","tipo":"percentual","percentual_min":15,"percentual_max":30,"base_calculo":"valor_causa"},
      {"descricao":"Inventário","tipo":"percentual","percentual_min":6,"percentual_max":10,"base_calculo":"valor_dos_bens"}
    ]},
    {"categoria":"Causas Cíveis","itens":[
      {"descricao":"Ação de indenização","tipo":"percentual","percentual_min":15,"percentual_max":30,"base_calculo":"valor_da_indenizacao"},
      {"descricao":"Ação de cobrança","tipo":"percentual","percentual_min":10,"percentual_max":20,"base_calculo":"valor_cobrado"},
      {"descricao":"Contratos em geral","tipo":"percentual","percentual_min":10,"percentual_max":20,"base_calculo":"valor_do_contrato"}
    ]},
    {"categoria":"Consultoria","itens":[
      {"descricao":"Consulta verbal ou escrita","tipo":"fixo","valor_min":300,"valor_max":800,"unidade":"por consulta"},
      {"descricao":"Parecer jurídico simples","tipo":"fixo","valor_min":1000,"valor_max":3000},
      {"descricao":"Assessoria jurídica mensal","tipo":"fixo","valor_min":2000,"valor_max":8000,"unidade":"por mês"}
    ]}
  ]'::jsonb,
  'Tabela de exemplo — substituir pela versão oficial OAB/MT 2025'
)
ON CONFLICT (estado, ano_vigencia) DO NOTHING;
