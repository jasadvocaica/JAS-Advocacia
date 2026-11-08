-- Brief textual é roteiro de produção; Material exige arquivo real no contrato editorial.
do $$declare d text; alvo text:='select ''material'',left(''Brief de produção · ''||titulo,250)'; begin
 select pg_get_functiondef('marketing_privado.cadastrar_brief_ia()'::regprocedure) into d;
 if position(alvo in d)=0 then raise exception 'Cadastro do brief mudou; revisar a migração'; end if;
 execute replace(d,alvo,'select ''roteiro'',left(''Brief de produção · ''||titulo,250)');
end;$$;
update public.mkt_itens i set tipo='roteiro'
where i.tipo='material' and i.dados->>'origem_ia'='true'
and exists(select 1 from marketing_privado.ia_entregas e join escritorio_privado.missao_tarefas t on t.id=e.tarefa_id
 join public.agentes_ia a on a.id=t.agente_id where e.material_id=i.id and a.nome='Vinícius' and a.sala='marketing');
