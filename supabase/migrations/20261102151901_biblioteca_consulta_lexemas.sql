-- Lexemas já normalizados não devem passar duas vezes pelo radicalizador.
CREATE OR REPLACE FUNCTION public.jur_pesquisar(p_consulta text,p_norma_id text DEFAULT NULL,p_limite integer DEFAULT 12,p_ids text[] DEFAULT NULL)
RETURNS TABLE(id text,norma_id text,titulo text,artigo text,trecho text,fonte_oficial text,fonte_repositorio text,versao_sha text,commit text,versao_texto text,capturado_em date,importado_em timestamptz,notas text,relevancia real)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE q tsquery; estrita tsquery; termos text; art text; numero_lei text; consulta text:=public.jur_normalizar_texto(replace(left(coalesce(p_consulta,''),1600),'.',''));
BEGIN
  estrita:=websearch_to_tsquery('portuguese',consulta);
  SELECT string_agg(quote_literal(lexeme),' | ') INTO termos FROM unnest(to_tsvector('portuguese',consulta));
  q:=CASE WHEN termos IS NULL THEN ''::tsquery ELSE to_tsquery('simple',termos) END;
  art:=(regexp_match(lower(consulta),'art(?:igo)?[.]?[[:space:]]*([0-9]+(?:[-]?[a-z])?)'))[1];
  numero_lei:=(regexp_match(lower(consulta),'lei(?:[[:space:]]+complementar)?[[:space:]]*(?:n[ºo°.]*[[:space:]]*)?([0-9]+)'))[1];
  RETURN QUERY SELECT d.id,n.id,n.titulo,d.artigo,d.texto,n.fonte_oficial,n.fonte_repositorio,d.versao_sha,n.commit,n.versao_texto,n.capturado_em,n.importado_em,n.notas,
    (CASE WHEN d.busca@@estrita THEN 1 ELSE 0 END+ts_rank_cd(d.busca,q,32)*8+ts_rank_cd(n.busca,q,32))::real AS score
  FROM public.jur_dispositivos d JOIN public.jur_normas n ON n.id=d.norma_id AND n.sha256=d.versao_sha
  WHERE n.ativo AND NOT n.revogada AND NOT d.revogado AND (p_norma_id IS NULL OR n.id=p_norma_id)
    AND ((p_ids IS NOT NULL AND d.id=ANY(p_ids)) OR (p_ids IS NULL AND (numero_lei IS NULL OR n.numero=numero_lei) AND (art IS NULL OR replace(lower(d.artigo_numero),'-','')=replace(art,'-','')) AND (d.busca@@q OR n.busca@@q)))
  ORDER BY score DESC,n.id,d.sequencia LIMIT least(greatest(coalesce(p_limite,12),1),30);
END $$;
