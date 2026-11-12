-- Vincula somente públicos não sensíveis criados e confirmados pela própria gestora nesta conta.
do $$declare d text;a text:='''formulario_id'',''revisao_etica''';begin
 select pg_get_functiondef('public.mkt_ads(text,jsonb)'::regprocedure) into d;
 if position(a in d)=0 then raise exception 'Contrato de plano mudou';end if;
 execute replace(d,a,'''formulario_id'',''audiencia_id'',''revisao_etica''');
end;$$;
create function public.mkt_ads_audiencia(_usuario uuid,_conta text,_audiencia text) returns boolean
language sql stable security invoker set search_path='' as $$
 select current_user='service_role' and public.is_gestor(_usuario) and public.is_interno_ativo(_usuario) and exists(
 select 1 from marketing_privado.ads_operacoes where usuario_id=_usuario and estado='confirmada' and acao in ('lista','semelhante')
 and resultado->>'conta_id'=_conta and resultado->>'fonte_id'=_audiencia)
$$;
revoke all on function public.mkt_ads_audiencia(uuid,text,text) from public,anon,authenticated;
grant execute on function public.mkt_ads_audiencia(uuid,text,text) to service_role;
