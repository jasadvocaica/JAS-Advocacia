-- Consulta administrativa de metadados usando a fila e o executor Zernio existentes.
-- Não altera relógio de sincronização, autorizações de formulário ou ações externas.
create function public.mkt_consulta_meta_criar(_usuario uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare v_id uuid;
begin
 if current_user<>'service_role' or not public.is_gestor(_usuario) or not public.is_interno_ativo(_usuario) then raise exception 'Somente administração pelo backend' using errcode='42501'; end if;
 if not exists(select 1 from marketing_privado.zernio_conexoes where estado='conectado' and coleta_ativa) then raise exception 'Conexão de coleta ativa necessária'; end if;
 if not exists(select 1 from marketing_privado.zernio_contas where plataforma='metaads' and ativa and selecionada and not precisa_reconectar) then raise exception 'Conta Meta Ads selecionada necessária'; end if;
 perform pg_advisory_xact_lock(hashtext('jas.marketing.consulta-meta'));
 select id into v_id from marketing_privado.zernio_sync_jobs where estado in ('pendente','executando');
 if v_id is not null then
  if exists(select 1 from marketing_privado.zernio_sync_jobs where id=v_id and cursores->>'consulta_meta'='true') then return v_id; end if;
  raise exception 'Aguarde a sincronização existente antes de consultar metadados';
 end if;
 insert into marketing_privado.zernio_sync_jobs(origem,solicitado_por,cursores,max_tentativas)
 values('manual',_usuario,'{"consulta_meta":true}'::jsonb,2) returning id into v_id;
 return v_id;
end;$$;
create function public.mkt_consulta_meta_finalizar(_job uuid,_resultado jsonb default null,_erro text default null) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 if current_user<>'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
 if _erro is not null and _erro not in ('consulta_meta_falhou','consulta_meta_invalida') then raise exception 'Código de erro inválido'; end if;
 if _erro is null and (jsonb_typeof(_resultado->'contas') is distinct from 'array' or length(_resultado::text)>100000) then raise exception 'Metadados inválidos'; end if;
 update marketing_privado.zernio_sync_jobs set estado=case when _erro is null then 'concluido' else 'falhou' end,
  progresso=case when _erro is null then jsonb_build_object('consulta_meta',_resultado) else '{}'::jsonb end,
  erro=_erro,reservado_ate=null,finalizado_em=now(),etapa_atual='consulta_meta'
 where id=_job and estado='executando' and cursores->>'consulta_meta'='true';
 return found;
end;$$;
revoke all on function public.mkt_consulta_meta_criar(uuid),public.mkt_consulta_meta_finalizar(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.mkt_consulta_meta_criar(uuid),public.mkt_consulta_meta_finalizar(uuid,jsonb,text) to service_role;
