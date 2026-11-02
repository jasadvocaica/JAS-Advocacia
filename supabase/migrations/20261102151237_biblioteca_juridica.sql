-- Legislação pública: versões imutáveis, pesquisa por dispositivo e escrita restrita.
CREATE TABLE public.jur_normas (
  id text PRIMARY KEY, titulo text NOT NULL, numero text NOT NULL DEFAULT '', tipo text NOT NULL,
  esfera text NOT NULL, uf text, ementa text NOT NULL DEFAULT '', apelidos text[] NOT NULL DEFAULT '{}',
  areas text[] NOT NULL DEFAULT '{geral}', termos text NOT NULL DEFAULT '', fonte_oficial text NOT NULL,
  fonte_repositorio text NOT NULL, commit text NOT NULL CHECK (commit ~ '^[a-f0-9]{40}$'),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'), versao_texto text NOT NULL,
  data_norma date, capturado_em date, revogada boolean NOT NULL DEFAULT false, ativo boolean NOT NULL DEFAULT true,
  notas text NOT NULL DEFAULT '', importado_em timestamptz NOT NULL DEFAULT now(), verificado_em timestamptz NOT NULL DEFAULT now(),
  busca tsvector GENERATED ALWAYS AS (to_tsvector('portuguese'::regconfig,titulo || ' ' || numero || ' ' || ementa || ' ' || termos)) STORED
);
CREATE TABLE public.jur_normas_versoes (
  norma_id text NOT NULL REFERENCES public.jur_normas(id), sha256 text NOT NULL,
  commit text NOT NULL, fonte_repositorio text NOT NULL, texto_original text NOT NULL,
  metadados jsonb NOT NULL, importado_em timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(norma_id,sha256)
);
ALTER TABLE public.jur_normas ADD CONSTRAINT jur_normas_versao_atual_fk FOREIGN KEY(id,sha256)
  REFERENCES public.jur_normas_versoes(norma_id,sha256) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE public.jur_dispositivos (
  id text PRIMARY KEY, norma_id text NOT NULL, versao_sha text NOT NULL, sequencia integer NOT NULL,
  artigo text NOT NULL, artigo_numero text NOT NULL, texto text NOT NULL CHECK(length(texto) BETWEEN 1 AND 8000),
  revogado boolean NOT NULL DEFAULT false,
  busca tsvector GENERATED ALWAYS AS (to_tsvector('portuguese'::regconfig,texto)) STORED,
  FOREIGN KEY(norma_id,versao_sha) REFERENCES public.jur_normas_versoes(norma_id,sha256),
  UNIQUE(norma_id,versao_sha,sequencia)
);
CREATE INDEX jur_normas_busca ON public.jur_normas USING gin(busca);
CREATE INDEX jur_dispositivos_busca ON public.jur_dispositivos USING gin(busca);
CREATE INDEX jur_dispositivos_artigo ON public.jur_dispositivos(artigo_numero);

