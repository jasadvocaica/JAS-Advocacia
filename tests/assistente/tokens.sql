\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values('00000000-0000-0000-0000-000000009001');
insert into profiles(id) values('00000000-0000-0000-0000-000000009001');
update assistente_config set habilitado=true,limite_tokens_diario=5000;
insert into assistente_consumo(id,user_id,tokens_entrada,status) values
('00000000-0000-0000-0000-000000009010','00000000-0000-0000-0000-000000009001',100,'concluido');
insert into assistente_consumo(id,user_id) values
('00000000-0000-0000-0000-000000009011','00000000-0000-0000-0000-000000009001'),
('00000000-0000-0000-0000-000000009012','00000000-0000-0000-0000-000000009001'),
('00000000-0000-0000-0000-000000009013','00000000-0000-0000-0000-000000009001');
set local role service_role;
do $$ declare negado boolean:=false; begin
  perform assistente_reservar_tokens('00000000-0000-0000-0000-000000009011',0,1000,1000);
  if assistente_reservar_tokens('00000000-0000-0000-0000-000000009011',0,1000,1000) then raise exception 'Duplicou reserva'; end if;
  begin perform assistente_reservar_tokens('00000000-0000-0000-0000-000000009012',0,3000,1000);
  exception when raise_exception then negado:=true; end;
  if not negado then raise exception 'Excedeu teto global'; end if;
  perform assistente_confirmar_tokens('00000000-0000-0000-0000-000000009011',0,500,400);
  perform assistente_reservar_tokens('00000000-0000-0000-0000-000000009012',0,3000,1000);
  negado:=false;
  begin perform assistente_reservar_tokens('00000000-0000-0000-0000-000000009013',0,0,1);
  exception when raise_exception then negado:=true; end;
  if not negado then raise exception 'Desconsiderou reserva não confirmada ou uso anterior'; end if;
  perform assistente_confirmar_tokens('00000000-0000-0000-0000-000000009012',0,100,100);
  insert into assistente_reservas_tokens(solicitacao_id,rodada,dia,reservados)
    values('00000000-0000-0000-0000-000000009013',0,(now() at time zone 'America/Cuiaba')::date-1,5000);
  perform assistente_reservar_tokens('00000000-0000-0000-0000-000000009013',1,2700,1000);
end; $$;
reset role;
do $$ begin
  if has_function_privilege('authenticated','assistente_reservar_tokens(uuid,integer,integer,integer)','execute')
    or has_function_privilege('anon','assistente_confirmar_tokens(uuid,integer,integer,integer)','execute') then raise exception 'Orçamento exposto'; end if;
end; $$;
rollback;
select 'Tokens: teto global, reserva, duplicação, consumo anterior e renovação diária OK' as resultado;
