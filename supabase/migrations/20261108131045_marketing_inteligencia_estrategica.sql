create table marketing_privado.ia_inteligencia (
 tarefa_id uuid primary key references escritorio_privado.missao_tarefas(id), item_id uuid not null references public.mkt_itens(id),
 dados jsonb not null check(jsonb_typeof(dados)='object' and octet_length(dados::text)<=100000), criado_em timestamptz not null default now()
);
create table marketing_privado.ia_estrategias (
 tarefa_id uuid primary key references escritorio_privado.missao_tarefas(id), planejamento_id uuid references public.mkt_itens(id),
 anuncio_id uuid references public.mkt_itens(id), artigo_id uuid references public.mkt_itens(id), tiktok_id uuid references public.mkt_itens(id),
 erro text, criado_em timestamptz not null default now()
);
create table marketing_privado.ia_referencias (
 tarefa_id uuid primary key references escritorio_privado.missao_tarefas(id), dados jsonb not null, criado_em timestamptz not null default now()
);
alter table marketing_privado.ia_referencias enable row level security;
revoke all on marketing_privado.ia_referencias from public,anon,authenticated;
grant all on marketing_privado.ia_referencias to service_role;
alter table marketing_privado.ia_inteligencia enable row level security;
alter table marketing_privado.ia_estrategias enable row level security;
revoke all on marketing_privado.ia_inteligencia,marketing_privado.ia_estrategias from public,anon,authenticated;
grant all on marketing_privado.ia_inteligencia,marketing_privado.ia_estrategias to service_role;
insert into escritorio_privado.ferramentas(slug,nome,descricao,classe,modulo) values
 ('pesquisar_tendencias_marketing','Pesquisar mercado e palavras-chave','Fontes RSS públicas; separa tendências, notícias e sementes editoriais, sem CRM ou listas de pessoas.','leitura','marketing');
insert into escritorio_privado.agente_ferramentas(agente_id,ferramenta,concedida_por)
 select id,'pesquisar_tendencias_marketing',supervisor_id from public.agentes_ia
 where nome='Bia' and sala='marketing' and ativo and public.is_gestor(supervisor_id) and public.is_interno_ativo(supervisor_id) on conflict do nothing;

