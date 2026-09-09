-- Evita duas filas abertas simultâneas para o mesmo número e canal.

create unique index if not exists whatsapp_conversa_aberta_por_numero_uidx
  on public.whatsapp_conversas (conexao_id, telefone)
  where status <> 'encerrada';
