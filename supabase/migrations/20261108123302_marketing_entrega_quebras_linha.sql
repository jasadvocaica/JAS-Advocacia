-- Regressão real: aspas com escape adicional, mas quebras com apenas uma camada.
create or replace function marketing_privado.ler_entrega_json(_texto text) returns jsonb
language plpgsql immutable set search_path='' as $$
declare decodificado text; normalizado text:=''; ch text; em_string boolean:=false; escapado boolean:=false; i integer; literal text;
begin
 if _texto is null or length(_texto)>20000 then raise exception 'Entrega ausente ou excessiva'; end if;
 begin return _texto::jsonb;
 exception when invalid_text_representation then
  decodificado:=('"'||_texto||'"')::jsonb #>> '{}';
 end;
 -- Escapa controles somente dentro de valores textuais; preserva espaços de formatação.
 for i in 1..length(decodificado) loop
  ch:=substr(decodificado,i,1);
  if em_string and not escapado and ascii(ch)<32 then
   literal:=to_jsonb(ch)::text;
   normalizado:=normalizado||substr(literal,2,length(literal)-2);
  else
   normalizado:=normalizado||ch;
   if em_string then
    if escapado then escapado:=false;
    elsif ch=chr(92) then escapado:=true;
    elsif ch='"' then em_string:=false;
    end if;
   elsif ch='"' then em_string:=true;
   end if;
  end if;
 end loop;
 return normalizado::jsonb;
end;$$;
revoke all on function marketing_privado.ler_entrega_json(text) from public,anon,authenticated;
