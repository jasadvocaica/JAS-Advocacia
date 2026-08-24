-- ============================================================
-- Catálogo Mestre — FASE DE HOMOLOGAÇÃO (não destrutiva)
-- Sugestões automáticas separadas da decisão homologada.
-- Nada aqui ativa serviço, POP, responsável, SLA ou integrações.
-- ============================================================

ALTER TABLE public.catalogo_servicos
  ADD COLUMN IF NOT EXISTS classificacao text NOT NULL DEFAULT 'a_confirmar',
  ADD COLUMN IF NOT EXISTS classificacao_sugerida text NOT NULL DEFAULT 'a_confirmar',
  ADD COLUMN IF NOT EXISTS classificacao_justificativa text,
  ADD COLUMN IF NOT EXISTS servico_principal_id uuid REFERENCES public.catalogo_servicos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS servico_principal_sugerido_id uuid REFERENCES public.catalogo_servicos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS servico_principal_sugerido_nome text,
  ADD COLUMN IF NOT EXISTS modalidade text,
  ADD COLUMN IF NOT EXISTS modalidade_sugerida text,
  ADD COLUMN IF NOT EXISTS area_sugerida text,
  ADD COLUMN IF NOT EXISTS area_sugerida_justificativa text,
  ADD COLUMN IF NOT EXISTS acao_recomendada text NOT NULL DEFAULT 'precisa_decisao',
  ADD COLUMN IF NOT EXISTS duplicidade_sugerida boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duplicidade_sugerida_justificativa text,
  ADD COLUMN IF NOT EXISTS sugestao_atualizada_em timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalogo_servicos_classificacao_chk') THEN
    ALTER TABLE public.catalogo_servicos ADD CONSTRAINT catalogo_servicos_classificacao_chk
      CHECK (classificacao IN ('servico_juridico','pop_auxiliar','modelo_documento','legado_descartar','a_confirmar'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalogo_servicos_classificacao_sug_chk') THEN
    ALTER TABLE public.catalogo_servicos ADD CONSTRAINT catalogo_servicos_classificacao_sug_chk
      CHECK (classificacao_sugerida IN ('servico_juridico','pop_auxiliar','modelo_documento','legado_descartar','a_confirmar'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalogo_servicos_acao_chk') THEN
    ALTER TABLE public.catalogo_servicos ADD CONSTRAINT catalogo_servicos_acao_chk
      CHECK (acao_recomendada IN ('manter_servico','transformar_modalidade','transformar_pop_auxiliar','transformar_modelo','unificar','descartar_legado','precisa_decisao'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalogo_servicos_principal_nao_self_chk') THEN
    ALTER TABLE public.catalogo_servicos ADD CONSTRAINT catalogo_servicos_principal_nao_self_chk
      CHECK (servico_principal_id IS NULL OR servico_principal_id <> id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_catalogo_servicos_classificacao ON public.catalogo_servicos(classificacao);
CREATE INDEX IF NOT EXISTS idx_catalogo_servicos_classificacao_sug ON public.catalogo_servicos(classificacao_sugerida);
CREATE INDEX IF NOT EXISTS idx_catalogo_servicos_principal ON public.catalogo_servicos(servico_principal_id);

-- Trava: homologar classificação/área nunca pode ativar um item "a confirmar".
CREATE OR REPLACE FUNCTION public.trg_catalogo_bloquear_ativacao_indevida()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.ativo_operacional AND NEW.status_homologacao = 'a_confirmar' THEN
    RAISE EXCEPTION 'Serviço com status "a_confirmar" não pode ser ativado operacionalmente.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS catalogo_bloquear_ativacao_indevida ON public.catalogo_servicos;
CREATE TRIGGER catalogo_bloquear_ativacao_indevida
  BEFORE INSERT OR UPDATE ON public.catalogo_servicos
  FOR EACH ROW EXECUTE FUNCTION public.trg_catalogo_bloquear_ativacao_indevida();

-- ============================================================
-- RPC idempotente: gera SUGESTÕES para todos os registros.
-- Não toca em classificacao (decisão), status_homologacao,
-- ativo_operacional, template_id, responsáveis, área ou fontes.
-- ============================================================
CREATE OR REPLACE FUNCTION public.catalogo_sugerir_homologacao()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total int;
  _res jsonb;
BEGIN
  IF NOT public.is_gestor(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas gestores podem gerar sugestões do catálogo.';
  END IF;

  ------------------------------------------------------------------
  -- 1) Classificação sugerida por origem + semântica explícita
  ------------------------------------------------------------------
  UPDATE public.catalogo_servicos s
     SET classificacao_sugerida = x.cls,
         classificacao_justificativa = x.just,
         acao_recomendada = x.acao,
         sugestao_atualizada_em = now()
  FROM (
    SELECT c.id,
      CASE
        WHEN c.origem_tabela = 'doc_modelos'
          OR c.nome_norm ~ '^modelo[0-9]'
          OR c.nome_norm LIKE 'procuracao%'
          OR c.nome_norm LIKE 'substabelecimento -%'
          THEN 'modelo_documento'
        WHEN c.nome_norm LIKE '%audiencia%'
          OR c.nome_norm LIKE '%sentenca%'
          OR c.nome_norm LIKE '%onboarding%'
          OR c.nome_norm LIKE 'entrada de cliente novo%'
          OR c.nome_norm LIKE '%pericia%'
          OR c.nome_norm LIKE 'peca simples%'
          OR c.nome_norm LIKE '%pos concessao%'
          OR c.nome_norm LIKE '%deferido%'
          OR c.nome_norm LIKE 'substabelecimento%'
          THEN 'pop_auxiliar'
        WHEN c.origem_tabela IN ('fluxos_templates','configuracoes_sistema.processos.tipos_acao','processos','piloto_catalogo','manual')
          THEN 'servico_juridico'
        ELSE 'a_confirmar'
      END AS cls,
      CASE
        WHEN c.origem_tabela = 'doc_modelos'
          OR c.nome_norm ~ '^modelo[0-9]'
          OR c.nome_norm LIKE 'procuracao%'
          OR c.nome_norm LIKE 'substabelecimento -%'
          THEN 'Origem exclusivamente documental (doc_modelos / procuração / substabelecimento / modelo numerado): é peça-modelo, não algo que o cliente contrata.'
        WHEN c.nome_norm LIKE '%audiencia%'
          OR c.nome_norm LIKE '%sentenca%'
          OR c.nome_norm LIKE '%onboarding%'
          OR c.nome_norm LIKE 'entrada de cliente novo%'
          OR c.nome_norm LIKE '%pericia%'
          OR c.nome_norm LIKE 'peca simples%'
          OR c.nome_norm LIKE '%pos concessao%'
          OR c.nome_norm LIKE '%deferido%'
          OR c.nome_norm LIKE 'substabelecimento%'
          THEN 'Procedimento interno/etapa do processo (audiência, sentença, onboarding, perícia, peça simples ou pós-concessão): o cliente não contrata isso isoladamente.'
        WHEN c.origem_tabela IN ('fluxos_templates','configuracoes_sistema.processos.tipos_acao','processos','piloto_catalogo','manual')
          THEN 'Responde à pergunta "o que o cliente contratou?": corresponde a um objeto de contratação jurídica.'
        ELSE 'Origem insuficiente para classificar com segurança.'
      END AS just,
      CASE
        WHEN c.origem_tabela = 'doc_modelos'
          OR c.nome_norm ~ '^modelo[0-9]'
          OR c.nome_norm LIKE 'procuracao%'
          OR c.nome_norm LIKE 'substabelecimento -%'
          THEN 'transformar_modelo'
        WHEN c.nome_norm LIKE '%audiencia%'
          OR c.nome_norm LIKE '%sentenca%'
          OR c.nome_norm LIKE '%onboarding%'
          OR c.nome_norm LIKE 'entrada de cliente novo%'
          OR c.nome_norm LIKE '%pericia%'
          OR c.nome_norm LIKE 'peca simples%'
          OR c.nome_norm LIKE '%pos concessao%'
          OR c.nome_norm LIKE '%deferido%'
          OR c.nome_norm LIKE 'substabelecimento%'
          THEN 'transformar_pop_auxiliar'
        WHEN c.origem_tabela IN ('fluxos_templates','configuracoes_sistema.processos.tipos_acao','processos','piloto_catalogo','manual')
          THEN 'manter_servico'
        ELSE 'precisa_decisao'
      END AS acao
    FROM public.catalogo_servicos c
  ) x
  WHERE x.id = s.id;

  ------------------------------------------------------------------
  -- 2) Modalidade sugerida (semântica de nome) — sem alterar subtipo
  ------------------------------------------------------------------
  UPDATE public.catalogo_servicos s
     SET modalidade_sugerida = CASE
           WHEN s.nome_norm LIKE '%requerimento administrativo%' THEN 'Requerimento administrativo'
           WHEN s.nome_norm LIKE '%extrajudicial e judicial%' THEN 'Judicial / Extrajudicial (precisa decisão)'
           WHEN s.nome_norm LIKE '%extrajudicial%' THEN 'Extrajudicial'
           WHEN s.nome_norm LIKE '%negad%' OR s.nome_norm LIKE '%negativa%'
             OR s.nome_norm LIKE '%indeferimento%' OR s.nome_norm LIKE '%acao judicial%'
             THEN 'Indeferimento / ação judicial'
           WHEN s.nome_norm LIKE '%pos concessao%' OR s.nome_norm LIKE '%deferido%' THEN 'Pós-concessão'
           WHEN s.nome_norm LIKE '%recurso%' THEN 'Recurso'
           WHEN s.nome_norm LIKE '%revisao%' THEN 'Revisão'
           WHEN s.nome_norm LIKE '%consensual%' THEN 'Consensual'
           WHEN s.nome_norm LIKE '%litigioso%' THEN 'Litigioso'
           WHEN s.nome_norm LIKE '%rural%' THEN 'Rural'
           ELSE NULL
         END,
         sugestao_atualizada_em = now();

  ------------------------------------------------------------------
  -- 3) Duplicidade: sugestão de serviço principal (sem consolidar)
  --    Principal do grupo = nome mais curto/genérico (determinístico).
  ------------------------------------------------------------------
  WITH principais AS (
    SELECT DISTINCT ON (duplicidade_grupo)
           duplicidade_grupo, id AS principal_id, nome AS principal_nome
      FROM public.catalogo_servicos
     WHERE duplicidade_grupo IS NOT NULL
     ORDER BY duplicidade_grupo, length(nome_norm), nome_norm
  )
  UPDATE public.catalogo_servicos s
     SET duplicidade_sugerida = true,
         servico_principal_sugerido_id = CASE WHEN p.principal_id = s.id THEN NULL ELSE p.principal_id END,
         servico_principal_sugerido_nome = p.principal_nome,
         duplicidade_sugerida_justificativa = CASE
           WHEN p.principal_id = s.id
             THEN 'Sugerido como serviço principal do grupo ' || s.duplicidade_grupo || ' (nome mais genérico). Consolidação NÃO executada.'
           ELSE 'Possível variação/modalidade de "' || p.principal_nome || '" (grupo ' || s.duplicidade_grupo || '). Consolidação NÃO executada.'
         END,
         acao_recomendada = CASE
           WHEN s.classificacao_sugerida <> 'servico_juridico' THEN s.acao_recomendada
           WHEN p.principal_id = s.id THEN 'manter_servico'
           WHEN s.modalidade_sugerida IS NULL OR s.modalidade_sugerida LIKE '%precisa decisão%' THEN 'precisa_decisao'
           ELSE 'transformar_modalidade'
         END,
         sugestao_atualizada_em = now()
  FROM principais p
  WHERE p.duplicidade_grupo = s.duplicidade_grupo;

  ------------------------------------------------------------------
  -- 3b) Famílias orientadas explicitamente (BPC/LOAS e Divórcio)
  ------------------------------------------------------------------
  -- BPC/LOAS: principal = item genérico "BPC/LOAS"
  WITH bpc AS (
    SELECT id, nome FROM public.catalogo_servicos
     WHERE nome_norm = 'bpc loas' LIMIT 1
  )
  UPDATE public.catalogo_servicos s
     SET duplicidade_sugerida = true,
         servico_principal_sugerido_id = CASE WHEN b.id = s.id THEN NULL ELSE b.id END,
         servico_principal_sugerido_nome = b.nome,
         duplicidade_sugerida_justificativa = CASE
           WHEN b.id = s.id THEN 'Sugerido como serviço principal da família BPC/LOAS. Consolidação NÃO executada.'
           ELSE 'Família BPC/LOAS: sugerido como modalidade de "' || b.nome || '". Consolidação NÃO executada.'
         END,
         acao_recomendada = CASE
           WHEN s.classificacao_sugerida <> 'servico_juridico' THEN s.acao_recomendada
           WHEN b.id = s.id THEN 'manter_servico'
           WHEN s.modalidade_sugerida IS NULL THEN 'precisa_decisao'
           ELSE 'transformar_modalidade'
         END,
         sugestao_atualizada_em = now()
  FROM bpc b
  WHERE (s.nome_norm LIKE 'bpc%' OR s.nome_norm LIKE '%loas%'
         OR s.nome_norm LIKE 'beneficio assistencial%');

  -- Divórcio: principal = "Divórcio Consensual"
  WITH div AS (
    SELECT id, nome FROM public.catalogo_servicos
     WHERE nome_norm = 'divorcio consensual' LIMIT 1
  )
  UPDATE public.catalogo_servicos s
     SET duplicidade_sugerida = true,
         servico_principal_sugerido_id = CASE WHEN d.id = s.id THEN NULL ELSE d.id END,
         servico_principal_sugerido_nome = d.nome,
         duplicidade_sugerida_justificativa = CASE
           WHEN d.id = s.id THEN 'Sugerido como serviço principal da família Divórcio (modalidades Judicial/Extrajudicial). Consolidação NÃO executada.'
           ELSE 'Família Divórcio: sugerido como modalidade de "' || d.nome || '". Consolidação NÃO executada.'
         END,
         acao_recomendada = CASE
           WHEN s.classificacao_sugerida <> 'servico_juridico' THEN s.acao_recomendada
           WHEN d.id = s.id THEN 'manter_servico'
           WHEN s.modalidade_sugerida IS NULL OR s.modalidade_sugerida LIKE '%precisa decisão%' THEN 'precisa_decisao'
           ELSE 'transformar_modalidade'
         END,
         sugestao_atualizada_em = now()
  FROM div d
  WHERE s.nome_norm LIKE 'divorcio%';

  ------------------------------------------------------------------
  -- 4) Área sugerida para itens hoje em "outro" (sem alterar area)
  ------------------------------------------------------------------
  UPDATE public.catalogo_servicos s
     SET area_sugerida = v.area_sug,
         area_sugerida_justificativa = v.just,
         sugestao_atualizada_em = now()
  FROM (
    SELECT c.id,
      CASE
        WHEN c.nome_norm LIKE '%ipi%' OR c.nome_norm LIKE '%ipva%' OR c.nome_norm LIKE '%icms%' THEN 'tributario'
        WHEN c.nome_norm LIKE '%plano de saude%' THEN 'consumidor'
        WHEN c.nome_norm LIKE '%emprestimo%' OR c.nome_norm LIKE '%consignado%' THEN 'consumidor'
        ELSE NULL
      END AS area_sug,
      CASE
        WHEN c.nome_norm LIKE '%ipi%' OR c.nome_norm LIKE '%ipva%' OR c.nome_norm LIKE '%icms%'
          THEN 'Isenção de tributos (IPI/ICMS/IOF/IPVA) — matéria tributária.'
        WHEN c.nome_norm LIKE '%plano de saude%'
          THEN 'Cobertura de plano de saúde — relação de consumo (saúde suplementar).'
        WHEN c.nome_norm LIKE '%emprestimo%' OR c.nome_norm LIKE '%consignado%'
          THEN 'Contrato bancário/consignado — relação de consumo.'
        ELSE NULL
      END AS just
    FROM public.catalogo_servicos c
    WHERE c.area_norm = 'outro'
  ) v
  WHERE v.id = s.id AND v.area_sug IS NOT NULL;

  SELECT count(*) INTO _total FROM public.catalogo_servicos;

  SELECT jsonb_build_object(
    'total', _total,
    'sugestoes', (SELECT count(*) FROM public.catalogo_servicos WHERE sugestao_atualizada_em IS NOT NULL),
    'servico_juridico', (SELECT count(*) FROM public.catalogo_servicos WHERE classificacao_sugerida='servico_juridico'),
    'pop_auxiliar', (SELECT count(*) FROM public.catalogo_servicos WHERE classificacao_sugerida='pop_auxiliar'),
    'modelo_documento', (SELECT count(*) FROM public.catalogo_servicos WHERE classificacao_sugerida='modelo_documento'),
    'legado_descartar', (SELECT count(*) FROM public.catalogo_servicos WHERE classificacao_sugerida='legado_descartar'),
    'a_confirmar_sugerido', (SELECT count(*) FROM public.catalogo_servicos WHERE classificacao_sugerida='a_confirmar'),
    'homologados', (SELECT count(*) FROM public.catalogo_servicos WHERE classificacao <> 'a_confirmar'),
    'ativos_operacionais', (SELECT count(*) FROM public.catalogo_servicos WHERE ativo_operacional)
  ) INTO _res;

  RETURN _res;
END;
$$;

REVOKE ALL ON FUNCTION public.catalogo_sugerir_homologacao() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.catalogo_sugerir_homologacao() TO authenticated;