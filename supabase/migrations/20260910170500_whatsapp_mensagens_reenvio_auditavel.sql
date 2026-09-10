alter table public.whatsapp_mensagens
  add column if not exists reenvio_de uuid references public.whatsapp_mensagens(id) on delete set null;

create index if not exists whatsapp_mensagens_reenvio_de_idx
  on public.whatsapp_mensagens(reenvio_de)
  where reenvio_de is not null;

comment on column public.whatsapp_mensagens.reenvio_de is
  'Tentativa anterior preservada quando uma mensagem com falha é reenviada.';
