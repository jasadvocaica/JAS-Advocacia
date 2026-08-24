-- Tabela de campanhas
CREATE TABLE IF NOT EXISTS public.mkt_campanhas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  canal TEXT NOT NULL CHECK (canal IN ('meta_ads','google_ads','tiktok_ads','outro_pago')),
  objetivo TEXT CHECK (objetivo IN ('leads','trafego','alcance','conversao','engajamento')),
  area_direito TEXT,
  data_inicio DATE NOT NULL,
  data_fim DATE,
  orcamento_total NUMERIC(10,2) DEFAULT 0,
  gasto_realizado NUMERIC(10,2) DEFAULT 0,
  impressoes INTEGER DEFAULT 0,
  cliques INTEGER DEFAULT 0,
  leads_gerados INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'planejada' CHECK (status IN ('planejada','ativa','pausada','encerrada')),
  observacoes TEXT,
  criado_por UUID,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mkt_campanhas_status ON public.mkt_campanhas(status);
CREATE INDEX IF NOT EXISTS idx_mkt_campanhas_canal ON public.mkt_campanhas(canal);
CREATE INDEX IF NOT EXISTS idx_mkt_campanhas_periodo ON public.mkt_campanhas(data_inicio, data_fim);

-- Tabela de leads
CREATE TABLE IF NOT EXISTS public.mkt_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  whatsapp TEXT,
  email TEXT,
  cidade TEXT,
  estado TEXT,
  canal TEXT NOT NULL CHECK (canal IN ('meta_ads','instagram_organico','tiktok','indicacao_parceiro','site_seo','whatsapp_direto','outro')),
  campanha_id UUID REFERENCES public.mkt_campanhas(id) ON DELETE SET NULL,
  parceiro_id UUID REFERENCES public.parceiros(id) ON DELETE SET NULL,
  area_direito TEXT CHECK (area_direito IN ('previdenciario','familia','civil','trabalhista','tributario','consumidor','saude','outro')),
  descricao_interesse TEXT,
  status TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo','em_atendimento','proposta_enviada','convertido','perdido')),
  motivo_perda TEXT CHECK (motivo_perda IN ('valor','concorrente','caso_inviavel','sem_retorno','nao_urgente','outro')),
  observacao_perda TEXT,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  data_conversao DATE,
  valor_contrato NUMERIC(12,2),
  responsavel_id UUID,
  registrado_por UUID,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mkt_leads_status ON public.mkt_leads(status);
CREATE INDEX IF NOT EXISTS idx_mkt_leads_canal ON public.mkt_leads(canal);
CREATE INDEX IF NOT EXISTS idx_mkt_leads_campanha ON public.mkt_leads(campanha_id);
CREATE INDEX IF NOT EXISTS idx_mkt_leads_parceiro ON public.mkt_leads(parceiro_id);
CREATE INDEX IF NOT EXISTS idx_mkt_leads_periodo ON public.mkt_leads(criado_em DESC);

-- Tabela de conteúdo (calendário editorial)
CREATE TABLE IF NOT EXISTS public.mkt_conteudo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  canal TEXT NOT NULL CHECK (canal IN ('instagram','tiktok','facebook','site_blog','youtube','linkedin')),
  formato TEXT CHECK (formato IN ('reels','carrossel','feed_foto','story','video_longo','blog_post','live')),
  pauta TEXT,
  legenda TEXT,
  hashtags TEXT,
  link_material TEXT,
  data_planejada DATE NOT NULL,
  data_publicacao DATE,
  status TEXT NOT NULL DEFAULT 'ideia' CHECK (status IN ('ideia','planejado','producao','revisao','aprovado','publicado','cancelado')),
  alcance INTEGER,
  curtidas INTEGER,
  comentarios INTEGER,
  compartilhamentos INTEGER,
  salvamentos INTEGER,
  leads_gerados INTEGER DEFAULT 0,
  area_direito TEXT,
  responsavel_id UUID,
  criado_por UUID,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mkt_conteudo_data ON public.mkt_conteudo(data_planejada);
