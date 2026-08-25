-- Vincula publicações DJEN já reconhecidas a andamento e à triagem da Controladoria.
-- É idempotente: somente publicações vinculadas a processo e ainda sem item são tratadas.
do $$
declare
  pub record;
  v_andamento_id uuid;
  v_item_id uuid;
  v_vencimento date;
begin
  for pub in
    select p.*, pr.cliente_id, pr.responsavel_id
      from public.pje_publicacoes p
      join public.processos pr on pr.id = p.processo_id
     where p.item_controladoria_id is null
  loop
    v_andamento_id := pub.andamento_id;

    if v_andamento_id is null then
      select a.id into v_andamento_id
        from public.andamentos a
       where a.processo_id = pub.processo_id
         and a.datajud_id = 'djen_' || pub.id::text
       limit 1;
    end if;

    if v_andamento_id is null then
      insert into public.andamentos (processo_id, data, descricao, fonte, datajud_id)
      values (
        pub.processo_id,
        coalesce(pub.data_disponibilizacao, current_date),
        'DJEN — ' || coalesce(pub.tipo_comunicacao, 'Publicação') || ': ' ||
          left(coalesce(pub.texto_publicacao, ''), 1000),
        'pje_comunica',
        'djen_' || pub.id::text
      )
      returning id into v_andamento_id;
    end if;

    select public.adicionar_dias_uteis(
      coalesce(pub.data_disponibilizacao, current_date), 1
    ) into v_vencimento;

    insert into public.controladoria_itens (
      tipo, titulo, descricao, processo_id, cliente_id, responsavel_id,
      data_vencimento, data_intimacao, prioridade, status, origem
    )
    values (
      'intimacao',
      'Triar publicação DJEN — ' || coalesce(pub.numero_processo, pub.numero_processo_limpo),
      concat_ws(
        E'\n',
        'Tipo: ' || coalesce(pub.tipo_comunicacao, 'Publicação'),
        'Órgão: ' || coalesce(pub.nome_orgao, pub.sigla_tribunal, 'Não informado'),
        '',
        left(coalesce(pub.texto_publicacao, ''), 3000),
        case when pub.link_certidao is not null then E'\nCertidão: ' || pub.link_certidao end,
        '',
        'ATENÇÃO: vencimento de triagem. O prazo jurídico deve ser conferido e cadastrado pela responsável.'
      ),
      pub.processo_id,
      pub.cliente_id,
      pub.responsavel_id,
      (v_vencimento + time '18:00') at time zone 'America/Cuiaba',
      pub.data_disponibilizacao,
      'alta',
      'pendente',
      'pje_publicacao'
    )
    returning id into v_item_id;

    update public.pje_publicacoes
       set andamento_id = v_andamento_id,
           item_controladoria_id = v_item_id
     where id = pub.id;
  end loop;
end
$$;
