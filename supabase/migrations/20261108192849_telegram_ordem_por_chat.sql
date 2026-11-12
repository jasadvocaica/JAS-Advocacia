-- SKIP LOCKED não pode permitir que uma mensagem ultrapasse outra do mesmo chat.
create or replace function public.telegram_reservar_pedido() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare e escritorio_privado.telegram_entradas;
begin
 if current_user<>'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
 select * into e from escritorio_privado.telegram_entradas t where t.estado='pendente'
 and not exists(select 1 from escritorio_privado.telegram_entradas outra where outra.chat_id=t.chat_id and outra.estado='processando')
 and not exists(select 1 from escritorio_privado.telegram_entradas anterior where anterior.chat_id=t.chat_id and anterior.estado='pendente' and (anterior.criado_em,anterior.id)<(t.criado_em,t.id))
 and public.telegram_usuario(t.chat_id)=t.usuario_id
 order by t.criado_em,t.id for update skip locked limit 1;
 if not found then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended('telegram:'||e.chat_id,0));
 if exists(select 1 from escritorio_privado.telegram_entradas where chat_id=e.chat_id and estado='processando') then return null; end if;
 update escritorio_privado.telegram_entradas set estado='processando',reserva=gen_random_uuid(),reservada_ate=now()+interval '4 minutes' where id=e.id returning * into e;
 return to_jsonb(e);
end;$$;
revoke all on function public.telegram_reservar_pedido() from public,anon,authenticated;
grant execute on function public.telegram_reservar_pedido() to service_role;
