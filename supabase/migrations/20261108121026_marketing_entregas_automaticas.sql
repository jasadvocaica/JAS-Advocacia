-- Materializa somente entregas das rotinas de Marketing. Não publica nem chama provedores.
create table marketing_privado.ia_entregas (
 tarefa_id uuid primary key references escritorio_privado.missao_tarefas(id),
 pauta_id uuid references public.mkt_itens(id), conteudo_id uuid references public.mkt_itens(id),
 erro text, criada_em timestamptz not null default now()
);
alter table marketing_privado.ia_entregas enable row level security;
revoke all on marketing_privado.ia_entregas from public,anon,authenticated;
grant all on marketing_privado.ia_entregas to service_role;

-- Tarefas administrativas pertencem ao conteúdo, não a um cliente fictício.
alter table public.controladoria_itens add column marketing_item_id uuid references public.mkt_itens(id);
alter table public.controladoria_itens drop constraint controladoria_itens_exige_vinculo_check;
alter table public.controladoria_itens add constraint controladoria_itens_exige_vinculo_check
 check(cliente_id is not null or processo_id is not null or (marketing_item_id is not null and tipo='tarefa' and origem='fluxo_automatico'));
create unique index controladoria_marketing_versao_idx on public.controladoria_itens(marketing_item_id, (orientacoes))
 where marketing_item_id is not null;

