alter table public.whatsapp_templates add column if not exists presente_meta boolean not null default true;
comment on column public.whatsapp_templates.presente_meta is 'Indica se o template ainda apareceu na sincronização mais recente da Meta.';
