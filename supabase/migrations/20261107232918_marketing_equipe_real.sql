-- Lista a equipe real sem divulgar prompts, supervisora ou configurações privadas.
create function marketing_privado.equipe_disponivel() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_interno_ativo(auth.uid()) or not marketing_privado.pode('visualizar') then
  raise exception 'Sem permissão de Marketing' using errcode='42501';
 end if;
 return (select coalesce(jsonb_agg(jsonb_build_object(
  'id',a.id,'nome',a.nome,'slug',a.slug,'descricao',a.descricao,'ativo',a.ativo,'executor',a.executor,
  'ferramentas',(select coalesce(jsonb_agg(f.ferramenta order by f.ferramenta),'[]'::jsonb)
   from escritorio_privado.agente_ferramentas f where f.agente_id=a.id)
 ) order by a.nome),'[]'::jsonb) from public.agentes_ia a
 where a.sala='marketing' or lower(split_part(a.nome,' ',1)) in ('nina','bela','bia','theo','alex'));
end;$$;
revoke all on function marketing_privado.equipe_disponivel() from public,anon;
grant execute on function marketing_privado.equipe_disponivel() to authenticated;
create function public.mkt_equipe_disponivel() returns jsonb
language sql stable security invoker set search_path='' as $$select marketing_privado.equipe_disponivel()$$;
revoke all on function public.mkt_equipe_disponivel() from public,anon;
grant execute on function public.mkt_equipe_disponivel() to authenticated;
