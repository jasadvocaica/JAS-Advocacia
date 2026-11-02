-- Integração Zernio no banco descartável (depois de tests/motor/bootstrap.sql e das migrations do motor e do Zernio).
-- Dados fictícios; nenhuma chamada ao Zernio.
insert into public.teste_pessoas values
 ('00000000-0000-4000-8000-0000000000a1', true, true),   -- administração
 ('00000000-0000-4000-8000-0000000000a2', false, true);  -- marketing sem gestão
insert into public.teste_permissoes values ('00000000-0000-4000-8000-0000000000a2','marketing','editar');
insert into public.agentes_ia(id,slug,nome) values ('10000000-0000-4000-8000-0000000000b1','bruna','Bruna');

set role service_role;
do $$
declare adm uuid := '00000000-0000-4000-8000-0000000000a1'; mkt uuid := '00000000-0000-4000-8000-0000000000a2';
  j uuid; j2 uuid; r jsonb; n int; s jsonb;
  linha jsonb := '[{"externo_id":"p1","plataforma":"instagram","conteudo":"Post","publicado_em":"2026-10-30T12:00:00Z","data":"2026-11-01","metricas":{"alcance":100,"curtidas":10,"taxa_engajamento":5.5}}]';
begin
  -- 1. Sem chave: estado "aguardando" e agentes recebem aviso, nunca número.
  r := public.zernio_conexao();
  assert r->>'estado' = 'aguardando' and (r->>'tem_chave')::boolean = false;
  assert not (r ? 'chave_cifrada'), 'cifra nunca sai na leitura comum';
  s := public.zernio_consulta_agente('indicadores', 30);
  assert (s->>'disponivel')::boolean = false and s->>'aviso' like '%aguardando configuração%';
  begin perform public.zernio_job_criar(adm, 'manual'); assert false, 'sincronizou sem chave';
  exception when raise_exception then null; end;

  -- 2. Cadastro seguro: só administração, e só chave já cifrada.
  begin perform public.zernio_salvar_chave(mkt, 'v1.aaa.bbb', 'sk_1234…abcd'); assert false, 'marketing salvou chave';
  exception when insufficient_privilege then null; end;
  begin perform public.zernio_salvar_chave(adm, 'sk_texto_puro', 'sk_1234…abcd'); assert false, 'aceitou chave sem cifra';
  exception when raise_exception then null; end;
  perform public.zernio_salvar_chave(adm, 'v1.aaa.bbb', 'sk_1234…abcd');
  assert (public.zernio_conexao()->>'chave_mascara') = 'sk_1234…abcd';
  assert (public.zernio_conexao(true)->>'chave_cifrada') = 'v1.aaa.bbb', 'backend lê a cifra para decifrar';

  -- 3. Coleta começa desligada; travas de publicação/resposta/anúncio não podem ser ligadas.
  begin perform public.zernio_job_criar(adm, 'manual'); assert false, 'coletou com coleta desligada';
  exception when raise_exception then null; end;
  begin perform public.zernio_configurar(adm, '{"publicacao_automatica":true}'); assert false, 'ligou publicação automática';
  exception when raise_exception then null; end;
  begin perform public.zernio_configurar(mkt, '{"coleta_ativa":true}'); assert false, 'marketing mudou configuração';
  exception when insufficient_privilege then null; end;
  perform public.zernio_configurar(adm, '{"coleta_ativa":true,"analises_ativas":true}');

  -- 4. Um job ativo por vez (pedido repetido devolve o mesmo).
  j := public.zernio_job_criar(adm, 'manual');
  j2 := public.zernio_job_criar(adm, 'manual');
  assert j = j2, 'job duplicado';

  -- 5. Lease: reservado não é reservado de novo; lease vencido é retomado com o cursor salvo.
  r := public.zernio_job_reservar(120);
  assert (r->>'id')::uuid = j;
  assert public.zernio_job_reservar(120) is null, 'reservou em dobro';
  perform public.zernio_job_progresso(j, 'publicacoes', '{"contas":{"feito":true},"publicacoes":{"pagina":3}}', '{"contas":2}');
  update marketing_privado.zernio_sync_jobs set reservado_ate = now() - interval '1 second' where id = j;  -- worker "caiu"
  r := public.zernio_job_reservar(120);
  assert (r->>'id')::uuid = j and r->>'etapa_atual' = 'publicacoes' and (r->'cursores'->'publicacoes'->>'pagina')::int = 3,
    'retomou do cursor';

  -- 6. Gravação idempotente: repetir a mesma página não duplica; métricas guardam histórico por dia.
  assert public.zernio_gravar('publicacoes', linha) = 1;
  perform public.zernio_gravar('publicacoes', linha);
  assert (select count(*) from marketing_privado.zernio_posts) = 1, 'post duplicado';
  assert (select count(*) from marketing_privado.zernio_post_metricas) = 1, 'métrica do mesmo dia duplicada';
  perform public.zernio_gravar('publicacoes', jsonb_set(jsonb_set(linha, '{0,data}', '"2026-11-02"'), '{0,metricas,alcance}', '150'));
  assert (select count(*) from marketing_privado.zernio_post_metricas) = 2, 'histórico de outro dia';
  perform public.zernio_gravar('contas', '[{"externo_id":"a1","plataforma":"instagram","ativa":true},{"externo_id":"a2","plataforma":"metaads","ativa":true}]');
  perform public.zernio_gravar('contas', '[{"externo_id":"a1","plataforma":"instagram","ativa":true,"usuario":"jas"}]');
  assert (select count(*) from marketing_privado.zernio_contas) = 2;
  perform public.zernio_gravar('comentarios', '[{"externo_id":"instagram:c1","comentario_id":"c1","post_externo_id":"p1","texto":"Quero saber do BPC","criado_em_plataforma":"2026-11-01T10:00:00Z","pode_responder":true}]');
  perform public.zernio_gravar('anuncios_diario', '[{"referencia":"a2","data":"2026-11-01","moeda":"BRL","gasto":20,"impressoes":1000}]');
  perform public.zernio_gravar('anuncios_diario', '[{"referencia":"a2","data":"2026-11-01","moeda":"BRL","gasto":25,"impressoes":1200}]');
  assert (select gasto from marketing_privado.zernio_anuncio_metricas) = 25 and (select count(*) from marketing_privado.zernio_anuncio_metricas) = 1;

  -- 7. Seleção de contas: só as escolhidas entram na coleta.
  perform public.zernio_configurar(adm, '{"contas_selecionadas":["a1"]}');
  assert (select count(*) from public.zernio_contas_selecionadas()) = 1;

  -- 8. Rate limit adia sem gastar tentativa; concluir atualiza a conexão.
  assert public.zernio_job_finalizar(j, 'adiado', 'Limite do Zernio', 30);
  assert public.zernio_job_reservar(120) is null, 'reservou antes do Retry-After';
  update marketing_privado.zernio_sync_jobs set proxima_tentativa_em = now() where id = j;
  r := public.zernio_job_reservar(120);
  assert public.zernio_job_finalizar(j, 'concluido');
  assert public.zernio_conexao()->>'estado' = 'conectado' and public.zernio_conexao()->>'ultima_sync_ok_em' is not null;

  -- 9. Agentes leem dados reais quando há sincronização e análise ligada.
  s := public.zernio_consulta_agente('indicadores', 30);
  assert (s->>'disponivel')::boolean and (s->'dados'->>'publicacoes')::int = 1 and (s->'dados'->>'alcance')::int = 150;
  s := public.zernio_consulta_agente('comentarios', 30);
  assert jsonb_array_length(s->'dados') = 1 and (s->'dados'->0->>'respondido')::boolean = false;
  s := public.zernio_consulta_agente('saude', 30);
  assert s->>'estado' = 'conectado';
  perform public.zernio_configurar(adm, '{"analises_ativas":false}');
  assert (public.zernio_consulta_agente('publicacoes', 30)->>'disponivel')::boolean = false, 'análise desligada não entrega dados';

  assert (public.zernio_comentario_para_resposta('instagram:c1')->>'post_externo_id') = 'p1';
  assert public.zernio_comentario_para_resposta('instagram:nao-existe') is null;

  -- 10. Logs nunca guardam a chave.
  perform public.zernio_log(j, 'erro', 'contas', 'falhou com sk_0123456789abcdef0123');
  assert (select mensagem from marketing_privado.zernio_sync_logs order by id desc limit 1) not like '%0123456789abcdef%';

  -- 11. Revogar apaga a cifra e desliga a coleta.
  perform public.zernio_revogar(adm);
  r := public.zernio_conexao(true);
  assert r->>'chave_cifrada' is null and (r->>'coleta_ativa')::boolean = false and r->>'estado' = 'revogada';
  raise notice 'integração zernio: OK';
