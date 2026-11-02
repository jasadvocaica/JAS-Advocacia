-- Corrige identificação de ADCT, revogação formatada e busca de artigo em norma indicada.
-- Mantém fragmentos anteriores para rastrear sugestões já produzidas.
ALTER TABLE public.jur_normas ADD COLUMN parser_versao integer NOT NULL DEFAULT 1;
ALTER TABLE public.jur_dispositivos ADD COLUMN parser_versao integer NOT NULL DEFAULT 1;
ALTER TABLE public.jur_dispositivos DROP CONSTRAINT jur_dispositivos_norma_id_versao_sha_sequencia_key;
ALTER TABLE public.jur_dispositivos ADD CONSTRAINT jur_dispositivos_versao_parser_seq UNIQUE(norma_id,versao_sha,parser_versao,sequencia);
CREATE OR REPLACE FUNCTION public.jur_dispositivo_revogado(p_texto text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path='' AS $$
SELECT translate(split_part(coalesce(p_texto,''), E'\n',1),'*_','') ~* '^Art(?:igo)?[.]?[[:space:]]*(?:[0-9]+[º°o]?(?:[[:space:]]*[-–][[:space:]]*[A-Z])?|[úu]nico)[.]?[[:space:]]*[(]?[[:space:]]*(?:revogad[oa]|vetad[oa])';
$$;
REVOKE ALL ON FUNCTION public.jur_dispositivo_revogado(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.jur_dispositivo_revogado(text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.jur_importar_norma(p_norma jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE atual public.jur_normas%ROWTYPE; n integer; versao_parser integer:=coalesce((p_norma->>'parser_versao')::integer,1); apelidos text[]; areas text[];
BEGIN
  IF current_user NOT IN ('service_role','postgres') AND NOT coalesce(public.is_gestor(auth.uid()),false)
    THEN RAISE EXCEPTION 'Somente a gestão pode importar normas' USING ERRCODE='42501'; END IF;
  IF (p_norma->>'sha256') !~ '^[a-f0-9]{64}$' OR (p_norma->>'commit') !~ '^[a-f0-9]{40}$'
    OR (p_norma->>'fonte_oficial') !~ '^https://[^/]+\.(gov|leg|jus)\.br([/?#]|$)'
    OR length(p_norma->>'texto_original') NOT BETWEEN 1 AND 4000000
    OR jsonb_typeof(p_norma->'dispositivos') <> 'array'
    OR jsonb_array_length(p_norma->'dispositivos') NOT BETWEEN 1 AND 30000
    THEN RAISE EXCEPTION 'Norma sem conteúdo, fonte ou versão válidos'; END IF;
  SELECT array_agg(v) INTO apelidos FROM jsonb_array_elements_text(p_norma->'apelidos') v;
  SELECT array_agg(v) INTO areas FROM jsonb_array_elements_text(p_norma->'areas') v;
  -- Serializa importações simultâneas da mesma norma, inclusive sua primeira inclusão.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_norma->>'id',0));
  SELECT * INTO atual FROM public.jur_normas WHERE id=p_norma->>'id';
  IF FOUND AND atual.sha256=p_norma->>'sha256' AND atual.parser_versao=versao_parser THEN
    UPDATE public.jur_normas SET verificado_em=now(),commit=p_norma->>'commit',fonte_repositorio=p_norma->>'fonte_repositorio' WHERE id=atual.id;
    RETURN jsonb_build_object('status','sem_alteracao','id',atual.id,'sha256',atual.sha256);
  END IF;
  INSERT INTO public.jur_normas(id,titulo,numero,tipo,esfera,uf,ementa,apelidos,areas,termos,fonte_oficial,fonte_repositorio,commit,sha256,versao_texto,data_norma,capturado_em,revogada,notas,parser_versao)
  VALUES(p_norma->>'id',p_norma->>'titulo',p_norma->>'numero',p_norma->>'tipo',p_norma->>'esfera',p_norma->>'uf',p_norma->>'ementa',coalesce(apelidos,'{}'),coalesce(areas,'{geral}'),coalesce(array_to_string(apelidos,' '),''),p_norma->>'fonte_oficial',p_norma->>'fonte_repositorio',p_norma->>'commit',p_norma->>'sha256',p_norma->>'versao_texto',nullif(p_norma->>'data_norma','')::date,nullif(p_norma->>'capturado_em','')::date,coalesce((p_norma->>'revogada')::boolean,false),coalesce(p_norma->>'notas',''),versao_parser)
  ON CONFLICT(id) DO UPDATE SET titulo=excluded.titulo,numero=excluded.numero,tipo=excluded.tipo,esfera=excluded.esfera,uf=excluded.uf,ementa=excluded.ementa,
    apelidos=CASE WHEN cardinality(excluded.apelidos)>0 THEN excluded.apelidos ELSE public.jur_normas.apelidos END,
    areas=CASE WHEN excluded.areas<>'{geral}' THEN excluded.areas ELSE public.jur_normas.areas END,
    termos=CASE WHEN excluded.termos<>'' THEN excluded.termos ELSE public.jur_normas.termos END,
    fonte_oficial=excluded.fonte_oficial,fonte_repositorio=excluded.fonte_repositorio,commit=excluded.commit,sha256=excluded.sha256,versao_texto=excluded.versao_texto,
    data_norma=excluded.data_norma,capturado_em=excluded.capturado_em,revogada=excluded.revogada,notas=excluded.notas,importado_em=now(),verificado_em=now(),parser_versao=excluded.parser_versao;
  INSERT INTO public.jur_normas_versoes(norma_id,sha256,commit,fonte_repositorio,texto_original,metadados)
  VALUES(p_norma->>'id',p_norma->>'sha256',p_norma->>'commit',p_norma->>'fonte_repositorio',p_norma->>'texto_original',p_norma-'texto_original'-'dispositivos') ON CONFLICT DO NOTHING;
  INSERT INTO public.jur_dispositivos(id,norma_id,versao_sha,sequencia,artigo,artigo_numero,texto,revogado,parser_versao)
  SELECT x.id,p_norma->>'id',p_norma->>'sha256',x.sequencia,x.artigo,x.artigo_numero,x.texto,x.revogado,versao_parser
  FROM jsonb_to_recordset(p_norma->'dispositivos') AS x(id text,sequencia integer,artigo text,artigo_numero text,texto text,revogado boolean) ON CONFLICT DO NOTHING;
  SELECT count(*) INTO n FROM public.jur_dispositivos WHERE norma_id=p_norma->>'id' AND versao_sha=p_norma->>'sha256' AND parser_versao=versao_parser;
  IF n<>jsonb_array_length(p_norma->'dispositivos') THEN RAISE EXCEPTION 'A indexação dos dispositivos ficou incompleta; importação revertida'; END IF;
  RETURN jsonb_build_object('status','importada','id',p_norma->>'id','sha256',p_norma->>'sha256','dispositivos',n);
END $$;

CREATE OR REPLACE FUNCTION public.jur_estado()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('normas',count(*),'normas_ativas',count(*) FILTER(WHERE ativo AND NOT revogada),'ultima_verificacao',max(verificado_em),
 'dispositivos',(SELECT count(*) FROM public.jur_dispositivos d JOIN public.jur_normas n ON n.id=d.norma_id AND n.sha256=d.versao_sha AND n.parser_versao=d.parser_versao WHERE n.ativo AND NOT n.revogada AND NOT d.revogado AND NOT public.jur_dispositivo_revogado(d.texto)),
 'catalogo',(SELECT coalesce(jsonb_agg(c),'[]'::jsonb) FROM (SELECT id,titulo,versao_texto,verificado_em FROM public.jur_normas WHERE ativo ORDER BY titulo LIMIT 500)c),
 'escopo','Acervo importado do repositório ctresb/leis. A cobertura é parcial; confira a fonte oficial e a redação aplicável ao caso.') FROM public.jur_normas;
$$;

CREATE OR REPLACE FUNCTION public.jur_pesquisar(p_consulta text,p_norma_id text DEFAULT NULL,p_limite integer DEFAULT 12,p_ids text[] DEFAULT NULL)
RETURNS TABLE(id text,norma_id text,titulo text,artigo text,trecho text,fonte_oficial text,fonte_repositorio text,versao_sha text,commit text,versao_texto text,capturado_em date,importado_em timestamptz,notas text,relevancia real)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE q tsquery; estrita tsquery; termos text; art text; numero_lei text; normas_alias text[]; consulta text:=public.jur_normalizar_texto(replace(left(coalesce(p_consulta,''),1600),'.',''));
BEGIN
  estrita:=websearch_to_tsquery('portuguese',consulta);
  SELECT string_agg(quote_literal(lexeme),' | ') INTO termos FROM unnest(to_tsvector('portuguese',consulta));
  q:=CASE WHEN termos IS NULL THEN ''::tsquery ELSE to_tsquery('simple',termos) END;
  art:=(regexp_match(lower(consulta),'art(?:igo)?[.]?[[:space:]]*([0-9]+(?:[-]?[a-z])?)'))[1];
  numero_lei:=(regexp_match(lower(consulta),'lei(?:[[:space:]]+complementar)?[[:space:]]*(?:n[ºo°.]*[[:space:]]*)?([0-9]+)'))[1];
  SELECT array_agg(n.id) INTO normas_alias FROM public.jur_normas n WHERE n.ativo AND NOT n.revogada AND EXISTS(SELECT 1 FROM unnest(n.apelidos) AS a(valor) WHERE length(trim(a.valor))>1 AND position(' '||trim(regexp_replace(public.jur_normalizar_texto(a.valor),'[^a-z0-9]+',' ','g'))||' ' IN ' '||regexp_replace(consulta,'[^a-z0-9]+',' ','g')||' ')>0);
  RETURN QUERY SELECT d.id,n.id,n.titulo,CASE WHEN (n.id='constituicao.md' OR n.tipo ~* 'constitui|lei[ _-]*org') THEN d.artigo ELSE regexp_replace(d.artigo,'^ADCT, ','') END,d.texto,n.fonte_oficial,n.fonte_repositorio,d.versao_sha,n.commit,n.versao_texto,n.capturado_em,n.importado_em,n.notas,
    (CASE WHEN d.busca@@estrita THEN 1 ELSE 0 END+ts_rank_cd(d.busca,q,32)*8+ts_rank_cd(n.busca,q,32))::real AS score
  FROM public.jur_dispositivos d JOIN public.jur_normas n ON n.id=d.norma_id AND n.sha256=d.versao_sha AND n.parser_versao=d.parser_versao
  WHERE n.ativo AND NOT n.revogada AND NOT d.revogado AND NOT public.jur_dispositivo_revogado(d.texto) AND (p_norma_id IS NULL OR n.id=p_norma_id)
    AND ((p_ids IS NOT NULL AND d.id=ANY(p_ids)) OR (p_ids IS NULL AND (art IS NULL OR numero_lei IS NOT NULL OR p_norma_id IS NOT NULL OR normas_alias IS NULL OR n.id=ANY(normas_alias)) AND (consulta !~ '(^|[^a-z0-9])adct([^a-z0-9]|$)' OR ((n.id='constituicao.md' OR n.tipo ~* 'constitui|lei[ _-]*org') AND d.artigo LIKE 'ADCT,%')) AND (art IS NULL OR consulta ~ '(^|[^a-z0-9])adct([^a-z0-9]|$)' OR NOT (coalesce(normas_alias,'{}')=ARRAY['constituicao.md'] OR coalesce(p_norma_id='constituicao.md',false)) OR d.artigo NOT LIKE 'ADCT,%') AND (numero_lei IS NULL OR n.numero=numero_lei) AND (art IS NULL OR replace(lower(d.artigo_numero),'-','')=replace(art,'-','')) AND (d.busca@@q OR n.busca@@q)))
  ORDER BY score DESC,n.id,d.sequencia LIMIT least(greatest(coalesce(p_limite,12),1),30);
END $$;
