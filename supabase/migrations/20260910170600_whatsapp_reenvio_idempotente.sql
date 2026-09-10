drop index if exists public.whatsapp_mensagens_reenvio_de_idx;

create unique index if not exists whatsapp_mensagens_reenvio_de_uidx
  on public.whatsapp_mensagens(reenvio_de)
  where reenvio_de is not null;
