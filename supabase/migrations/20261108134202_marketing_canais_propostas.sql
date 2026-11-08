do $$declare d text; alvo text:='t.solicitada_por,t.solicitada_por,plano,''site'','; begin
 select pg_get_functiondef('marketing_privado.cadastrar_estrategia_ia(uuid)'::regprocedure) into d;
 if position(alvo in d)=0 then raise exception 'Canal do artigo mudou; revisar a migração'; end if;
 execute replace(d,alvo,'t.solicitada_por,t.solicitada_por,plano,''site_blog'',');
end;$$;
update public.mkt_itens i set canal='site_blog',formato='blog_post'
where i.tipo='artigo' and i.status='rascunho' and i.canal='site' and i.dados->>'origem_ia'='true'
and exists(select 1 from marketing_privado.ia_estrategias e where e.artigo_id=i.id);
