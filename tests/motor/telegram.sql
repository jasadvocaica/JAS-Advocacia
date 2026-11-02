-- Telegram: vínculo por código de uso único e destinos dos pedidos de aprovação.
do $$
declare g uuid := '00000000-0000-4000-8000-000000000001'; ctl uuid := '00000000-0000-4000-8000-000000000002';
  sem uuid := '00000000-0000-4000-8000-000000000003'; cod text; cod2 text; u uuid; ap uuid; n int; s jsonb;
begin
  set local role service_role;
  -- 1. Só gestor gera código.
  begin perform public.telegram_gerar_codigo(ctl); assert false, 'não gestor gerou código';
  exception when insufficient_privilege then null; end;
  cod := public.telegram_gerar_codigo(g);
  assert cod ~ '^[0-9A-F]{10}$', 'código de 10 caracteres';
  assert not exists(select 1 from escritorio_privado.telegram_codigos where codigo_hash = cod), 'código não fica em claro';

  -- 2. Código errado não vincula; o certo vincula uma única vez (aceita minúsculas e espaços).
  assert public.telegram_vincular(111, 'ERRADO0000') is null;
  u := public.telegram_vincular(111, '  ' || lower(cod) || ' ', 'Juliana');
  assert u = g, 'vinculou à gestora';
  assert public.telegram_vincular(222, cod) is null, 'código reutilizado';
  assert public.telegram_usuario(111) = g and public.telegram_usuario(222) is null;

  -- 3. Código novo invalida o anterior; código vencido não vale.
  cod := public.telegram_gerar_codigo(g);
  cod2 := public.telegram_gerar_codigo(g);
  assert public.telegram_vincular(333, cod) is null, 'código anterior invalidado';
  reset role;
  update escritorio_privado.telegram_codigos set expira_em = now() - interval '1 minute' where usado_em is null;
  set local role service_role;
  assert public.telegram_vincular(333, cod2) is null, 'código vencido';

  -- 4. Pedido de aprovação vai para quem pode decidir e só uma vez por chat.
  reset role;
  insert into escritorio_privado.aprovacoes(tipo, origem, ferramenta, modulo, parametros, escopo_hash, resumo)
    values ('acao', 'agente', 'criar_item_controladoria', 'controladoria', '{"titulo":"x"}', 'h', 'Criar item de teste')
    returning id into ap;
  set local role service_role;
  select count(*) into n from public.telegram_destinos_aprovacao(ap);
  assert n = 1, 'gestora vinculada recebe o pedido';
  perform public.telegram_registrar_aviso(ap, 111, 9001);
  perform public.telegram_registrar_aviso(ap, 111, 9001);
  select count(*) into n from public.telegram_destinos_aprovacao(ap);
  assert n = 0, 'não avisa duas vezes';

  -- 5. Deixou de ser gestora: chat para de obedecer. Desvincular revoga.
  reset role;
  update public.teste_pessoas set gestor = false where id = g;
  set local role service_role;
  assert public.telegram_usuario(111) is null, 'perdeu o papel de gestora';
  reset role;
  update public.teste_pessoas set gestor = true where id = g;
  set local role service_role;
  s := public.telegram_estado(g);
  assert jsonb_array_length(s) = 1 and s->0->>'nome' = 'Juliana';
  assert public.telegram_desvincular(g, null) = 1;
  assert public.telegram_usuario(111) is null, 'desvinculado';
  reset role;

  -- 6. Navegador não chama as funções.
  set local role authenticated;
  begin perform public.telegram_gerar_codigo(g); assert false, 'navegador gerou código';
  exception when insufficient_privilege then null; end;
  reset role;
  raise notice 'telegram: OK';
end $$;