create function marketing_privado.cadastrar_entrega_ia(_tarefa uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare t record; j jsonb; p uuid; c uuid; texto text; titulo text;
begin
 select mt.*,m.solicitada_por,a.nome into t from escritorio_privado.missao_tarefas mt
 join escritorio_privado.missoes m on m.id=mt.missao_id join public.agentes_ia a on a.id=mt.agente_id
 where mt.id=_tarefa and mt.estado='concluida' and m.chave like 'auto-mkt:%'
 and a.sala='marketing' and a.nome='Camila' for update of mt;
 if not found then return null; end if;
 select pauta_id into p from marketing_privado.ia_entregas where tarefa_id=_tarefa;
 if p is not null then return p; end if;
 begin
  j:=(t.resultado->>'entrega')::jsonb;
  if jsonb_typeof(j)<>'object' or exists(select 1 from unnest(array['titulo','publico','objetivo','gancho','legenda','roteiro','brief_visual','revisao_necessaria']) k
   where jsonb_typeof(j->k) is distinct from 'string' or length(trim(j->>k))<3) then
   raise exception 'Entrega sem os campos editoriais obrigatórios';
  end if;
  titulo:=left(j->>'titulo',250);
  texto:=concat_ws(E'\n\n','Público: '||(j->>'publico'),'Objetivo: '||(j->>'objetivo'),
   'Gancho: '||(j->>'gancho'),'Legenda: '||(j->>'legenda'),'Roteiro: '||(j->>'roteiro'),
   'Brief visual: '||(j->>'brief_visual'),'Conferência pendente: '||(j->>'revisao_necessaria'),
   'Rascunho produzido por IA. Aprovação da pauta não autoriza publicação do material final.');
  insert into public.mkt_itens(tipo,titulo,descricao,status,responsavel_id,criado_por,canal,formato,dados)
   values('pauta',titulo,texto,'aguardando_aprovacao',t.solicitada_por,t.solicitada_por,'instagram','reels',
    jsonb_build_object('origem_ia',true,'missao_id',t.missao_id,'tarefa_ia_id',t.id,'publico',j->>'publico','objetivo',j->>'objetivo','observacoes',texto)) returning id into p;
  insert into public.mkt_itens(tipo,titulo,descricao,status,responsavel_id,criado_por,origem_id,canal,formato,dados)
   values('conteudo',titulo,texto,'revisao',t.solicitada_por,t.solicitada_por,p,'instagram','reels',
    jsonb_build_object('origem_ia',true,'missao_id',t.missao_id,'tarefa_ia_id',t.id,'texto',j->>'roteiro','legenda',j->>'legenda',
      'orientacoes_visuais',j->>'brief_visual','revisao_necessaria',j->>'revisao_necessaria','checklist','{}'::jsonb)) returning id into c;
  insert into public.mkt_versoes(item_id,versao,etapa,snapshot,criado_por)
   select id,versao,'material',to_jsonb(i),t.solicitada_por from public.mkt_itens i where id=p;
  insert into marketing_privado.ia_entregas(tarefa_id,pauta_id,conteudo_id) values(_tarefa,p,c)
   on conflict(tarefa_id) do update set pauta_id=excluded.pauta_id,conteudo_id=excluded.conteudo_id,erro=null;
  insert into public.mkt_auditoria(item_id,entidade,entidade_id,acao,depois)
   values(p,'ia_entrega',_tarefa,'cadastro_automatico',jsonb_build_object('conteudo_id',c,'missao_id',t.missao_id));
  return p;
 exception when others then
  -- Erro sanitizado, sem conteúdo de prompts ou resposta do provedor.
  insert into marketing_privado.ia_entregas(tarefa_id,erro) values(_tarefa,'entrega_editorial_invalida:'||sqlstate)
   on conflict(tarefa_id) do update set erro=excluded.erro;
  return null;
 end;
end;$$;
revoke all on function marketing_privado.cadastrar_entrega_ia(uuid) from public,anon,authenticated;
grant execute on function marketing_privado.cadastrar_entrega_ia(uuid) to service_role;
create function marketing_privado.ao_concluir_entrega_ia() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.estado='concluida' and old.estado is distinct from 'concluida' then
  perform marketing_privado.cadastrar_entrega_ia(new.id);
 end if;
 return new;
end;$$;
revoke all on function marketing_privado.ao_concluir_entrega_ia() from public,anon,authenticated;
create trigger marketing_cadastrar_entrega_ia after update of estado on escritorio_privado.missao_tarefas
 for each row execute function marketing_privado.ao_concluir_entrega_ia();

create function marketing_privado.encaminhar_execucao_aprovada() returns trigger
language plpgsql security definer set search_path='' as $$
declare p uuid; c record; versao text;
begin
 if new.dados->>'origem_ia' is distinct from 'true' then return new; end if;
 -- Qualquer edição invalida a tarefa pendente da versão anterior.
 if new.versao is distinct from old.versao or new.status in ('ajustes','rejeitado') then
  update public.controladoria_itens set status='cancelado',cancelado_motivo='Conteúdo alterado; exige nova aprovação.'
   where marketing_item_id=new.id and status in ('pendente','aguardando');
 end if;
 if new.tipo='pauta' and new.status='aprovado' and new.versao_aprovada=new.versao
  and (old.status is distinct from new.status or old.versao_aprovada is distinct from new.versao_aprovada) then
  update public.mkt_itens set pauta_id=new.id where origem_id=new.id and dados->>'origem_ia'='true' and pauta_id is null;
  for c in select * from public.mkt_itens where origem_id=new.id and dados->>'origem_ia'='true' loop
   insert into public.controladoria_itens(titulo,tipo,status,prioridade,data_vencimento,responsavel_id,criado_por,origem,descricao,marketing_item_id,orientacoes)
    values(left('Marketing · produzir e revisar: '||c.titulo,250),'tarefa','pendente','media',now()+interval '2 days',c.responsavel_id,new.criado_por,'fluxo_automatico',
     'Pauta aprovada. Produzir o material, conferir informações e encaminhar a versão final para aprovação no Marketing. NÃO publicar nesta etapa. Meta administrativa de dois dias, não prazo jurídico. https://app.julianaaraujoadvocacia.com/marketing'||E'\nConteúdo: '||c.id,c.id,'producao:'||new.id||':v'||new.versao)
    on conflict do nothing;
  end loop;
 elsif new.tipo in ('conteudo','artigo','roteiro') and new.status='aprovado' and new.versao_aprovada=new.versao
  and (old.status is distinct from new.status or old.versao_aprovada is distinct from new.versao_aprovada) then
  -- Só uma decisão humana registrada para esta versão habilita encaminhamento.
  if exists(select 1 from public.mkt_decisoes d where d.item_id=new.id and d.versao=new.versao and d.resultado='aprovado' and d.etapa='material' and d.usuario_id is not null) then
   insert into public.controladoria_itens(titulo,tipo,status,prioridade,data_vencimento,responsavel_id,criado_por,origem,descricao,marketing_item_id,orientacoes)
    values(left('Marketing · executar publicação aprovada: '||new.titulo,250),'tarefa','pendente','media',coalesce(new.data_prevista,now()+interval '2 days'),new.responsavel_id,new.criado_por,'fluxo_automatico',
     'Executar somente o material final aprovado, versão '||new.versao||'. Conferir arquivo e canal no Marketing. Nenhum envio foi realizado por esta automação. Meta administrativa; não prazo jurídico. https://app.julianaaraujoadvocacia.com/marketing'||E'\nConteúdo: '||new.id,new.id,'publicacao:v'||new.versao)
    on conflict do nothing;
  end if;
 end if;
 return new;
end;$$;
revoke all on function marketing_privado.encaminhar_execucao_aprovada() from public,anon,authenticated;
create trigger marketing_encaminhar_execucao after update on public.mkt_itens
 for each row execute function marketing_privado.encaminhar_execucao_aprovada();
