-- Fluxo da Fase 2: missão → delegação → leitura → pedido sensível → aprovação → execução única.
-- Pessoas e agentes fictícios.
insert into public.teste_pessoas values
 ('00000000-0000-4000-8000-000000000001', true, true),   -- gestora
 ('00000000-0000-4000-8000-000000000002', false, true),  -- controladoria com editar
 ('00000000-0000-4000-8000-000000000003', false, true);  -- sem permissão
insert into public.teste_permissoes values ('00000000-0000-4000-8000-000000000002','controladoria','editar');
insert into public.agentes_ia(id,slug,nome) values
 ('10000000-0000-4000-8000-000000000001','manu','Manu'),
 ('10000000-0000-4000-8000-000000000002','rafael','Rafael'),
 ('10000000-0000-4000-8000-000000000003','alex','Alex');

set role service_role;

do $$
declare g uuid := '00000000-0000-4000-8000-000000000001'; ctl uuid := '00000000-0000-4000-8000-000000000002';
  sem uuid := '00000000-0000-4000-8000-000000000003';
  manu uuid := '10000000-0000-4000-8000-000000000001'; rafael uuid := '10000000-0000-4000-8000-000000000002';
  m uuid; m2 uuid; r record; n int; t_manu uuid; t_raf uuid; ap uuid; ap2 uuid; h text; s jsonb;
