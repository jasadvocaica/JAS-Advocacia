alter table public.whatsapp_mensagens
  add column if not exists erro_codigo text,
  add column if not exists erro_titulo text,
  add column if not exists erro_detalhe text;

comment on column public.whatsapp_mensagens.erro_codigo is
  'Código técnico sanitizado retornado pela Meta quando o envio falha.';
comment on column public.whatsapp_mensagens.erro_titulo is
  'Título sanitizado do erro de entrega retornado pela Meta.';
comment on column public.whatsapp_mensagens.erro_detalhe is
  'Detalhe operacional sanitizado do erro, sem tokens ou payload bruto.';
