create function marketing_privado.suspender_execucao_obsoleta() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.dados->>'origem_ia'='true' and (new.versao is distinct from old.versao or new.status in ('ajustes','rejeitado','arquivado')) then
  update public.controladoria_itens set status='cancelado',cancelado_motivo='Item editorial alterado ou retirado; conferir a versão atual no Marketing.'
  where (marketing_item_id=new.id or (new.tipo='pauta' and marketing_item_id in(select id from public.mkt_itens where origem_id=new.id)))
   and status in ('pendente','em_andamento','aguardando','aguardando_revisao');
 end if;
 return new;
end;$$;
revoke all on function marketing_privado.suspender_execucao_obsoleta() from public,anon,authenticated;
create trigger marketing_suspender_execucao_obsoleta after update on public.mkt_itens
 for each row execute function marketing_privado.suspender_execucao_obsoleta();
