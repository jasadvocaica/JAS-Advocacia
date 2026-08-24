-- Fila segura para revisão da planilha antes da criação de clientes/processos.
create table if not exists public.migracao_clientes_processos (
 id uuid primary key default gen_random_uuid(), origem text not null default 'controle_geral_clientes',
 linha_origem integer not null, nome text not null, area text, servico_demanda text, status_origem text,
 protocolado text, numero_processo text, responsavel text, data_entrada date, proximo_prazo date,
 prioridade text, proxima_acao text, observacoes text, caminho_pasta text,
 situacao_validacao text not null default 'pendente' check(situacao_validacao in ('pendente','revisar','pronto','ignorado','importado','erro')),
 cliente_existente_id uuid references public.clientes(id) on delete set null,
 processo_existente_id uuid references public.processos(id) on delete set null,
 cliente_criado_id uuid references public.clientes(id) on delete set null,
 processo_criado_id uuid references public.processos(id) on delete set null,
 alertas jsonb not null default '[]'::jsonb, revisado_por uuid references auth.users(id) on delete set null,
 revisado_em timestamptz, criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
 unique(origem,linha_origem)
);
create index if not exists migracao_cp_situacao_idx on public.migracao_clientes_processos(situacao_validacao);
create index if not exists migracao_cp_nome_idx on public.migracao_clientes_processos(lower(nome));
alter table public.migracao_clientes_processos enable row level security;
drop policy if exists "gestor gerencia migracao clientes processos" on public.migracao_clientes_processos;
create policy "gestor gerencia migracao clientes processos" on public.migracao_clientes_processos
for all to authenticated using(has_role(auth.uid(),'gestor'::app_role))
with check(has_role(auth.uid(),'gestor'::app_role));

create or replace function public.importar_registro_migracao(p_registro_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.migracao_clientes_processos%rowtype; v_cliente uuid; v_processo uuid; v_cnj text; v_obs text;
begin
 if not has_role(auth.uid(),'gestor'::app_role) then raise exception 'Apenas gestores podem importar'; end if;
 select * into r from public.migracao_clientes_processos where id=p_registro_id for update;
 if not found then raise exception 'Registro não encontrado'; end if;
 if r.situacao_validacao='importado' then return jsonb_build_object('cliente_id',r.cliente_criado_id,'processo_id',r.processo_criado_id,'ja_importado',true); end if;
 if r.situacao_validacao<>'pronto' then raise exception 'Revise e aprove o registro antes de importar'; end if;
 v_cliente:=r.cliente_existente_id;
 if v_cliente is null then select id into v_cliente from public.clientes c where upper(regexp_replace(trim(c.nome),'\s+',' ','g'))=upper(regexp_replace(trim(r.nome),'\s+',' ','g')) order by c.criado_em limit 1; end if;
 v_obs:=concat_ws(E'\n','Importado do Controle Geral de Clientes.',case when r.area is not null then 'Área: '||r.area end,case when r.servico_demanda is not null then 'Serviço/demanda: '||r.servico_demanda end,case when r.proxima_acao is not null then 'Próxima ação: '||r.proxima_acao end,r.observacoes,case when r.caminho_pasta is not null then 'Pasta de referência: '||r.caminho_pasta end);
 if v_cliente is null then
  insert into public.clientes(nome,tipo_pessoa,origem,observacoes,status,ativo,criado_por)
  values(trim(r.nome),case when upper(r.nome)~'(LTDA|EIRELI|S/A|INDUSTRIA|COMERCIO|EMPRESA|LOJA)' then 'juridica' else 'fisica' end,
  'migração planilha',v_obs,case when upper(coalesce(r.status_origem,''))='FINALIZADO' then 'inativo' else 'ativo' end,
  upper(coalesce(r.status_origem,''))<>'FINALIZADO',auth.uid()) returning id into v_cliente;
 end if;
 v_cnj:=regexp_replace(coalesce(r.numero_processo,''),'[^0-9]','','g'); v_processo:=r.processo_existente_id;
 if length(v_cnj)=20 and v_processo is null then
  select id into v_processo from public.processos p where regexp_replace(coalesce(p.numero_cnj,''),'[^0-9]','','g')=v_cnj limit 1;
  if v_processo is null then insert into public.processos(numero_cnj,tipo,area_direito,tipo_acao,status,cliente_id,observacoes_internas,criado_por,datajud_ativo)
   values(r.numero_processo,'judicial',r.area,r.servico_demanda,case when upper(coalesce(r.status_origem,''))='FINALIZADO' then 'encerrado' else 'em_andamento' end,v_cliente,v_obs,auth.uid(),true)
   returning id into v_processo; end if;
 end if;
 update public.migracao_clientes_processos set situacao_validacao='importado',cliente_criado_id=v_cliente,processo_criado_id=v_processo,revisado_por=auth.uid(),revisado_em=now(),atualizado_em=now() where id=p_registro_id;
 return jsonb_build_object('cliente_id',v_cliente,'processo_id',v_processo,'ja_importado',false);
end; $$;
revoke all on function public.importar_registro_migracao(uuid) from public,anon;
grant execute on function public.importar_registro_migracao(uuid) to authenticated;