begin
  -- 1. Nasce desligado: nada é reservado.
  m := public.motor_criar_missao(g, 'Conferir prazos da semana', 'Liste o que vence e proponha uma atividade.', manu, 'central', 2, 'teste:1');
  m2 := public.motor_criar_missao(g, 'Conferir prazos da semana', 'repetida', manu, 'central', 2, 'teste:1');
  assert m = m2, 'missão com a mesma chave não pode duplicar';
  select count(*) into n from public.motor_reservar_tarefas(3);
  assert n = 0, 'motor desligado não reserva';

  -- 2. Só gestor cria missão e liga o motor.
  begin perform public.motor_criar_missao(sem, 'x x x', 'y', manu); assert false, 'sem permissão criou missão';
  exception when insufficient_privilege then null; end;
  begin perform public.motor_ajustar(ctl, true); assert false, 'não gestor ligou o motor';
  exception when insufficient_privilege then null; end;
  perform public.motor_ajustar(g, true);

  -- 3. Sem ferramenta concedida, o agente não delega.
  select tarefa_id into t_manu from public.motor_reservar_tarefas(3);
  assert t_manu is not null, 'tarefa da Manu reservada';
  assert (select count(*) from public.agente_execucoes where status='executando') = 1, 'execução visível no escritório';
  begin perform public.motor_delegar(t_manu, rafael, 'Ler prazos', 'Leia os itens'); assert false, 'delegou sem ferramenta';
  exception when insufficient_privilege then null; end;

  perform public.motor_conceder_ferramenta(g, manu, 'delegar_tarefa', true);
  perform public.motor_conceder_ferramenta(g, rafael, 'listar_itens_controladoria', true);
  perform public.motor_conceder_ferramenta(g, rafael, 'criar_item_controladoria', true);
  assert public.motor_ferramenta_permitida(t_manu, 'delegar_tarefa') = 'escrita_interna';
  assert public.motor_ferramenta_permitida(t_manu, 'criar_item_controladoria') is null, 'Manu não tem a sensível';

  t_raf := public.motor_delegar(t_manu, rafael, 'Ler prazos', 'Leia os itens abertos', '{}', 'ler');
  assert t_raf = public.motor_delegar(t_manu, rafael, 'Ler prazos', 'Leia os itens abertos', '{}', 'ler'), 'delegação idempotente';
  assert public.motor_concluir_tarefa(t_manu, true, '{"resumo":"Delegado ao Rafael"}');
  assert not public.motor_concluir_tarefa(t_manu, true, '{}'), 'concluir duas vezes não vale';
  assert (select status from public.agente_execucoes where agente_id=manu) = 'concluida', 'execução da Manu fechada';

  -- 4. Rafael executa e pede a ação sensível.
  select * into r from public.motor_reservar_tarefas(3);
  assert r.tarefa_id = t_raf and r.profundidade = 1, 'tarefa delegada reservada';
  assert r.ferramentas = array['criar_item_controladoria','listar_itens_controladoria'], 'ferramentas do agente';
  select count(*) into n from public.motor_reservar_tarefas(3);
  assert n = 0, 'nada reservado em dobro';
  ap := public.motor_pedir_aprovacao(t_raf, 'criar_item_controladoria',
     '{"titulo":"Conferir prazo do processo X","data_vencimento":"2026-11-10"}', 'Criar atividade de conferência');
  assert ap = public.motor_pedir_aprovacao(t_raf, 'criar_item_controladoria',
     '{"titulo":"Conferir prazo do processo X","data_vencimento":"2026-11-10"}', 'Criar atividade de conferência'), 'pedido idempotente';
  begin perform public.motor_pedir_aprovacao(t_raf, 'delegar_tarefa', '{}', 'xxx'); assert false, 'pediu aprovação de ferramenta não sensível';
  exception when insufficient_privilege then null; end;
  assert public.motor_concluir_tarefa(t_raf, true, '{"resumo":"Pedido criado"}');
  assert (select estado from escritorio_privado.missoes where id=m) = 'aberta', 'missão espera a aprovação';

  -- 5. Não executa sem aprovação; aprovação confere permissão e escopo.
  select count(*) into n from public.aprovacao_iniciar_execucao(ap);
  assert n = 0, 'executou sem aprovação';
  select escopo_hash into h from escritorio_privado.aprovacoes where id=ap;
  begin perform public.aprovacao_decidir(sem, ap, true, h); assert false, 'aprovou sem permissão';
  exception when insufficient_privilege then null; end;
  begin perform public.aprovacao_decidir(ctl, ap, true, 'hash-errado'); assert false, 'aprovou escopo diferente';
  exception when serialization_failure then null; end;
  select count(*) into n from public.aprovacao_listar(ctl);
  assert n = 1, 'pedido visível para quem decide';
  select count(*) into n from public.aprovacao_listar(sem);
  assert n = 0, 'pedido escondido de quem não decide';
  assert public.aprovacao_decidir(ctl, ap, true, h, 'ok') = 'aprovada';

  -- 6. Escopo adulterado depois da aprovação não executa.
  update escritorio_privado.aprovacoes set parametros = parametros || '{"titulo":"outro"}' where id=ap;
  select count(*) into n from public.aprovacao_iniciar_execucao(ap);
  assert n = 0, 'executou com escopo alterado';
  update escritorio_privado.aprovacoes set parametros = parametros || '{"titulo":"Conferir prazo do processo X"}' where id=ap;

  -- 7. Execução única.
  select count(*) into n from public.aprovacao_iniciar_execucao(ap);
  assert n = 1, 'primeira execução';
  select count(*) into n from public.aprovacao_iniciar_execucao(ap);
  assert n = 0, 'segunda execução bloqueada';
  assert public.aprovacao_finalizar_execucao(ap, true, '{"item_id":"x"}');
  assert not public.aprovacao_finalizar_execucao(ap, true, '{}'), 'finalizar duas vezes não vale';
  assert (select estado from escritorio_privado.missoes where id=m) = 'concluida', 'missão concluída após a ação';

  -- 8. Orçamento: limite do dia = mensal ÷ dias restantes; reserva acima é recusada.
  s := public.ia_situacao();
  assert (s->>'orcamento_mensal_usd')::numeric = 10 and (s->>'teto_absoluto_usd')::numeric = 20;
  assert abs((s->>'limite_dia_usd')::numeric - 10.0 / (s->>'dias_restantes')::int) < 0.0001, 'divisão igual pelos dias';
  s := public.ia_reservar(gen_random_uuid(), 0, rafael, null, 'gpt-4.1-mini-2025-04-14', 1000, 1000);
  assert (s->>'ok')::boolean, 'reserva pequena aceita';
  perform public.motor_ajustar(g, null, 1);  -- US$ 1/mês: limite do dia fica em centavos
  s := public.ia_reservar(gen_random_uuid(), 0, rafael, null, 'gpt-4.1-mini-2025-04-14', 200000, 4000);
  assert (s->>'ok')::boolean = false, 'reserva grande recusada';
  ap2 := public.ia_pedir_aumento('Fila parada por limite', '[{"tipo":"extra_dia","valor_usd":0.5},{"tipo":"mensal","valor_usd":15}]');
  assert ap2 = public.ia_pedir_aumento('de novo', '[{"tipo":"extra_dia","valor_usd":0.5}]'), 'um aviso por dia';
  begin perform public.ia_decidir_aumento(g, ap2, null, 'mensal', 25); assert false, 'passou do teto';
  exception when raise_exception then null; end;
  begin perform public.ia_decidir_aumento(ctl, ap2, 1); assert false, 'não gestor aprovou orçamento';
  exception when insufficient_privilege then null; end;
  assert public.ia_decidir_aumento(g, ap2, 1) = 'executada';
  assert (select orcamento_mensal_usd from escritorio_privado.ia_orcamento) = 15, 'mensal aprovado';
  begin perform public.motor_ajustar(ctl, null, null, 100); assert false, 'teto mudado sem administração';
  exception when insufficient_privilege then null; end;

  -- 9. Custo acima do reservado desliga o motor.
  s := public.ia_reservar('20000000-0000-4000-8000-000000000001', 0, rafael, null, 'gpt-4.1-mini-2025-04-14', 100, 10);
  assert (s->>'ok')::boolean;
  assert public.ia_confirmar('20000000-0000-4000-8000-000000000001', 0, 100, 5000) = false;
  assert (select ligado from escritorio_privado.motor_config) = false, 'motor desligado pelo excedente';

  -- 10. Auditoria só aceita inserção.
  begin update escritorio_privado.auditoria set acao='x'; assert false, 'auditoria alterada';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from escritorio_privado.auditoria) >= 10, 'ações auditadas';
  raise notice 'fluxo do motor: OK';
