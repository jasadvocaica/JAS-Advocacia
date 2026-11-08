alter table marketing_privado.ia_entregas add column material_id uuid references public.mkt_itens(id);
create function marketing_privado.revisar_pauta_ia() returns trigger
language plpgsql security definer set search_path='' as $$
declare i public.mkt_itens;
begin
 if new.pauta_id is null or new.erro is not null then return new; end if;
 select * into i from public.mkt_itens where id=new.pauta_id and tipo='pauta';
 if not found then return new; end if;
 insert into public.controladoria_itens(titulo,tipo,status,prioridade,data_vencimento,responsavel_id,criado_por,origem,descricao,marketing_item_id,orientacoes,etapa_workflow)
 values(left('Marketing · aprovar pauta: '||i.titulo,250),'tarefa','pendente','media',now()+interval '2 days',i.responsavel_id,i.criado_por,'fluxo_automatico',
  'Revisar a pauta e o rascunho cadastrado no Marketing. Aprovar, pedir ajustes ou rejeitar na central de aprovações. Esta tarefa NÃO autoriza publicação. Meta administrativa de dois dias, não prazo jurídico. https://app.julianaaraujoadvocacia.com/marketing'||E'\nPauta: '||i.id,i.id,'revisao:v'||i.versao,'revisao')
 on conflict do nothing;
 return new;
end;$$;
revoke all on function marketing_privado.revisar_pauta_ia() from public,anon,authenticated;
create trigger marketing_revisar_pauta_ia after insert or update of pauta_id on marketing_privado.ia_entregas
 for each row execute function marketing_privado.revisar_pauta_ia();

create function marketing_privado.cadastrar_brief_ia() returns trigger
language plpgsql security definer set search_path='' as $$
declare e record; material uuid;
begin
 if new.estado<>'concluida' or old.estado='concluida' or length(coalesce(new.resultado->>'entrega',''))<20 then return new; end if;
 select d.*,m.solicitada_por into e from escritorio_privado.missao_tarefas t
 join public.agentes_ia a on a.id=t.agente_id and a.nome='Vinícius' and a.sala='marketing'
 join escritorio_privado.missoes m on m.id=t.missao_id and m.chave like 'auto-mkt:%'
 join escritorio_privado.missao_tarefas anterior on anterior.missao_id=m.id and anterior.id=any(t.depende_de)
 join marketing_privado.ia_entregas d on d.tarefa_id=anterior.id and d.conteudo_id is not null
 where t.id=new.id and not exists(select 1 from marketing_privado.ia_entregas where tarefa_id=new.id) limit 1;
 if not found then return new; end if;
 insert into public.mkt_itens(tipo,titulo,descricao,status,responsavel_id,criado_por,origem_id,dados)
 select 'material',left('Brief de produção · '||titulo,250),new.resultado->>'entrega','revisao',e.solicitada_por,e.solicitada_por,id,
  jsonb_build_object('origem_ia',true,'tarefa_ia_id',new.id,'missao_id',new.missao_id,'observacoes','Brief textual. Não comprova geração de imagem ou vídeo.') from public.mkt_itens where id=e.conteudo_id returning id into material;
 insert into marketing_privado.ia_entregas(tarefa_id,pauta_id,conteudo_id,material_id) values(new.id,e.pauta_id,e.conteudo_id,material) on conflict do nothing;
 return new;
end;$$;
revoke all on function marketing_privado.cadastrar_brief_ia() from public,anon,authenticated;
create trigger marketing_cadastrar_brief_ia after update of estado on escritorio_privado.missao_tarefas
 for each row execute function marketing_privado.cadastrar_brief_ia();

-- Uma alteração da pauta também suspende produção pendente originada dela.
create function marketing_privado.invalidar_producao_pauta_ia() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.tipo='pauta' and new.dados->>'origem_ia'='true'
 and (new.versao is distinct from old.versao or new.status in ('ajustes','rejeitado','arquivado')) then
  update public.controladoria_itens set status='cancelado',cancelado_motivo='Pauta alterada ou retirada; exige nova aprovação.'
   where marketing_item_id in(select id from public.mkt_itens where origem_id=new.id)
   and orientacoes like 'producao:'||new.id||':%' and status in ('pendente','aguardando','em_andamento');
 end if;
 return new;
end;$$;
revoke all on function marketing_privado.invalidar_producao_pauta_ia() from public,anon,authenticated;
create trigger marketing_invalidar_producao_pauta_ia after update on public.mkt_itens
 for each row execute function marketing_privado.invalidar_producao_pauta_ia();
