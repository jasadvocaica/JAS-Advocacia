-- Impede publicar regras de WhatsApp sem um executor periódico ativo.
-- A conexão oficial continua sendo pré-requisito independente.
create or replace function public.mkt_automacao_definir_status(_id uuid, _status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission(auth.uid(), 'marketing'::modulo, 'editar'::acao_permissao) then
    raise exception 'Sem permissão para alterar automações.';
  end if;
  if _status not in ('rascunho', 'ativa', 'pausada') then
    raise exception 'Status inválido.';
  end if;
  if _status = 'ativa' then
    if not exists (
      select 1 from public.whatsapp_conexoes
      where ativo = true and status = 'conectado'
    ) then
      raise exception 'Conecte e homologue o canal oficial antes de ativar automações.';
    end if;
    if not exists (
      select 1 from cron.job
      where jobname = 'jas_whatsapp_automacoes'
        and active = true
    ) then
      raise exception 'O executor das automações ainda não foi agendado. Acione a administração do sistema antes de ativar.';
    end if;
  end if;
  update public.mkt_automacoes
  set status = _status, atualizado_por = auth.uid(), atualizado_em = now()
  where id = _id;
  if not found then
    raise exception 'Automação não encontrada.';
  end if;
end;
$$;
revoke all on function public.mkt_automacao_definir_status(uuid, text) from public, anon;
grant execute on function public.mkt_automacao_definir_status(uuid, text) to authenticated;