ALTER TABLE public.jur_normas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jur_normas_versoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jur_dispositivos ENABLE ROW LEVEL SECURITY;
CREATE POLICY jur_normas_leitura ON public.jur_normas FOR SELECT TO authenticated USING(public.has_permission((select auth.uid()),'documentos','visualizar'));
CREATE POLICY jur_versoes_leitura ON public.jur_normas_versoes FOR SELECT TO authenticated USING(public.has_permission((select auth.uid()),'documentos','visualizar'));
CREATE POLICY jur_dispositivos_leitura ON public.jur_dispositivos FOR SELECT TO authenticated USING(public.has_permission((select auth.uid()),'documentos','visualizar'));
CREATE POLICY jur_normas_inserir ON public.jur_normas FOR INSERT TO authenticated WITH CHECK(public.is_gestor((select auth.uid())));
CREATE POLICY jur_normas_atualizar ON public.jur_normas FOR UPDATE TO authenticated USING(public.is_gestor((select auth.uid()))) WITH CHECK(public.is_gestor((select auth.uid())));
CREATE POLICY jur_versoes_inserir ON public.jur_normas_versoes FOR INSERT TO authenticated WITH CHECK(public.is_gestor((select auth.uid())));
CREATE POLICY jur_dispositivos_inserir ON public.jur_dispositivos FOR INSERT TO authenticated WITH CHECK(public.is_gestor((select auth.uid())));
REVOKE ALL ON public.jur_normas, public.jur_normas_versoes, public.jur_dispositivos FROM anon;
GRANT SELECT,INSERT,UPDATE ON public.jur_normas TO authenticated,service_role;
GRANT SELECT,INSERT ON public.jur_normas_versoes,public.jur_dispositivos TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.jur_importar_norma(p_norma jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE atual public.jur_normas%ROWTYPE; n integer; apelidos text[]; areas text[];
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
  IF FOUND AND atual.sha256=p_norma->>'sha256' THEN
    UPDATE public.jur_normas SET verificado_em=now(),commit=p_norma->>'commit',fonte_repositorio=p_norma->>'fonte_repositorio' WHERE id=atual.id;
    RETURN jsonb_build_object('status','sem_alteracao','id',atual.id,'sha256',atual.sha256);
  END IF;
  INSERT INTO public.jur_normas(id,titulo,numero,tipo,esfera,uf,ementa,apelidos,areas,termos,fonte_oficial,fonte_repositorio,commit,sha256,versao_texto,data_norma,capturado_em,revogada,notas)
  VALUES(p_norma->>'id',p_norma->>'titulo',p_norma->>'numero',p_norma->>'tipo',p_norma->>'esfera',p_norma->>'uf',p_norma->>'ementa',coalesce(apelidos,'{}'),coalesce(areas,'{geral}'),coalesce(array_to_string(apelidos,' '),''),p_norma->>'fonte_oficial',p_norma->>'fonte_repositorio',p_norma->>'commit',p_norma->>'sha256',p_norma->>'versao_texto',nullif(p_norma->>'data_norma','')::date,nullif(p_norma->>'capturado_em','')::date,coalesce((p_norma->>'revogada')::boolean,false),coalesce(p_norma->>'notas',''))
  ON CONFLICT(id) DO UPDATE SET titulo=excluded.titulo,numero=excluded.numero,tipo=excluded.tipo,esfera=excluded.esfera,uf=excluded.uf,ementa=excluded.ementa,
    apelidos=CASE WHEN cardinality(excluded.apelidos)>0 THEN excluded.apelidos ELSE public.jur_normas.apelidos END,
    areas=CASE WHEN excluded.areas<>'{geral}' THEN excluded.areas ELSE public.jur_normas.areas END,
    termos=CASE WHEN excluded.termos<>'' THEN excluded.termos ELSE public.jur_normas.termos END,
    fonte_oficial=excluded.fonte_oficial,fonte_repositorio=excluded.fonte_repositorio,commit=excluded.commit,sha256=excluded.sha256,versao_texto=excluded.versao_texto,
    data_norma=excluded.data_norma,capturado_em=excluded.capturado_em,revogada=excluded.revogada,notas=excluded.notas,importado_em=now(),verificado_em=now();
  INSERT INTO public.jur_normas_versoes(norma_id,sha256,commit,fonte_repositorio,texto_original,metadados)
  VALUES(p_norma->>'id',p_norma->>'sha256',p_norma->>'commit',p_norma->>'fonte_repositorio',p_norma->>'texto_original',p_norma-'texto_original'-'dispositivos') ON CONFLICT DO NOTHING;
  INSERT INTO public.jur_dispositivos(id,norma_id,versao_sha,sequencia,artigo,artigo_numero,texto,revogado)
  SELECT x.id,p_norma->>'id',p_norma->>'sha256',x.sequencia,x.artigo,x.artigo_numero,x.texto,x.revogado
  FROM jsonb_to_recordset(p_norma->'dispositivos') AS x(id text,sequencia integer,artigo text,artigo_numero text,texto text,revogado boolean) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n=ROW_COUNT;
  RETURN jsonb_build_object('status','importada','id',p_norma->>'id','sha256',p_norma->>'sha256','dispositivos',n);
END $$;

CREATE OR REPLACE FUNCTION public.jur_estado()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('normas',count(*),'normas_ativas',count(*) FILTER(WHERE ativo AND NOT revogada),'ultima_verificacao',max(verificado_em),
 'dispositivos',(SELECT count(*) FROM public.jur_dispositivos d JOIN public.jur_normas n ON n.id=d.norma_id AND n.sha256=d.versao_sha WHERE n.ativo AND NOT n.revogada AND NOT d.revogado),
 'catalogo',(SELECT coalesce(jsonb_agg(c),'[]'::jsonb) FROM (SELECT id,titulo,versao_texto,verificado_em FROM public.jur_normas WHERE ativo ORDER BY titulo LIMIT 500)c),
 'escopo','Acervo importado do repositório ctresb/leis. A cobertura é parcial; confira a fonte oficial e a redação aplicável ao caso.') FROM public.jur_normas;
$$;

CREATE OR REPLACE FUNCTION public.jur_pesquisar(p_consulta text,p_norma_id text DEFAULT NULL,p_limite integer DEFAULT 12,p_ids text[] DEFAULT NULL)
RETURNS TABLE(id text,norma_id text,titulo text,artigo text,trecho text,fonte_oficial text,fonte_repositorio text,versao_sha text,commit text,versao_texto text,capturado_em date,importado_em timestamptz,notas text,relevancia real)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE q tsquery; estrita tsquery; termos text; art text; numero_lei text; consulta text:=regexp_replace(left(coalesce(p_consulta,''),1600),'([0-9])[.](?=[0-9])','\1','g');
BEGIN
  estrita:=websearch_to_tsquery('portuguese',consulta);
  SELECT string_agg(quote_literal(lexeme),' | ') INTO termos FROM unnest(to_tsvector('portuguese',consulta));
  q:=CASE WHEN termos IS NULL THEN ''::tsquery ELSE to_tsquery('portuguese',termos) END;
  art:=(regexp_match(lower(consulta),'art(?:igo)?[.]?[[:space:]]*([0-9]+(?:[-]?[a-z])?)'))[1];
  numero_lei:=(regexp_match(lower(consulta),'lei(?:[[:space:]]+complementar)?[[:space:]]*(?:n[ºo°.]*[[:space:]]*)?([0-9]+)'))[1];
  RETURN QUERY SELECT d.id,n.id,n.titulo,d.artigo,d.texto,n.fonte_oficial,n.fonte_repositorio,d.versao_sha,n.commit,n.versao_texto,n.capturado_em,n.importado_em,n.notas,
    (CASE WHEN d.busca@@estrita THEN 1 ELSE 0 END+ts_rank_cd(d.busca,q,32)*8+ts_rank_cd(n.busca,q,32))::real AS score
  FROM public.jur_dispositivos d JOIN public.jur_normas n ON n.id=d.norma_id AND n.sha256=d.versao_sha
  WHERE n.ativo AND NOT n.revogada AND NOT d.revogado AND (p_norma_id IS NULL OR n.id=p_norma_id)
    AND ((p_ids IS NOT NULL AND d.id=ANY(p_ids)) OR (p_ids IS NULL AND (numero_lei IS NULL OR n.numero=numero_lei) AND (art IS NULL OR replace(lower(d.artigo_numero),'-','')=replace(art,'-','')) AND (d.busca@@q OR n.busca@@q)))
  ORDER BY score DESC,n.id,d.sequencia LIMIT least(greatest(coalesce(p_limite,12),1),30);
END $$;
REVOKE ALL ON FUNCTION public.jur_importar_norma(jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.jur_estado() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.jur_pesquisar(text,text,integer,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.jur_importar_norma(jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.jur_estado(), public.jur_pesquisar(text,text,integer,text[]) TO authenticated,service_role;
