-- A central usa um único canal principal por vez.
-- Conexões antigas podem ser preservadas como inativas para auditoria.

create unique index if not exists whatsapp_conexao_ativa_unica_uidx
  on public.whatsapp_conexoes ((ativo))
  where ativo = true;
