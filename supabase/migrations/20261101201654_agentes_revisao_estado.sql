create or replace function public.escritorio_alterar_agente(_usuario uuid,_agente uuid,_acao text,_sala text default null,_ativo boolean default null) returns boolean
language plpgsql security invoker set search_path='' as $$
declare a public.agentes_ia;c escritorio_privado.agente_configuracoes;v_dados jsonb;
begin
 if not public.is_interno_ativo(_usuario) or not public.is_gestor(_usuario) then raise exception 'Gestor ativo necessário' using errcode='42501';end if;
 select * into a from public.agentes_ia where id=_agente and supervisor_id=_usuario and executor='analista_operacional' for update;
 if not found then raise exception 'Agente indisponível para esta supervisora' using errcode='42501';end if;
 if _acao='mover' then
  if _sala is null or _sala not in ('diretoria','operacional','comercial','reuniao','diligencias','marketing') then raise exception 'Sala inválida';end if;
  update public.agentes_ia set sala=_sala where id=a.id and supervisor_id=_usuario;
 elsif _acao='alternar' then
  if _ativo is null then raise exception 'Estado inválido';end if;
  update public.agentes_ia set ativo=_ativo where id=a.id and supervisor_id=_usuario;
 else raise exception 'Ação inválida';end if;
 select * into c from escritorio_privado.agente_configuracoes where agente_id=a.id for update;
 if found then
  v_dados:=case when _acao='mover' then jsonb_set(c.dados,'{sala}',to_jsonb(_sala)) else jsonb_set(c.dados,'{ativo}',to_jsonb(_ativo)) end;
  update escritorio_privado.agente_configuracoes set dados=v_dados,revisao=revisao+1,atualizado_por=_usuario,atualizado_em=now() where agente_id=a.id returning * into c;
  insert into escritorio_privado.agente_config_historico(agente_id,revisao,dados,atualizado_por) values(a.id,c.revisao,c.dados,_usuario);
 end if;
 return true;
end;$$;
revoke all on function public.escritorio_alterar_agente(uuid,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.escritorio_alterar_agente(uuid,uuid,text,text,boolean) to service_role;