CREATE INDEX IF NOT EXISTS idx_mkt_conteudo_canal ON public.mkt_conteudo(canal, status);
CREATE INDEX IF NOT EXISTS idx_mkt_conteudo_status ON public.mkt_conteudo(status);

-- Vincular lançamentos de marketing existentes a campanhas
ALTER TABLE public.financeiro_marketing_lancamentos
  ADD COLUMN IF NOT EXISTS campanha_id UUID REFERENCES public.mkt_campanhas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_fml_campanha ON public.financeiro_marketing_lancamentos(campanha_id);

-- Origem em clientes
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS como_chegou TEXT,
  ADD COLUMN IF NOT EXISTS campanha_origem UUID REFERENCES public.mkt_campanhas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parceiro_indicacao UUID REFERENCES public.parceiros(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lead_origem_id UUID REFERENCES public.mkt_leads(id) ON DELETE SET NULL;

-- Triggers de updated_at
DROP TRIGGER IF EXISTS trg_set_updated_at_mkt_campanhas ON public.mkt_campanhas;
CREATE TRIGGER trg_set_updated_at_mkt_campanhas BEFORE UPDATE ON public.mkt_campanhas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_mkt_leads ON public.mkt_leads;
CREATE TRIGGER trg_set_updated_at_mkt_leads BEFORE UPDATE ON public.mkt_leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_mkt_conteudo ON public.mkt_conteudo;
CREATE TRIGGER trg_set_updated_at_mkt_conteudo BEFORE UPDATE ON public.mkt_conteudo
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.mkt_campanhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_conteudo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mkt_camp_select ON public.mkt_campanhas;
CREATE POLICY mkt_camp_select ON public.mkt_campanhas FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'marketing'::public.modulo, 'visualizar'::public.acao_permissao));
DROP POLICY IF EXISTS mkt_camp_insert ON public.mkt_campanhas;
CREATE POLICY mkt_camp_insert ON public.mkt_campanhas FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'marketing'::public.modulo, 'criar'::public.acao_permissao));
DROP POLICY IF EXISTS mkt_camp_update ON public.mkt_campanhas;
CREATE POLICY mkt_camp_update ON public.mkt_campanhas FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'marketing'::public.modulo, 'editar'::public.acao_permissao));
DROP POLICY IF EXISTS mkt_camp_delete ON public.mkt_campanhas;
CREATE POLICY mkt_camp_delete ON public.mkt_campanhas FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'marketing'::public.modulo, 'excluir'::public.acao_permissao));

DROP POLICY IF EXISTS mkt_leads_select ON public.mkt_leads;
CREATE POLICY mkt_leads_select ON public.mkt_leads FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'marketing'::public.modulo, 'visualizar'::public.acao_permissao));
DROP POLICY IF EXISTS mkt_leads_insert ON public.mkt_leads;
CREATE POLICY mkt_leads_insert ON public.mkt_leads FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'marketing'::public.modulo, 'criar'::public.acao_permissao));
DROP POLICY IF EXISTS mkt_leads_update ON public.mkt_leads;
CREATE POLICY mkt_leads_update ON public.mkt_leads FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'marketing'::public.modulo, 'editar'::public.acao_permissao));
DROP POLICY IF EXISTS mkt_leads_delete ON public.mkt_leads;
CREATE POLICY mkt_leads_delete ON public.mkt_leads FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'marketing'::public.modulo, 'excluir'::public.acao_permissao));

DROP POLICY IF EXISTS mkt_conteudo_select ON public.mkt_conteudo;
CREATE POLICY mkt_conteudo_select ON public.mkt_conteudo FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'marketing'::public.modulo, 'visualizar'::public.acao_permissao));
DROP POLICY IF EXISTS mkt_conteudo_insert ON public.mkt_conteudo;
CREATE POLICY mkt_conteudo_insert ON public.mkt_conteudo FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'marketing'::public.modulo, 'criar'::public.acao_permissao));
DROP POLICY IF EXISTS mkt_conteudo_update ON public.mkt_conteudo;
CREATE POLICY mkt_conteudo_update ON public.mkt_conteudo FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'marketing'::public.modulo, 'editar'::public.acao_permissao));
DROP POLICY IF EXISTS mkt_conteudo_delete ON public.mkt_conteudo;
CREATE POLICY mkt_conteudo_delete ON public.mkt_conteudo FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'marketing'::public.modulo, 'excluir'::public.acao_permissao));

