-- Automações, espera entre tentativas, fila de falhas e cancelamento (roda depois dos testes anteriores).
insert into public.agentes_ia(id, slug, nome, executor, supervisor_id) values
 ('10000000-0000-4000-8000-0000000000a1', 'sofia-auto', 'Sofia Auto', 'analista_operacional', '00000000-0000-4000-8000-000000000001');

do $$
declare g uuid := '00000000-0000-4000-8000-000000000001'; ctl uuid := '00000000-0000-4000-8000-000000000002';
  sofia uuid := '10000000-0000-4000-8000-0000000000a1'; a uuid; a2 uuid; m uuid; n int; t record; v timestamptz; s jsonb;
begin
  -- Próxima execução no fuso de Cuiabá (UTC-4): diária às 07:30 depois de 02/11 08:00 local → 03/11 07:30 local.
  v := escritorio_privado.automacao_proxima('diaria', null, '07:30', null, 'America/Cuiaba', '2026-11-02 12:00+00');
  assert v = '2026-11-03 11:30+00', 'diária no fuso: ' || v;
  v := escritorio_privado.automacao_proxima('diaria', null, '18:00', null, 'America/Cuiaba', '2026-11-02 12:00+00');
  assert v = '2026-11-02 22:00+00', 'diária ainda hoje: ' || v;
  -- Semanal só segunda (1): de segunda 02/11 10:00 local → segunda 09/11 07:00 local.
  v := escritorio_privado.automacao_proxima('semanal', null, '07:00', array[1]::smallint[], 'America/Cuiaba', '2026-11-02 14:00+00');
  assert v = '2026-11-09 11:00+00', 'semanal: ' || v;
  assert escritorio_privado.automacao_proxima('intervalo', 120, null, null, 'America/Cuiaba', '2026-11-02 12:00+00') = '2026-11-02 14:00+00';

  set local role service_role;
  -- Só gestor cria; validação no banco.
  begin perform public.motor_salvar_automacao(ctl, null, jsonb_build_object('nome','x x x','agente_id',sofia,'instrucoes','Relatório diário','frequencia','diaria','hora','07:30'));
    assert false, 'não gestor criou automação'; exception when insufficient_privilege then null; end;
  begin perform public.motor_salvar_automacao(g, null, jsonb_build_object('nome','Sem hora','agente_id',sofia,'instrucoes','Relatório diário','frequencia','diaria'));
    assert false, 'diária sem hora'; exception when check_violation then null; end;
  a := public.motor_salvar_automacao(g, null, jsonb_build_object('nome','Relatório diário da Controladoria','agente_id',sofia,
    'instrucoes','Liste vencidos e da semana, sem calcular prazo fatal.','frequencia','diaria','hora','07:30','setor','controladoria'));
  s := public.motor_automacoes(g);
  assert (s->0->>'ativa')::boolean = false and s->0->>'proxima_execucao' is null, 'nasce desligada';
  perform public.motor_alternar_automacao(g, a, true);
  reset role;

  -- Cenário A: venceu o horário → o despertador cria a missão sozinho (sem navegador), uma única vez por horário.
  update escritorio_privado.motor_config set ligado = true;
  update escritorio_privado.automacoes set proxima_execucao = now() - interval '1 minute' where id = a;
  v := (select proxima_execucao from escritorio_privado.automacoes where id = a);
  assert escritorio_privado.motor_processar_automacoes() = 1, 'executou a automação vencida';
  select ultima_missao into m from escritorio_privado.automacoes where id = a;
  assert exists(select 1 from escritorio_privado.missoes where id = m and origem = 'rotina' and chave like 'auto:%'), 'missão persistida';
  assert exists(select 1 from escritorio_privado.missao_tarefas where missao_id = m and agente_id = sofia and estado = 'pendente');
  assert (select proxima_execucao from escritorio_privado.automacoes where id = a) > now(), 'agendou a próxima';
  -- Mesmo horário de novo (ex.: dois despertadores juntos): não duplica.
  update escritorio_privado.automacoes set proxima_execucao = v where id = a;
  assert escritorio_privado.motor_processar_automacoes() = 0, 'mesmo horário não duplica';
  select count(*) into n from escritorio_privado.missoes where chave like 'auto:' || a || ':%';
  assert n = 1, 'uma missão por horário, achou ' || n;
  -- Agente pausado: automação é pulada e auditada.
  update public.agentes_ia set ativo = false where id = sofia;
  update escritorio_privado.automacoes set proxima_execucao = now() - interval '1 minute' where id = a;
  assert escritorio_privado.motor_processar_automacoes() = 0;
  assert exists(select 1 from escritorio_privado.auditoria where acao = 'automacao.pulada' and alvo = a::text);
  update public.agentes_ia set ativo = true where id = sofia;

  -- Espera entre tentativas: a tarefa falha e só volta a ser reservada depois do backoff.
  set local role service_role;
  select * into t from public.motor_reservar_tarefas(5) r where r.agente_id = sofia;
  assert t.tarefa_id is not null, 'reservou a tarefa da automação';
  perform public.motor_concluir_tarefa(t.tarefa_id, false, null, 'OpenAI fora do ar');
  reset role;
  assert (select estado = 'pendente' and proxima_tentativa_em > now() from escritorio_privado.missao_tarefas where id = t.tarefa_id),
    'voltou para a fila com espera';
  set local role service_role;
  assert not exists(select 1 from public.motor_reservar_tarefas(5) r where r.tarefa_id = t.tarefa_id), 'respeita a espera';
  reset role;
  update escritorio_privado.missao_tarefas set proxima_tentativa_em = now() - interval '1 second' where id = t.tarefa_id;

  -- Cenário F: worker caiu no meio (reserva venceu) → volta à fila sem duplicar execução; depois esgota e vai para falhas.
  set local role service_role;
  select * into t from public.motor_reservar_tarefas(5) r where r.agente_id = sofia;
  assert t.tentativa = 2, 'segunda tentativa';
  reset role;
  update escritorio_privado.missao_tarefas set reservada_ate = now() - interval '1 minute' where id = t.tarefa_id;
  set local role service_role;
  perform * from public.motor_reservar_tarefas(5);
  reset role;
  assert (select estado from escritorio_privado.missao_tarefas where id = t.tarefa_id) = 'falhou', 'esgotou as tentativas';
  select count(*) into n from public.agente_execucoes where entrada->>'tarefa_id' = t.tarefa_id::text and status = 'executando';
  assert n = 0, 'nenhuma execução duplicada ficou aberta';

  -- Fila de falhas e retentativa manual.
  set local role service_role;
  s := public.motor_falhas(g);
  assert exists(select 1 from jsonb_array_elements(s) x where x->>'tarefa_id' = t.tarefa_id::text), 'aparece na fila de falhas';
  assert public.motor_retentar_tarefa(g, t.tarefa_id);
  reset role;
  assert (select estado = 'pendente' and tentativas = 0 from escritorio_privado.missao_tarefas where id = t.tarefa_id);
  assert (select estado from escritorio_privado.missoes where id = t.missao_id) = 'aberta', 'missão reaberta';

  -- Cancelar missão: pendentes canceladas, pedidos de aprovação recusados.
  insert into escritorio_privado.aprovacoes(tipo, origem, tarefa_id, ferramenta, modulo, parametros, escopo_hash, resumo)
    values ('acao', 'agente', t.tarefa_id, 'criar_item_controladoria', 'controladoria', '{}', 'h', 'Pedido de teste');
  set local role service_role;
  assert public.motor_cancelar_missao(g, t.missao_id);
  reset role;
  assert (select estado from escritorio_privado.missao_tarefas where id = t.tarefa_id) = 'cancelada';
  assert not exists(select 1 from escritorio_privado.aprovacoes where tarefa_id = t.tarefa_id and estado = 'pendente'), 'pedido recusado';

  -- Executar agora (sob demanda) e navegador sem acesso.
  set local role service_role;
  a2 := public.motor_executar_automacao(g, a);
  assert exists(select 1 from escritorio_privado.missoes where id = a2 and origem = 'manual');
  reset role;
  set local role authenticated;
  begin perform public.motor_automacoes(g); assert false, 'navegador leu automações';
  exception when insufficient_privilege then null; end;
  reset role;
  raise notice 'automações, backoff, falhas e cancelamento: OK';
end $$;
