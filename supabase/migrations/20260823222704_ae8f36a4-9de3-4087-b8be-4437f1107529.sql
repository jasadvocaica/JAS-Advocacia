
CREATE OR REPLACE FUNCTION public.catalogo_seed_levantamento()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _antes integer;
  _depois integer;
  _piloto uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_gestor(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas gestores podem executar o levantamento do catálogo';
  END IF;

  SELECT count(*) INTO _antes FROM public.catalogo_servicos;

  INSERT INTO public.catalogo_servicos (nome, area, descricao, origem_tabela, origem_id, origem_texto, metadados)
  SELECT t.nome, coalesce(t.area, 'outro'), t.descricao, 'fluxos_templates', t.id, t.nome,
         jsonb_build_object('template_relacionado_id', t.id, 'template_relacionado_nome', t.nome)
  FROM public.fluxos_templates t
  WHERE public.catalogo_norm(t.nome) IS NOT NULL
    AND public.catalogo_norm(t.nome) NOT LIKE '%honorario%'
  ON CONFLICT (area_norm, coalesce(subtipo_norm,''), nome_norm) DO NOTHING;

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

  INSERT INTO public.catalogo_servicos (nome, area, origem_tabela, origem_texto)
  SELECT DISTINCT trim(p.tipo_acao), coalesce(nullif(trim(p.area_direito),''), 'outro'),
         'processos', coalesce(p.area_direito,'') || ' / ' || p.tipo_acao
  FROM public.processos p
  WHERE public.catalogo_norm(p.tipo_acao) IS NOT NULL
    AND public.catalogo_norm(p.tipo_acao) NOT LIKE '%honorario%'
  ON CONFLICT (area_norm, coalesce(subtipo_norm,''), nome_norm) DO NOTHING;

  INSERT INTO public.catalogo_servicos (nome, area, subtipo, origem_tabela, origem_texto)
  SELECT DISTINCT trim(a.subtipo), coalesce(nullif(trim(a.area),''), 'outro'), trim(a.subtipo),
         'cliente_atendimentos', coalesce(a.area,'') || ' / ' || a.subtipo
  FROM public.cliente_atendimentos a
  WHERE public.catalogo_norm(a.subtipo) IS NOT NULL
  ON CONFLICT (area_norm, coalesce(subtipo_norm,''), nome_norm) DO NOTHING;

  INSERT INTO public.catalogo_servicos (nome, area, origem_tabela, origem_id, origem_texto, metadados)
  SELECT m.titulo, coalesce(m.area_direito::text, 'outro'), 'doc_modelos', m.id, m.titulo,
         jsonb_build_object('modelo_relacionado_id', m.id, 'modelo_categoria', m.categoria::text)
  FROM public.doc_modelos m
  WHERE public.catalogo_norm(m.titulo) IS NOT NULL
    AND public.catalogo_norm(m.titulo) NOT LIKE '%honorario%'
  ON CONFLICT (area_norm, coalesce(subtipo_norm,''), nome_norm) DO NOTHING;

  INSERT INTO public.catalogo_servicos (nome, area, subtipo, origem_tabela, origem_id, origem_texto)
  SELECT coalesce(s.subtipo, s.area), s.area, s.subtipo, 'producao_juridica_servicos', s.id,
         s.area || ' / ' || coalesce(s.subtipo,'')
  FROM public.producao_juridica_servicos s
  WHERE public.catalogo_norm(coalesce(s.subtipo, s.area)) IS NOT NULL
  ON CONFLICT (area_norm, coalesce(subtipo_norm,''), nome_norm) DO NOTHING;

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
    SELECT id_a AS id, least(id_a::text, min(id_b::text)) AS grupo
    FROM pares GROUP BY id_a
  )
  UPDATE public.catalogo_servicos c
     SET possivel_duplicidade = true,
         duplicidade_grupo = left(md5(g.grupo), 8),
         duplicidade_justificativa = 'Nome muito semelhante a outro(s) item(ns) da mesma área (>=50% das palavras significativas em comum). Requer decisão manual: manter separado, renomear ou unificar.'
    FROM grupos g WHERE g.id = c.id;

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
