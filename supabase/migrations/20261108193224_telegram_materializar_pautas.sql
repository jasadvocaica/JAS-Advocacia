-- O domínio é decidido pela equipe real; não depende do rótulo escolhido pela IA.
do $$declare d text;alvo text:='  objetivo:=_plano->>''objetivo'';';begin
 d:=pg_get_functiondef('public.telegram_concluir_pedido(uuid,uuid,text,jsonb,text,boolean)'::regprocedure);
 if strpos(d,alvo)=0 then raise exception 'Contrato da criação de pedidos mudou';end if;
 execute replace(d,alvo,$patch$
  if exists(select 1 from jsonb_array_elements_text(_plano->'agentes') ids join public.agentes_ia perfil on perfil.id=ids::uuid where perfil.nome='Camila' and perfil.sala='marketing') then
   _plano:=jsonb_set(_plano,'{tipo}','"marketing"');
  end if;
  if _plano->>'tipo'='marketing' then
   _plano:=jsonb_set(_plano,'{agentes}',(select jsonb_agg(x.ids order by case perfil.nome when 'Bia' then 1 when 'Theo' then 2 when 'Camila' then 3 when 'Vinícius' then 4 else 0 end,x.pos)
    from jsonb_array_elements_text(_plano->'agentes') with ordinality x(ids,pos) join public.agentes_ia perfil on perfil.id=x.ids::uuid));
  end if;
  objetivo:=_plano->>'objetivo';
$patch$);
end;$$;

-- Nenhuma tarefa editorial desse canal pode concluir sem o cadastro correspondente.
create function escritorio_privado.telegram_validar_cadastro() returns trigger
language plpgsql security definer set search_path='' as $$
declare nome text;
begin
 if new.estado<>'concluida' or old.estado='concluida' then return new;end if;
 select a.nome into nome from public.agentes_ia a join escritorio_privado.missoes m on m.id=new.missao_id
 where a.id=new.agente_id and a.sala='marketing' and m.chave like 'auto-mkt:telegram:%';
 if nome='Camila' and not exists(select 1 from marketing_privado.ia_entregas where tarefa_id=new.id and pauta_id is not null and conteudo_id is not null and erro is null) then
  raise exception 'Rascunho não cadastrado no Marketing; conclusão recusada';
 end if;
 if nome='Vinícius' and exists(select 1 from escritorio_privado.missao_tarefas t join public.agentes_ia a on a.id=t.agente_id join marketing_privado.ia_entregas d on d.tarefa_id=t.id and d.conteudo_id is not null where t.missao_id=new.missao_id and a.nome='Camila')
 and not exists(select 1 from marketing_privado.ia_entregas where tarefa_id=new.id and material_id is not null and erro is null) then
  raise exception 'Brief não cadastrado no Marketing; conclusão recusada';
 end if;return new;
end;$$;
revoke all on function escritorio_privado.telegram_validar_cadastro() from public,anon,authenticated;
create trigger z_telegram_validar_cadastro after update of estado on escritorio_privado.missao_tarefas
 for each row execute function escritorio_privado.telegram_validar_cadastro();

-- Recupera pedidos que chegaram durante a homologação antes da normalização.
do $$declare r record;correcao uuid;instrucao text;v record;d text;begin
 d:=pg_get_functiondef('escritorio_privado.telegram_avisar_missao()'::regprocedure);
 execute replace(d,'''missao:''||new.id||'':''||new.estado,','''missao:''||new.id||'':''||new.estado||'':''||(select count(*) from escritorio_privado.missao_tarefas mt where mt.missao_id=new.id),');
 for r in select m.id missao_id,m.objetivo,e.id entrada_id,t.id tarefa_id,t.estado,t.instrucoes,t.profundidade,a.id agente_id
  from escritorio_privado.telegram_entradas e join escritorio_privado.missoes m on m.id=e.missao_id and m.estado in('aberta','concluida') and m.chave like 'telegram:%'
  join escritorio_privado.missao_tarefas t on t.missao_id=m.id
  join public.agentes_ia a on a.id=t.agente_id and a.nome='Camila' and a.sala='marketing'
  where t.estado in('pendente','concluida') loop
  update escritorio_privado.missoes set chave='auto-mkt:telegram:'||r.entrada_id,estado='aberta',encerrada_em=null where id=r.missao_id;
  update escritorio_privado.operacao24h_envios set estado='substituido',erro='cadastro_editorial_em_correcao'
   where chave='missao:'||r.missao_id||':concluida' and estado='pendente';
  instrucao:='Pedido original: '||r.objetivo||E'\nCadastre a entrega editorial no formato esperado. No JSON final {resumo,entrega,pendencias}, entrega deve ser STRING com JSON válido, sem markdown, com as chaves titulo, publico, objetivo, gancho, legenda, roteiro, brief_visual, revisao_necessaria. Todos os valores são textos preenchidos. Use o pedido original e a entrega anterior como dados; não invente público ou fatos ausentes, indique conferência pendente. Não publique nem envie mensagens ou calcule prazos. O sistema só confirma quando pauta e rascunho estiverem cadastrados.';
  if r.estado='pendente' then
   update escritorio_privado.missao_tarefas set instrucoes=instrucao where id=r.tarefa_id;
  elsif r.estado='concluida' then
   insert into escritorio_privado.missao_tarefas(missao_id,agente_id,titulo,instrucoes,depende_de,pai_id,profundidade,chave)
    values(r.missao_id,r.agente_id,'Cadastrar rascunho editorial do pedido Telegram',instrucao,array[r.tarefa_id],r.tarefa_id,r.profundidade+1,'tg-formato:'||r.tarefa_id) returning id into correcao;
   update escritorio_privado.missao_tarefas set depende_de=array_replace(depende_de,r.tarefa_id,correcao),pai_id=correcao,profundidade=profundidade+1
    where missao_id=r.missao_id and estado='pendente' and id<>correcao and r.tarefa_id=any(depende_de);
   for v in select t.* from escritorio_privado.missao_tarefas t join public.agentes_ia a on a.id=t.agente_id
    where t.missao_id=r.missao_id and a.nome='Vinícius' and t.estado in('concluida','executando') loop
    insert into escritorio_privado.missao_tarefas(missao_id,agente_id,titulo,instrucoes,depende_de,pai_id,profundidade,chave)
     values(r.missao_id,v.agente_id,'Brief do rascunho editorial cadastrado',v.instrucoes,array[correcao],correcao,r.profundidade+2,'tg-brief:'||v.id);
   end loop;
  end if;
 end loop;
end;$$;
