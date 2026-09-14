create unique index if not exists whatsapp_consentimento_revogado_mensagem_uidx
  on public.whatsapp_consentimento_eventos (mensagem_id)
  where tipo = 'revogado' and mensagem_id is not null;
