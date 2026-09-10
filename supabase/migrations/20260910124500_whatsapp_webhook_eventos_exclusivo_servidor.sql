revoke all on table public.whatsapp_webhook_eventos from anon, authenticated;

drop policy if exists whatsapp_webhook_eventos_bloqueio_cliente on public.whatsapp_webhook_eventos;
create policy whatsapp_webhook_eventos_bloqueio_cliente
  on public.whatsapp_webhook_eventos
  for select to authenticated
  using (false);

comment on table public.whatsapp_webhook_eventos is
  'Registro técnico mínimo exclusivo do servidor para idempotência de webhooks; payload bruto e credenciais não são persistidos.';