end $$;
reset role;

-- 12. Resposta a comentário é ação sensível: só vira pedido de aprovação, e só para quem recebeu a ferramenta.
set role service_role;
do $$
declare adm uuid := '00000000-0000-4000-8000-0000000000a1'; bruna uuid := '10000000-0000-4000-8000-0000000000b1';
  t uuid; ap uuid;
begin
  perform public.motor_ajustar(adm, true);
  perform public.motor_criar_missao(adm, 'Responder comentários', 'Sugira respostas.', bruna);
  select tarefa_id into t from public.motor_reservar_tarefas(1);
  begin perform public.motor_pedir_aprovacao(t, 'zernio_responder_comentario', '{"comentario":"c1"}', 'Responder c1');
    assert false, 'pediu sem ter a ferramenta';
  exception when insufficient_privilege then null; end;
  perform public.motor_conceder_ferramenta(adm, bruna, 'zernio_responder_comentario', true);
  ap := public.motor_pedir_aprovacao(t, 'zernio_responder_comentario', '{"comentario":"c1","post":"p1","conta":"a1","mensagem":"Olá!"}', 'Responder c1');
  assert (select estado from escritorio_privado.aprovacoes where id = ap) = 'pendente';
  assert (select count(*) from public.aprovacao_iniciar_execucao(ap)) = 0, 'executou sem aprovação';
  raise notice 'ação externa só com aprovação: OK';
end $$;
reset role;

set role authenticated;
do $$ begin
  begin perform 1 from marketing_privado.zernio_conexoes; assert false, 'navegador leu a conexão';
  exception when insufficient_privilege then null; end;
  begin perform public.zernio_conexao(); assert false, 'navegador chamou a conexão';
  exception when insufficient_privilege then null; end;
  raise notice 'isolamento do navegador (zernio): OK';
end $$;
reset role;
