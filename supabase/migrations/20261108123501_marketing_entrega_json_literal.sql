do $$declare d text; alvo text:='decodificado:=(''"''||_texto||''"'')::jsonb #>> ''{}'';'; begin
 select pg_get_functiondef('marketing_privado.ler_entrega_json(text)'::regprocedure) into d;
 if position(alvo in d)=0 then raise exception 'Leitor mudou; revisar a migração'; end if;
 execute replace(d,alvo,'begin '||alvo||' exception when invalid_text_representation then decodificado:=_texto; end;');
end;$$;
