-- Garante idempotência de mensagens e atualização atômica da fila de atendimento.

create unique index if not exists whatsapp_mensagens_provider_message_uidx
  on public.whatsapp_mensagens (provider_message_id)
  where provider_message_id is not null;

create or replace function public.whatsapp_atualizar_conversa_por_mensagem()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.whatsapp_conversas
     set ultima_mensagem_em = new.ocorrida_em,
         ultima_mensagem_resumo = left(coalesce(new.conteudo, '[' || new.tipo || ']'), 240),
         nao_lidas = case
           when new.direcao = 'entrada' then nao_lidas + 1
           else nao_lidas
         end,
         status = case
           when new.direcao = 'entrada' then 'aguardando_escritorio'
           when status = 'encerrada' then status
           else 'aguardando_cliente'
         end,
         atualizado_em = now()
   where id = new.conversa_id;
  return new;
end;
$$;

drop trigger if exists whatsapp_mensagem_atualizar_conversa on public.whatsapp_mensagens;
create trigger whatsapp_mensagem_atualizar_conversa
after insert on public.whatsapp_mensagens
for each row execute function public.whatsapp_atualizar_conversa_por_mensagem();

comment on function public.whatsapp_atualizar_conversa_por_mensagem() is
  'Mantém resumo, data, fila e contador da conversa de forma atômica após cada mensagem.';