-- Função para converter lead em cliente
CREATE OR REPLACE FUNCTION public.converter_lead_em_cliente(
  _lead_id UUID,
  _valor_contrato NUMERIC DEFAULT NULL,
  _advogado_responsavel UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_lead RECORD;
  v_cliente_id UUID;
  v_canal_label TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sessão inválida'; END IF;
  IF NOT public.has_permission(v_uid, 'marketing'::public.modulo, 'editar'::public.acao_permissao) THEN
    RAISE EXCEPTION 'Sem permissão para converter lead';
  END IF;

  SELECT * INTO v_lead FROM public.mkt_leads WHERE id = _lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead não encontrado'; END IF;
  IF v_lead.status = 'convertido' THEN RAISE EXCEPTION 'Lead já foi convertido'; END IF;

  v_canal_label := CASE v_lead.canal
    WHEN 'meta_ads' THEN 'Meta Ads'
    WHEN 'instagram_organico' THEN 'Instagram orgânico'
    WHEN 'tiktok' THEN 'TikTok'
    WHEN 'indicacao_parceiro' THEN 'Indicação de parceiro'
    WHEN 'site_seo' THEN 'Site / SEO'
    WHEN 'whatsapp_direto' THEN 'WhatsApp direto'
    ELSE 'Outro'
  END;

  INSERT INTO public.clientes (
    nome, whatsapp, email, cidade, estado,
    como_chegou, campanha_origem, parceiro_indicacao, lead_origem_id,
    observacoes, status, ativo, criado_por, advogado_responsavel_id, origem
  ) VALUES (
    v_lead.nome, v_lead.whatsapp, v_lead.email, v_lead.cidade, v_lead.estado,
    v_canal_label, v_lead.campanha_id, v_lead.parceiro_id, v_lead.id,
    v_lead.descricao_interesse, 'ativo', true, v_uid,
    COALESCE(_advogado_responsavel, v_lead.responsavel_id),
    'marketing'
  ) RETURNING id INTO v_cliente_id;

  UPDATE public.mkt_leads SET
    status = 'convertido',
    cliente_id = v_cliente_id,
    data_conversao = CURRENT_DATE,
    valor_contrato = _valor_contrato,
    atualizado_em = now()
  WHERE id = _lead_id;

  RETURN v_cliente_id;
END;
$$;

-- Trigger para manter contador leads_gerados em campanhas
CREATE OR REPLACE FUNCTION public.trg_mkt_lead_atualiza_campanha()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.campanha_id IS NOT NULL THEN
    UPDATE public.mkt_campanhas SET leads_gerados = COALESCE(leads_gerados,0) + 1 WHERE id = NEW.campanha_id;
  ELSIF TG_OP = 'DELETE' AND OLD.campanha_id IS NOT NULL THEN
    UPDATE public.mkt_campanhas SET leads_gerados = GREATEST(COALESCE(leads_gerados,0) - 1, 0) WHERE id = OLD.campanha_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.campanha_id IS DISTINCT FROM NEW.campanha_id THEN
    IF OLD.campanha_id IS NOT NULL THEN
      UPDATE public.mkt_campanhas SET leads_gerados = GREATEST(COALESCE(leads_gerados,0) - 1, 0) WHERE id = OLD.campanha_id;
    END IF;
    IF NEW.campanha_id IS NOT NULL THEN
      UPDATE public.mkt_campanhas SET leads_gerados = COALESCE(leads_gerados,0) + 1 WHERE id = NEW.campanha_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_mkt_lead_camp ON public.mkt_leads;
CREATE TRIGGER trg_mkt_lead_camp
AFTER INSERT OR UPDATE OR DELETE ON public.mkt_leads
FOR EACH ROW EXECUTE FUNCTION public.trg_mkt_lead_atualiza_campanha();