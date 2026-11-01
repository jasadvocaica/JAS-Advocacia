-- Leitura operacional: nenhum dado de cliente, arquivo ou comando vai para a cena.
create or replace function public.clara_m1_acompanhar(_usuario uuid)
returns jsonb language sql stable security invoker set search_path=pg_catalog,public,homologacao as $$
 select jsonb_build_object(
  'agente_id','clara-txt-v1','habilitado',(select habilitado from homologacao.clara_config where id),
  'servidor_em',statement_timestamp(),
  'revisao',coalesce((select max(e.id)::text from homologacao.clara_eventos e join homologacao.clara_tarefas t on t.id=e.tarefa_id where t.usuario_id=_usuario),'0'),
  'tarefas',coalesce((select jsonb_agg(jsonb_build_object(
    'id',t.id,'estado',t.estado,'criado_em',t.criado_em,'atualizado_em',t.atualizado_em,
    'tokens_entrada',t.tokens_entrada,'tokens_saida',t.tokens_saida,'custo_estimado_usd',t.custo_estimado_usd,
    'tentativas',t.tentativas,'pendencias_total',jsonb_array_length(t.pendencias),
    'possui_erro',t.erro is not null,'cadastro_confirmado',t.cliente_id is not null,
    'eventos',coalesce((select jsonb_agg(jsonb_build_object('id',e.id::text,'estado',e.estado,'criado_em',e.criado_em) order by e.id) from homologacao.clara_eventos e where e.tarefa_id=t.id),'[]'::jsonb)
  ) order by t.criado_em desc,t.id) from (select * from homologacao.clara_tarefas where usuario_id=_usuario order by criado_em desc,id limit 12) t),'[]'::jsonb)
 );
$$;
revoke all on function public.clara_m1_acompanhar(uuid) from public,anon,authenticated;
grant execute on function public.clara_m1_acompanhar(uuid) to service_role;
comment on function public.clara_m1_acompanhar(uuid) is 'Snapshot operacional da Clara para o avatar; service_role, filtrado por proprietária validada no endpoint.';
