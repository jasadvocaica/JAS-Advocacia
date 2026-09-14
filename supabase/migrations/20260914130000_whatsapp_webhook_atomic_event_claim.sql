alter table public.whatsapp_webhook_eventos
  add column if not exists tentativa_iniciada_em timestamptz;

create or replace function public.whatsapp_reivindicar_evento(
  _provedor_evento_id text,
  _tipo text,
  _conexao_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  _evento_id uuid;
begin
  if nullif(trim(_provedor_evento_id), '') is null
     or _tipo not in ('status_mensagem', 'mensagem_recebida') then
    raise exception 'Evento de webhook inválido.';
  end if;

  insert into public.whatsapp_webhook_eventos (
    provedor, provedor_evento_id, tipo, conexao_id, status,
    tentativas, tentativa_iniciada_em
  ) values (
    'meta', _provedor_evento_id, _tipo, _conexao_id,
    case when _conexao_id is null then 'ignorado' else 'processando' end,
    case when _conexao_id is null then 0 else 1 end,
    case when _conexao_id is null then null else now() end
  )
  on conflict (provedor, provedor_evento_id) do update
  set status = 'processando',
      conexao_id = excluded.conexao_id,
      tentativas = public.whatsapp_webhook_eventos.tentativas + 1,
      tentativa_iniciada_em = now(),
      erro = null,
      processado_em = null
  where excluded.conexao_id is not null
    and (
      public.whatsapp_webhook_eventos.status in ('erro', 'recebido', 'ignorado')
      or (
        public.whatsapp_webhook_eventos.status = 'processando'
        and coalesce(public.whatsapp_webhook_eventos.tentativa_iniciada_em, public.whatsapp_webhook_eventos.recebido_em)
            < now() - interval '5 minutes'
      )
    )
  returning id into _evento_id;

  return _evento_id;
end;
$$;

revoke execute on function public.whatsapp_reivindicar_evento(text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.whatsapp_reivindicar_evento(text, text, uuid)
  to service_role;
