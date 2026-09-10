alter table public.whatsapp_mensagens
  add column if not exists provider_media_id text,
  add column if not exists mime_type text,
  add column if not exists nome_arquivo text;

create index if not exists whatsapp_mensagens_provider_media_idx
  on public.whatsapp_mensagens(provider_media_id)
  where provider_media_id is not null;

comment on column public.whatsapp_mensagens.provider_media_id is
  'Identificador opaco da mídia no provedor; a URL temporária e o token nunca são persistidos.';
comment on column public.whatsapp_mensagens.mime_type is
  'Tipo MIME informado pelo provedor para download autenticado.';
comment on column public.whatsapp_mensagens.nome_arquivo is
  'Nome original sanitizado para apresentação ao usuário.';