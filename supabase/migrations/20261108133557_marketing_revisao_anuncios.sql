-- A checagem de atributos pessoais abrange todas as partes do anúncio proposto.
do $$declare d text; alvo text:='if (j->''anuncio''->>''texto'') ~*'; begin
 select pg_get_functiondef('marketing_privado.cadastrar_estrategia_ia(uuid)'::regprocedure) into d;
 if position(alvo in d)=0 then raise exception 'Validação de anúncio mudou; revisar a migração'; end if;
 execute replace(d,alvo,'if concat_ws('' '',j->''anuncio''->>''titulo'',j->''anuncio''->>''texto'',j->''anuncio''->>''descricao'') ~*');
end;$$;
