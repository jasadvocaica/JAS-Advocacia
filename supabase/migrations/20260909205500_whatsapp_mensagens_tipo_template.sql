alter table public.whatsapp_mensagens
  drop constraint if exists whatsapp_mensagens_tipo_check;

alter table public.whatsapp_mensagens
  add constraint whatsapp_mensagens_tipo_check
  check (tipo in ('texto','template','audio','imagem','documento','video','localizacao','contato','sistema'));

comment on column public.whatsapp_mensagens.tipo is
  'Tipo operacional da mensagem, incluindo template oficial aprovado pela Meta.';