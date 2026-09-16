-- Salva o processo e suas partes manuais na mesma transação.
-- Se qualquer parte falhar, nenhuma alteração do processo é confirmada.

create or replace function public.salvar_processo_com_partes(
  _processo_id uuid,
  _processo jsonb,
  _partes jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_acao public.acao_permissao := case when _processo_id is null then 'criar' else 'editar' end;
begin
  if v_uid is null or not public.is_interno_ativo(v_uid) then
    raise exception 'Sessão interna inválida' using errcode = '42501';
  end if;
  if not public.has_permission(v_uid, 'processos'::public.modulo, v_acao) then
    raise exception 'Sem permissão para salvar processos' using errcode = '42501';
  end if;
  if nullif(_processo->>'cliente_id', '') is null then
    raise exception 'Selecione um cliente' using errcode = '23502';
  end if;

  if _processo_id is null then
    insert into public.processos (
      cliente_id, tipo, numero_cnj, numero_cnj_limpo,
      tribunal_sigla, tribunal_nome, datajud_alias, instancia,
      nb_inss, data_der, fase_administrativa, area_direito, tipo_acao,
      status, fase_atual, vara, comarca, juiz, valor_causa,
      data_distribuicao, parceiro_id, responsavel_id,
      observacoes_internas, datajud_ativo, criado_por
    ) values (
      (_processo->>'cliente_id')::uuid,
      (_processo->>'tipo')::public.tipo_processo,
      nullif(_processo->>'numero_cnj', ''), nullif(_processo->>'numero_cnj_limpo', ''),
      nullif(_processo->>'tribunal_sigla', ''), nullif(_processo->>'tribunal_nome', ''),
      nullif(_processo->>'datajud_alias', ''), nullif(_processo->>'instancia', ''),
      nullif(_processo->>'nb_inss', ''), nullif(_processo->>'data_der', '')::date,
      nullif(_processo->>'fase_administrativa', ''), nullif(_processo->>'area_direito', ''),
      nullif(_processo->>'tipo_acao', ''), coalesce(nullif(_processo->>'status', ''), 'Em andamento'),
      nullif(_processo->>'fase_atual', ''), nullif(_processo->>'vara', ''),
      nullif(_processo->>'comarca', ''), nullif(_processo->>'juiz', ''),
      nullif(_processo->>'valor_causa', '')::numeric,
      nullif(_processo->>'data_distribuicao', '')::date,
      nullif(_processo->>'parceiro_id', '')::uuid,
      nullif(_processo->>'responsavel_id', '')::uuid,
      nullif(_processo->>'observacoes_internas', ''),
      coalesce((_processo->>'datajud_ativo')::boolean, false),
      v_uid
    ) returning id into v_id;
  else
    update public.processos set
      cliente_id = (_processo->>'cliente_id')::uuid,
      tipo = (_processo->>'tipo')::public.tipo_processo,
      numero_cnj = nullif(_processo->>'numero_cnj', ''),
      numero_cnj_limpo = nullif(_processo->>'numero_cnj_limpo', ''),
      tribunal_sigla = nullif(_processo->>'tribunal_sigla', ''),
      tribunal_nome = nullif(_processo->>'tribunal_nome', ''),
      datajud_alias = nullif(_processo->>'datajud_alias', ''),
      instancia = nullif(_processo->>'instancia', ''),
      nb_inss = nullif(_processo->>'nb_inss', ''),
      data_der = nullif(_processo->>'data_der', '')::date,
      fase_administrativa = nullif(_processo->>'fase_administrativa', ''),
      area_direito = nullif(_processo->>'area_direito', ''),
      tipo_acao = nullif(_processo->>'tipo_acao', ''),
      status = coalesce(nullif(_processo->>'status', ''), status),
      fase_atual = nullif(_processo->>'fase_atual', ''),
      vara = nullif(_processo->>'vara', ''),
      comarca = nullif(_processo->>'comarca', ''),
      juiz = nullif(_processo->>'juiz', ''),
      valor_causa = nullif(_processo->>'valor_causa', '')::numeric,
      data_distribuicao = nullif(_processo->>'data_distribuicao', '')::date,
      parceiro_id = nullif(_processo->>'parceiro_id', '')::uuid,
      responsavel_id = nullif(_processo->>'responsavel_id', '')::uuid,
      observacoes_internas = nullif(_processo->>'observacoes_internas', ''),
      datajud_ativo = coalesce((_processo->>'datajud_ativo')::boolean, false)
    where id = _processo_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Processo não encontrado' using errcode = 'P0002';
    end if;
  end if;

  delete from public.processo_partes
  where processo_id = v_id and origem = 'manual';

  insert into public.processo_partes (
    processo_id, tipo, nome, cpf_cnpj, advogado_nome, advogado_oab, origem
  )
  select v_id, p.tipo, btrim(p.nome),
    nullif(regexp_replace(coalesce(p.cpf_cnpj, ''), '[^0-9]', '', 'g'), ''),
    nullif(btrim(p.advogado_nome), ''), nullif(btrim(p.advogado_oab), ''), 'manual'
  from jsonb_to_recordset(coalesce(_partes, '[]'::jsonb)) as p(
    tipo text, nome text, cpf_cnpj text, advogado_nome text, advogado_oab text
  )
  where nullif(btrim(p.nome), '') is not null;

  return v_id;
end;
$$;

revoke all on function public.salvar_processo_com_partes(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.salvar_processo_com_partes(uuid, jsonb, jsonb) to authenticated;