end $$;
reset role;

-- 11. Navegador não enxerga o motor.
set role authenticated;
do $$ begin
  begin perform public.motor_reservar_tarefas(1); assert false, 'navegador reservou tarefa';
  exception when insufficient_privilege then null; end;
  begin perform 1 from escritorio_privado.missoes; assert false, 'navegador leu missões';
  exception when insufficient_privilege then null; end;
  raise notice 'isolamento do navegador: OK';
end $$;
reset role;

-- 12. Sem orçamento a tarefa volta para a fila sem gastar tentativa.
set role service_role;
do $$
declare g uuid := '00000000-0000-4000-8000-000000000001'; alex uuid := '10000000-0000-4000-8000-000000000003';
  m uuid; t uuid; tent int;
begin
  perform public.motor_ajustar(g, true);
  m := public.motor_criar_missao(g, 'Checar rotinas', 'Verifique as falhas.', alex);
  select tarefa_id, tentativa into t, tent from public.motor_reservar_tarefas(1);
  assert public.motor_devolver_tarefa(t, 'sem orçamento');
  assert (select estado from escritorio_privado.missao_tarefas where id=t) = 'pendente';
  assert (select tentativas from escritorio_privado.missao_tarefas where id=t) = tent - 1, 'tentativa não gasta';
  assert (select status from public.agente_execucoes where entrada->>'tarefa_id' = t::text order by iniciado_em desc limit 1) = 'cancelada';
  raise notice 'devolução sem orçamento: OK';
end $$;
reset role;
