
CREATE OR REPLACE FUNCTION public.aprovar_submissao_parceiro(_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_sub RECORD;
  v_novo_id UUID;
  v_parceiro RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sessão inválida'; END IF;
  IF NOT public.has_permission(v_uid, 'parceiros'::modulo, 'editar'::acao_permissao) THEN
    RAISE EXCEPTION 'Sem permissão para aprovar submissões';
  END IF;

  SELECT * INTO v_sub FROM public.parceiro_submissoes WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Submissão não encontrada'; END IF;
  IF v_sub.status <> 'pendente' THEN RAISE EXCEPTION 'Submissão já foi revisada'; END IF;

  SELECT * INTO v_parceiro FROM public.parceiros WHERE id = v_sub.parceiro_id;

  IF v_sub.tipo = 'cliente' THEN
    INSERT INTO public.clientes (
      nome, cpf_cnpj, whatsapp, email, cidade, estado,
      como_chegou, parceiro_indicacao, observacoes,
      status, ativo, criado_por, origem
    ) VALUES (
      COALESCE(v_sub.payload->>'nome', v_sub.titulo),
      v_sub.payload->>'cpf_cnpj',
      v_sub.payload->>'whatsapp',
      v_sub.payload->>'email',
      v_sub.payload->>'cidade',
      v_sub.payload->>'estado',
      'Indicação de parceiro: ' || v_parceiro.nome,
      v_sub.parceiro_id,
      v_sub.payload->>'observacoes',
      'ativo', true, v_uid, 'parceiro'
    ) RETURNING id INTO v_novo_id;

  ELSIF v_sub.tipo = 'processo' THEN
    INSERT INTO public.processos (
      cliente_id, numero_cnj, area_direito, comarca, vara, descricao,
      status, criado_por
    ) VALUES (
      v_sub.cliente_id,
      v_sub.payload->>'numero_cnj',
      v_sub.payload->>'area_direito',
      v_sub.payload->>'comarca',
      v_sub.payload->>'vara',
      v_sub.payload->>'descricao',
      'ativo', v_uid
    ) RETURNING id INTO v_novo_id;

    INSERT INTO public.processo_parceiros (processo_id, parceiro_id, criado_por)
    VALUES (v_novo_id, v_sub.parceiro_id, v_uid)
    ON CONFLICT DO NOTHING;

  ELSIF v_sub.tipo = 'andamento' THEN
    INSERT INTO public.andamentos (
      processo_id, descricao, data, fonte, criado_por
    ) VALUES (
      v_sub.processo_id,
      COALESCE(v_sub.payload->>'descricao', v_sub.titulo),
      COALESCE((v_sub.payload->>'data')::timestamptz, now()),
      'parceiro',
      v_uid
    ) RETURNING id INTO v_novo_id;

  ELSIF v_sub.tipo = 'documento' THEN
    -- Documento já está no Storage; apenas registramos andamento de referência
    INSERT INTO public.andamentos (
      processo_id, descricao, data, fonte, criado_por
    ) VALUES (
      v_sub.processo_id,
      'Documento enviado pelo parceiro: ' || v_sub.titulo
        || COALESCE(E'\nArquivo: ' || (v_sub.payload->>'arquivo_url'), ''),
      now(),
      'parceiro',
      v_uid
    ) RETURNING id INTO v_novo_id;
  END IF;

  UPDATE public.parceiro_submissoes
  SET status = 'aprovado',
      registro_criado_id = v_novo_id,
      revisado_em = now(),
      revisado_por = v_uid
  WHERE id = _id;

  RETURN v_novo_id;
END $$;

CREATE OR REPLACE FUNCTION public.rejeitar_submissao_parceiro(_id uuid, _motivo text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sessão inválida'; END IF;
  IF NOT public.has_permission(v_uid, 'parceiros'::modulo, 'editar'::acao_permissao) THEN
    RAISE EXCEPTION 'Sem permissão para rejeitar submissões';
  END IF;
  IF _motivo IS NULL OR length(trim(_motivo)) = 0 THEN
    RAISE EXCEPTION 'Motivo da rejeição é obrigatório';
  END IF;

  UPDATE public.parceiro_submissoes
  SET status = 'rejeitado',
      motivo_rejeicao = _motivo,
      revisado_em = now(),
      revisado_por = auth.uid()
  WHERE id = _id AND status = 'pendente';
END $$;
