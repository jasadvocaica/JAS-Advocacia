
-- ============ Normalização ============
CREATE OR REPLACE FUNCTION public.catalogo_norm(_t text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT nullif(trim(regexp_replace(lower(translate(coalesce(_t,''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')), '[^a-z0-9]+', ' ', 'g')), '')
$$;

-- ============ Tabela principal ============
CREATE TABLE IF NOT EXISTS public.catalogo_servicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  area text NOT NULL,
  subtipo text,
  descricao text,
  nome_norm text GENERATED ALWAYS AS (public.catalogo_norm(nome)) STORED,
  area_norm text GENERATED ALWAYS AS (public.catalogo_norm(area)) STORED,
  subtipo_norm text GENERATED ALWAYS AS (public.catalogo_norm(subtipo)) STORED,
  status_homologacao text NOT NULL DEFAULT 'a_confirmar'
    CHECK (status_homologacao IN ('a_confirmar','ativo','inativo','unificar','renomear','descartar')),
  publico text NOT NULL DEFAULT 'ambos' CHECK (publico IN ('pf','pj','ambos')),
  ativo_operacional boolean NOT NULL DEFAULT false,
  -- comercial (sem integração financeira)
  valor_referencia numeric,
  observacao_comercial text,
  comercial jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- operação (tudo opcional / nulo por padrão)
  template_id uuid REFERENCES public.fluxos_templates(id) ON DELETE SET NULL,
  responsavel_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  revisor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  parceiro_id uuid REFERENCES public.parceiros(id) ON DELETE SET NULL,
  sla_dias_uteis integer,
  sla_metadados jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- conteúdo / modelos (referências futuras, sem integração)
  conteudo jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- proveniência
  origem_tabela text,
  origem_id uuid,
  origem_texto text,
  possivel_duplicidade boolean NOT NULL DEFAULT false,
  duplicidade_grupo text,
  duplicidade_justificativa text,
  metadados jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS catalogo_servicos_chave_uk
  ON public.catalogo_servicos (area_norm, coalesce(subtipo_norm,''), nome_norm);
CREATE INDEX IF NOT EXISTS catalogo_servicos_area_idx ON public.catalogo_servicos (area_norm);
CREATE INDEX IF NOT EXISTS catalogo_servicos_origem_idx ON public.catalogo_servicos (origem_tabela, origem_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogo_servicos TO authenticated;
GRANT ALL ON public.catalogo_servicos TO service_role;
ALTER TABLE public.catalogo_servicos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalogo_servicos_select_internos" ON public.catalogo_servicos
  FOR SELECT TO authenticated USING (public.is_interno_ativo(auth.uid()));
CREATE POLICY "catalogo_servicos_manage_gestor" ON public.catalogo_servicos
  FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));

-- ============ Perguntas de triagem ============
CREATE TABLE IF NOT EXISTS public.catalogo_servico_perguntas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servico_id uuid NOT NULL REFERENCES public.catalogo_servicos(id) ON DELETE CASCADE,
  ordem integer NOT NULL DEFAULT 1,
  pergunta text NOT NULL,
  pergunta_norm text GENERATED ALWAYS AS (public.catalogo_norm(pergunta)) STORED,
  tipo text NOT NULL DEFAULT 'texto'
    CHECK (tipo IN ('texto','texto_longo','opcao','multipla','booleano','numero','data')),
  opcoes jsonb NOT NULL DEFAULT '[]'::jsonb,
  obrigatoria boolean NOT NULL DEFAULT false,
  metadados jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS catalogo_perguntas_uk
  ON public.catalogo_servico_perguntas (servico_id, pergunta_norm);
CREATE INDEX IF NOT EXISTS catalogo_perguntas_servico_idx
  ON public.catalogo_servico_perguntas (servico_id, ordem);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogo_servico_perguntas TO authenticated;
GRANT ALL ON public.catalogo_servico_perguntas TO service_role;
ALTER TABLE public.catalogo_servico_perguntas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalogo_perguntas_select_internos" ON public.catalogo_servico_perguntas
  FOR SELECT TO authenticated USING (public.is_interno_ativo(auth.uid()));
CREATE POLICY "catalogo_perguntas_manage_gestor" ON public.catalogo_servico_perguntas
  FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));

-- ============ Documentos / checklist ============
CREATE TABLE IF NOT EXISTS public.catalogo_servico_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servico_id uuid NOT NULL REFERENCES public.catalogo_servicos(id) ON DELETE CASCADE,
  ordem integer NOT NULL DEFAULT 1,
  nome text NOT NULL,
  nome_norm text GENERATED ALWAYS AS (public.catalogo_norm(nome)) STORED,
  obrigatorio boolean NOT NULL DEFAULT false,
  observacao text,
  metadados jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS catalogo_documentos_uk
  ON public.catalogo_servico_documentos (servico_id, nome_norm);
CREATE INDEX IF NOT EXISTS catalogo_documentos_servico_idx
  ON public.catalogo_servico_documentos (servico_id, ordem);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogo_servico_documentos TO authenticated;
GRANT ALL ON public.catalogo_servico_documentos TO service_role;
ALTER TABLE public.catalogo_servico_documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalogo_documentos_select_internos" ON public.catalogo_servico_documentos
  FOR SELECT TO authenticated USING (public.is_interno_ativo(auth.uid()));
CREATE POLICY "catalogo_documentos_manage_gestor" ON public.catalogo_servico_documentos
  FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));

-- ============ updated_at ============
CREATE TRIGGER trg_catalogo_servicos_touch BEFORE UPDATE ON public.catalogo_servicos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_catalogo_perguntas_touch BEFORE UPDATE ON public.catalogo_servico_perguntas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_catalogo_documentos_touch BEFORE UPDATE ON public.catalogo_servico_documentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ Levantamento idempotente ============
CREATE OR REPLACE FUNCTION public.catalogo_seed_levantamento()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _antes integer;
  _depois integer;
  _piloto uuid;
BEGIN
  IF NOT public.is_gestor(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas gestores podem executar o levantamento do catálogo';
  END IF;

  SELECT count(*) INTO _antes FROM public.catalogo_servicos;

  -- 1) Templates de fluxo (exceto cobrança de honorários)
  INSERT INTO public.catalogo_servicos (nome, area, descricao, origem_tabela, origem_id, origem_texto, metadados)
  SELECT t.nome, coalesce(t.area, 'outro'), t.descricao, 'fluxos_templates', t.id, t.nome,
         jsonb_build_object('template_relacionado_id', t.id, 'template_relacionado_nome', t.nome)
  FROM public.fluxos_templates t
  WHERE public.catalogo_norm(t.nome) IS NOT NULL
    AND public.catalogo_norm(t.nome) NOT LIKE '%honorario%'
  ON CONFLICT (area_norm, coalesce(subtipo_norm,''), nome_norm) DO NOTHING;

  -- 2) Tipos de ação configurados (configuracoes_sistema.processos.tipos_acao)
  INSERT INTO public.catalogo_servicos (nome, area, origem_tabela, origem_texto)
  SELECT tipo, area_key, 'configuracoes_sistema.processos.tipos_acao', area_key || ' / ' || tipo
  FROM (
    SELECT j.key AS area_key, trim(x.value #>> '{}') AS tipo
    FROM public.configuracoes_sistema c
    CROSS JOIN LATERAL jsonb_each(coalesce(c.valor_json, c.valor::jsonb)) j
    CROSS JOIN LATERAL jsonb_array_elements(j.value) x(value)
    WHERE c.secao = 'processos' AND c.chave = 'tipos_acao'
  ) s
  WHERE public.catalogo_norm(tipo) IS NOT NULL
    AND public.catalogo_norm(tipo) NOT LIKE '%honorario%'
  ON CONFLICT (area_norm, coalesce(subtipo_norm,''), nome_norm) DO NOTHING;

  -- 3) Tipos de ação realmente usados em processos
  INSERT INTO public.catalogo_servicos (nome, area, origem_tabela, origem_texto)
  SELECT DISTINCT trim(p.tipo_acao), coalesce(nullif(trim(p.area_direito),''), 'outro'),
         'processos', coalesce(p.area_direito,'') || ' / ' || p.tipo_acao
  FROM public.processos p
  WHERE public.catalogo_norm(p.tipo_acao) IS NOT NULL
    AND public.catalogo_norm(p.tipo_acao) NOT LIKE '%honorario%'
  ON CONFLICT (area_norm, coalesce(subtipo_norm,''), nome_norm) DO NOTHING;

  -- 4) Atendimentos (área + subtipo)
  INSERT INTO public.catalogo_servicos (nome, area, subtipo, origem_tabela, origem_texto)
  SELECT DISTINCT trim(a.subtipo), coalesce(nullif(trim(a.area),''), 'outro'), trim(a.subtipo),
         'cliente_atendimentos', coalesce(a.area,'') || ' / ' || a.subtipo
  FROM public.cliente_atendimentos a
  WHERE public.catalogo_norm(a.subtipo) IS NOT NULL
  ON CONFLICT (area_norm, coalesce(subtipo_norm,''), nome_norm) DO NOTHING;

  -- 5) Modelos de documento/peça (proveniência: podem virar serviço ou ser descartados)
  INSERT INTO public.catalogo_servicos (nome, area, origem_tabela, origem_id, origem_texto, metadados)
  SELECT m.titulo, coalesce(m.area_direito::text, 'outro'), 'doc_modelos', m.id, m.titulo,
         jsonb_build_object('modelo_relacionado_id', m.id, 'modelo_categoria', m.categoria::text)
  FROM public.doc_modelos m
  WHERE public.catalogo_norm(m.titulo) IS NOT NULL
    AND public.catalogo_norm(m.titulo) NOT LIKE '%honorario%'
  ON CONFLICT (area_norm, coalesce(subtipo_norm,''), nome_norm) DO NOTHING;

  -- 6) Configurações de produção jurídica já cadastradas (se houver)
  INSERT INTO public.catalogo_servicos (nome, area, subtipo, origem_tabela, origem_id, origem_texto)
  SELECT coalesce(s.subtipo, s.area), s.area, s.subtipo, 'producao_juridica_servicos', s.id,
         s.area || ' / ' || coalesce(s.subtipo,'')
  FROM public.producao_juridica_servicos s
  WHERE public.catalogo_norm(coalesce(s.subtipo, s.area)) IS NOT NULL
  ON CONFLICT (area_norm, coalesce(subtipo_norm,''), nome_norm) DO NOTHING;

  -- ============ Marcação de POSSÍVEL DUPLICIDADE (não unifica nada) ============
  UPDATE public.catalogo_servicos SET possivel_duplicidade = false,
    duplicidade_grupo = NULL, duplicidade_justificativa = NULL
  WHERE possivel_duplicidade = true;

  WITH palavras AS (
    SELECT c.id, c.area_norm,
           array(SELECT DISTINCT w FROM unnest(string_to_array(c.nome_norm,' ')) w
                 WHERE length(w) > 3) AS arr
    FROM public.catalogo_servicos c
  ),
  pares AS (
    SELECT a.id AS id_a, b.id AS id_b
    FROM palavras a JOIN palavras b
      ON a.id <> b.id
     AND a.area_norm IS NOT DISTINCT FROM b.area_norm
     AND cardinality(a.arr) > 0 AND cardinality(b.arr) > 0
     AND (SELECT count(*) FROM (SELECT unnest(a.arr) INTERSECT SELECT unnest(b.arr)) i)::numeric
       / (SELECT count(*) FROM (SELECT unnest(a.arr) UNION SELECT unnest(b.arr)) u) >= 0.5
  ),
  grupos AS (
    SELECT id_a AS id, least(id_a::text, min(id_b::text)) AS grupo, count(*) AS pares
    FROM pares GROUP BY id_a
  )
  UPDATE public.catalogo_servicos c
     SET possivel_duplicidade = true,
         duplicidade_grupo = left(md5(g.grupo), 8),
         duplicidade_justificativa = 'Nome muito semelhante a outro(s) item(ns) da mesma área (>=50% das palavras significativas em comum). Requer decisão manual: manter separado, renomear ou unificar.'
    FROM grupos g WHERE g.id = c.id;

  -- ============ Piloto ============
  SELECT id INTO _piloto FROM public.catalogo_servicos
   WHERE nome_norm = public.catalogo_norm('Bloqueio, suspensão ou desativação de conta em plataforma digital')
   LIMIT 1;

  IF _piloto IS NULL THEN
    INSERT INTO public.catalogo_servicos
      (nome, area, subtipo, descricao, status_homologacao, publico, ativo_operacional,
       origem_tabela, origem_texto, metadados)
    VALUES
      ('Bloqueio, suspensão ou desativação de conta em plataforma digital',
       'consumidor',
       'Bloqueio de plataforma digital',
       'Serviço piloto do catálogo. Cadastrado como A CONFIRMAR, sem POP e sem responsável.',
       'a_confirmar', 'ambos', false,
       'piloto_catalogo', 'Piloto definido pela gestão',
       jsonb_build_object(
         'plataformas', jsonb_build_array('Instagram','Facebook','WhatsApp','TikTok','Google','YouTube','Mercado Livre','Uber','99','Outra'),
         'observacao_documentos', 'Documentos básicos ainda não definidos — checklist específico não cadastrado nesta etapa.'
       ))
    RETURNING id INTO _piloto;
  END IF;

  INSERT INTO public.catalogo_servico_perguntas (servico_id, ordem, pergunta, tipo, opcoes)
  VALUES
    (_piloto, 1, 'Qual plataforma?', 'opcao',
      '["Instagram","Facebook","WhatsApp","TikTok","Google","YouTube","Mercado Livre","Uber","99","Outra"]'::jsonb),
    (_piloto, 2, 'Pessoa Física ou Pessoa Jurídica?', 'opcao', '["Pessoa Física","Pessoa Jurídica"]'::jsonb),
    (_piloto, 3, 'Uso pessoal ou profissional?', 'opcao', '["Pessoal","Profissional"]'::jsonb),
    (_piloto, 4, 'Quando/quanto tempo faz que ocorreu o bloqueio?', 'texto', '[]'::jsonb),
    (_piloto, 5, 'Qual motivo a plataforma informou?', 'texto_longo', '[]'::jsonb),
    (_piloto, 6, 'Criou ou utilizou conta alternativa/fake?', 'booleano', '[]'::jsonb),
    (_piloto, 7, 'Possui prints ou outras provas?', 'booleano', '[]'::jsonb),
    (_piloto, 8, 'Já tentou recuperar a conta? Como?', 'texto_longo', '[]'::jsonb),
    (_piloto, 9, 'Observações relevantes.', 'texto_longo', '[]'::jsonb)
  ON CONFLICT (servico_id, pergunta_norm) DO NOTHING;

  SELECT count(*) INTO _depois FROM public.catalogo_servicos;

  RETURN jsonb_build_object(
    'total_antes', _antes,
    'total_depois', _depois,
    'novos', _depois - _antes,
    'piloto_id', _piloto,
    'duplicidades', (SELECT count(*) FROM public.catalogo_servicos WHERE possivel_duplicidade)
  );
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.catalogo_seed_levantamento() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.catalogo_seed_levantamento() TO authenticated;
