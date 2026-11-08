-- Alguns modelos escapam uma segunda vez a string entrega. Não modifica o histórico.
create function marketing_privado.ler_entrega_json(_texto text) returns jsonb
language plpgsql immutable set search_path='' as $$
begin
 if _texto is null or length(_texto)>20000 then raise exception 'Entrega ausente ou excessiva'; end if;
 begin
  return _texto::jsonb;
 exception when invalid_text_representation then
  return (('"'||_texto||'"')::jsonb #>> '{}')::jsonb;
 end;
end;$$;
revoke all on function marketing_privado.ler_entrega_json(text) from public,anon,authenticated;
do $$declare d text; alvo text:='j:=(t.resultado->>''entrega'')::jsonb;'; begin
 select pg_get_functiondef('marketing_privado.cadastrar_entrega_ia(uuid)'::regprocedure) into d;
 if position(alvo in d)=0 then raise exception 'Leitor mudou; revisar a migração'; end if;
 execute replace(d,alvo,'j:=marketing_privado.ler_entrega_json(t.resultado->>''entrega'');');
end;$$;