create function public.mkt_registrar_inteligencia(_tarefa uuid,_dados jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare t record; item uuid;
begin
 if current_user<>'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
 if public.motor_ferramenta_permitida(_tarefa,'pesquisar_tendencias_marketing') is distinct from 'leitura' then raise exception 'Pesquisa não autorizada' using errcode='42501'; end if;
 select mt.*,m.solicitada_por into t from escritorio_privado.missao_tarefas mt
 join escritorio_privado.missoes m on m.id=mt.missao_id and m.chave like 'auto-mkt:%'
 join public.agentes_ia a on a.id=mt.agente_id and a.nome='Bia' and a.sala='marketing'
 where mt.id=_tarefa and mt.estado='executando' for update of mt;
 if not found then raise exception 'Tarefa de Marketing indisponível'; end if;
 if jsonb_typeof(_dados) is distinct from 'object' or octet_length(_dados::text)>100000
  or jsonb_typeof(_dados->'palavras_semente') is distinct from 'array'
  or jsonb_typeof(_dados->'fontes') is distinct from 'array'
  or _dados ?| array['leads','clientes','emails','telefones','lista_clientes'] then raise exception 'Formato de pesquisa inválido'; end if;
 select item_id into item from marketing_privado.ia_inteligencia where tarefa_id=_tarefa;
 if item is not null then return item; end if;
 insert into public.mkt_itens(tipo,titulo,descricao,status,responsavel_id,criado_por,dados)
 values('pesquisa','Palavras-chave e sinais públicos · '||to_char(now() at time zone 'America/Cuiaba','DD/MM/YYYY'),
  'Pesquisa pública registrada pela Bia. Palavras-chave são sementes editoriais; volumes mensais, CPC e concorrência não foram medidos. Consulte o painel de Inteligência de Mercado para fontes, datas e falhas de cobertura. Nenhuma lista de leads foi usada.',
  'revisao',t.solicitada_por,t.solicitada_por,jsonb_build_object('origem_ia',true,'categoria','referencia','tarefa_ia_id',_tarefa,'resultado_mercado',_dados)) returning id into item;
 insert into marketing_privado.ia_inteligencia(tarefa_id,item_id,dados) values(_tarefa,item,_dados);
 return item;
end;$$;
revoke all on function public.mkt_registrar_inteligencia(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.mkt_registrar_inteligencia(uuid,jsonb) to service_role;
create function public.mkt_registrar_referencias(_tarefa uuid,_dados jsonb) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 if current_user<>'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
 if public.motor_ferramenta_permitida(_tarefa,'pesquisar_concorrentes_publicos') is distinct from 'leitura'
  or not exists(select 1 from escritorio_privado.missao_tarefas t join escritorio_privado.missoes m on m.id=t.missao_id and m.chave like 'auto-mkt:%' join public.agentes_ia a on a.id=t.agente_id and a.nome='Bia' and a.sala='marketing' where t.id=_tarefa and t.estado='executando') then raise exception 'Pesquisa não autorizada' using errcode='42501'; end if;
 if jsonb_typeof(_dados->'fontes') is distinct from 'array' or octet_length(_dados::text)>100000 then raise exception 'Referências inválidas'; end if;
 insert into marketing_privado.ia_referencias(tarefa_id,dados) values(_tarefa,_dados) on conflict do nothing;
 return true;
end;$$;
revoke all on function public.mkt_registrar_referencias(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.mkt_registrar_referencias(uuid,jsonb) to service_role;

create function marketing_privado.cadastrar_estrategia_ia(_tarefa uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare t record; j jsonb; plano uuid; anuncio uuid; artigo uuid; video uuid; palavras jsonb; publico text:='Proposta: público amplo por região a definir ou contexto da busca. Sem listas de leads, público semelhante ou inferência de condição sensível. Nenhum público criado na plataforma.';
begin
 select mt.*,m.solicitada_por into t from escritorio_privado.missao_tarefas mt
 join escritorio_privado.missoes m on m.id=mt.missao_id and m.chave like 'auto-mkt:concorrentes:%'
 join public.agentes_ia a on a.id=mt.agente_id and a.nome='Theo' and a.sala='marketing'
 where mt.id=_tarefa and mt.estado='concluida' for update of mt;
 if not found then return null; end if;
 select planejamento_id into plano from marketing_privado.ia_estrategias where tarefa_id=_tarefa;
 if plano is not null then return plano; end if;
 begin
  j:=marketing_privado.ler_entrega_json(t.resultado->>'entrega');
  if exists(select 1 from unnest(array['tema','hipotese']) k where jsonb_typeof(j->k) is distinct from 'string' or length(j->>k)<3)
   or jsonb_typeof(j->'anuncio') is distinct from 'object' or jsonb_typeof(j->'palavras_chave') is distinct from 'array'
   or jsonb_array_length(j->'palavras_chave') not between 1 and 12 then raise exception 'Estratégia incompleta'; end if;
  if exists(select 1 from jsonb_array_elements(j->'palavras_chave') p where jsonb_typeof(p)<>'string' or length(p#>>'{}')>100)
   or exists(select 1 from unnest(array['titulo','texto','descricao']) k where jsonb_typeof(j->'anuncio'->k) is distinct from 'string' or length(j->'anuncio'->>k)<3) then raise exception 'Anúncio ou sementes inválidos'; end if;
  if (j->'anuncio'->>'texto') ~* '(voc[eê]|seu filho|sua filha).{0,60}(autista|defici[eê]ncia|doen[cç]a|recebe bpc)' then raise exception 'Texto presume condição sensível'; end if;
  palavras:=j->'palavras_chave';
  insert into public.mkt_itens(tipo,titulo,descricao,status,responsavel_id,criado_por,dados)
   values('planejamento',left('Estratégia · '||(j->>'tema'),250),concat_ws(E'\n\n',j->>'hipotese','Palavras-chave sugeridas: '||palavras::text,publico,'Hipótese para aprovação. Não é previsão de resultado. Orçamento e criação de campanha exigem decisões separadas.'),
    'aguardando_aprovacao',t.solicitada_por,t.solicitada_por,jsonb_build_object('origem_ia',true,'tarefa_ia_id',t.id,'objetivo',j->>'hipotese','palavras_chave',palavras,'publico_proposto',publico,'listas_utilizadas',false,'orcamento_autorizado',null)) returning id into plano;
  insert into public.mkt_itens(tipo,titulo,descricao,status,responsavel_id,criado_por,origem_id,canal,dados)
   values('ideia',left('Anúncio proposto · '||(j->'anuncio'->>'titulo'),250),concat_ws(E'\n\n',j->'anuncio'->>'texto',j->'anuncio'->>'descricao',publico,'Rascunho interno; não foi criado anúncio, campanha ou público externo. Conferir texto e aprovar antes de qualquer execução.'),
    'aguardando_aprovacao',t.solicitada_por,t.solicitada_por,plano,'meta_ads',jsonb_build_object('origem_ia',true,'tipo_peca','rascunho_anuncio','tarefa_ia_id',t.id,'texto',j->'anuncio'->>'texto','titulo_anuncio',j->'anuncio'->>'titulo','descricao_anuncio',j->'anuncio'->>'descricao','palavras_chave',palavras,'publico_proposto',publico,'estado_externo','nao_criado','audiencia_externa_id',null,'listas_utilizadas',false)) returning id into anuncio;
  insert into public.mkt_versoes(item_id,versao,etapa,snapshot,criado_por) select id,versao,'material',to_jsonb(i),t.solicitada_por from public.mkt_itens i where id in(plano,anuncio);
  if jsonb_typeof(j->'artigo')='object' and length(j->'artigo'->>'titulo')>3 then
   insert into public.mkt_itens(tipo,titulo,descricao,status,responsavel_id,criado_por,origem_id,canal,dados)
    values('artigo',left('Pauta de artigo · '||(j->'artigo'->>'titulo'),250),'Estrutura proposta, não artigo completo nem publicado: '||(j->'artigo'->>'subtitulos'),'rascunho',t.solicitada_por,t.solicitada_por,plano,'site',
     jsonb_build_object('origem_ia',true,'tarefa_ia_id',t.id,'palavra_chave',j->'artigo'->>'palavra_chave','subtitulos',j->'artigo'->>'subtitulos','wordpress_publicado',false,'checklist','{}'::jsonb)) returning id into artigo;
  end if;
  if jsonb_typeof(j->'tiktok')='object' and length(j->'tiktok'->>'roteiro')>10 then
   insert into public.mkt_itens(tipo,titulo,descricao,status,responsavel_id,criado_por,origem_id,canal,formato,dados)
    values('roteiro',left('Vídeo curto · '||(j->>'tema'),250),j->'tiktok'->>'roteiro','revisao',t.solicitada_por,t.solicitada_por,plano,'tiktok','reels',
     jsonb_build_object('origem_ia',true,'tarefa_ia_id',t.id,'gancho',j->'tiktok'->>'gancho','cenas',j->'tiktok'->>'roteiro','duracao',30,'checklist','{}'::jsonb)) returning id into video;
  end if;
  insert into marketing_privado.ia_estrategias(tarefa_id,planejamento_id,anuncio_id,artigo_id,tiktok_id) values(_tarefa,plano,anuncio,artigo,video)
   on conflict(tarefa_id) do update set planejamento_id=excluded.planejamento_id,anuncio_id=excluded.anuncio_id,artigo_id=excluded.artigo_id,tiktok_id=excluded.tiktok_id,erro=null;
  return plano;
 exception when others then
  insert into marketing_privado.ia_estrategias(tarefa_id,erro) values(_tarefa,'estrategia_invalida:'||sqlstate) on conflict(tarefa_id) do update set erro=excluded.erro;
  return null;
 end;
end;$$;
revoke all on function marketing_privado.cadastrar_estrategia_ia(uuid) from public,anon,authenticated;
grant execute on function marketing_privado.cadastrar_estrategia_ia(uuid) to service_role;
create function marketing_privado.ao_concluir_estrategia_ia() returns trigger language plpgsql security definer set search_path='' as $$
begin if new.estado='concluida' and old.estado is distinct from 'concluida' then perform marketing_privado.cadastrar_estrategia_ia(new.id); end if; return new; end;$$;
revoke all on function marketing_privado.ao_concluir_estrategia_ia() from public,anon,authenticated;
create trigger marketing_z_estrategia_ia after update of estado on escritorio_privado.missao_tarefas for each row execute function marketing_privado.ao_concluir_estrategia_ia();

create function marketing_privado.inteligencia_mercado() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_interno_ativo(auth.uid()) or not marketing_privado.pode('visualizar') then raise exception 'Sem acesso ao Marketing' using errcode='42501'; end if;
 return jsonb_build_object('pesquisas',(select coalesce(jsonb_agg(x),'[]') from(select item_id,dados,criado_em from marketing_privado.ia_inteligencia order by criado_em desc limit 3)x),
  'referencias',(select coalesce(jsonb_agg(x),'[]') from(select dados,criado_em from marketing_privado.ia_referencias order by criado_em desc limit 3)x),
  'estrategias',(select coalesce(jsonb_agg(x),'[]') from(select e.planejamento_id,e.anuncio_id,e.artigo_id,e.tiktok_id,e.erro,e.criado_em,i.titulo from marketing_privado.ia_estrategias e left join public.mkt_itens i on i.id=e.planejamento_id order by e.criado_em desc limit 8)x));
end;$$;
revoke all on function marketing_privado.inteligencia_mercado() from public,anon;
grant execute on function marketing_privado.inteligencia_mercado() to authenticated;
create function public.mkt_inteligencia_mercado() returns jsonb language sql security invoker set search_path='' as $$select marketing_privado.inteligencia_mercado()$$;
revoke all on function public.mkt_inteligencia_mercado() from public,anon;
grant execute on function public.mkt_inteligencia_mercado() to authenticated;

-- Sondagem de mercado pode consultar apenas feeds, sem repetir a busca de concorrentes.
create or replace function public.mkt_rotina_ferramentas(_tarefa uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
 if current_user<>'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
 if not exists(select 1 from escritorio_privado.missao_tarefas t join escritorio_privado.missoes m on m.id=t.missao_id where t.id=_tarefa and m.chave like 'auto-mkt:%') then return null; end if;
 return (select coalesce(jsonb_agg(f.slug),'[]'::jsonb) from escritorio_privado.missao_tarefas t
 join escritorio_privado.missoes m on m.id=t.missao_id
 join escritorio_privado.agente_ferramentas af on af.agente_id=t.agente_id
 join escritorio_privado.ferramentas f on f.slug=af.ferramenta and f.ativa and f.classe='leitura'
 where t.id=_tarefa and not(m.chave like 'auto-mkt:mercado:%' and f.slug='pesquisar_concorrentes_publicos'));
end;$$;
revoke all on function public.mkt_rotina_ferramentas(uuid) from public,anon,authenticated;
grant execute on function public.mkt_rotina_ferramentas(uuid) to service_role;
