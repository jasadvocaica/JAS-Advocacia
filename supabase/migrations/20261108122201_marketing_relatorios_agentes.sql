create function marketing_privado.cadastrar_relatorio_ia(_tarefa uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare t record; artefato uuid;
begin
 select mt.*,m.solicitada_por,a.nome into t from escritorio_privado.missao_tarefas mt
 join escritorio_privado.missoes m on m.id=mt.missao_id and m.chave like 'auto-mkt:%'
 join public.agentes_ia a on a.id=mt.agente_id and a.sala='marketing' and a.nome in ('Bia','Theo','Alex')
 where mt.id=_tarefa and mt.estado='concluida' for update of mt;
 if not found or length(coalesce(t.resultado->>'entrega',''))<20 then return null; end if;
 if t.nome='Bia' and not coalesce(t.resultado->'ferramentas' ? 'pesquisar_concorrentes_publicos',false) then return null; end if;
 select material_id into artefato from marketing_privado.ia_entregas where tarefa_id=_tarefa;
 if artefato is not null then return artefato; end if;
 begin
  insert into public.mkt_itens(tipo,titulo,descricao,status,responsavel_id,criado_por,dados)
  values('pesquisa',t.nome||' · '||case t.nome when 'Bia' then 'Referências públicas' when 'Theo' then 'Análise e estratégia' else 'Diagnóstico da integração' end||' · '||to_char(now() at time zone 'America/Cuiaba','DD/MM/YYYY'),
   left(t.resultado->>'entrega',20000)||E'\n\nRelatório de IA para revisão. A conclusão da análise não comprova a execução de ajustes. Horário do cadastro não substitui a data da fonte ou da última coleta.',
   'revisao',t.solicitada_por,t.solicitada_por,jsonb_build_object('origem_ia',true,'tarefa_ia_id',t.id,'missao_id',t.missao_id,'agente',t.nome,'pendencias',coalesce(t.resultado->'pendencias','[]'::jsonb))) returning id into artefato;
  insert into marketing_privado.ia_entregas(tarefa_id,material_id) values(_tarefa,artefato)
   on conflict(tarefa_id) do update set material_id=excluded.material_id,erro=null;
  insert into public.mkt_auditoria(item_id,entidade,entidade_id,acao,depois)
   values(artefato,'ia_entrega',_tarefa,'cadastro_automatico',jsonb_build_object('agente',t.nome,'missao_id',t.missao_id));
  return artefato;
 exception when others then
  insert into marketing_privado.ia_entregas(tarefa_id,erro) values(_tarefa,'relatorio_invalido:'||sqlstate)
   on conflict(tarefa_id) do update set erro=excluded.erro;
  return null;
 end;
end;$$;
revoke all on function marketing_privado.cadastrar_relatorio_ia(uuid) from public,anon,authenticated;
grant execute on function marketing_privado.cadastrar_relatorio_ia(uuid) to service_role;
create function marketing_privado.ao_concluir_relatorio_ia() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.estado='concluida' and old.estado is distinct from 'concluida' then perform marketing_privado.cadastrar_relatorio_ia(new.id); end if;
 return new;
end;$$;
revoke all on function marketing_privado.ao_concluir_relatorio_ia() from public,anon,authenticated;
create trigger marketing_cadastrar_relatorio_ia after update of estado on escritorio_privado.missao_tarefas
 for each row execute function marketing_privado.ao_concluir_relatorio_ia();
