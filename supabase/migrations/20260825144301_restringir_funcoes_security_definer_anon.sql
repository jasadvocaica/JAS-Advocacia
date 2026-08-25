-- Restringe funções SECURITY DEFINER que não devem ser públicas.
revoke execute on function public.auditar_base_clientes_processos() from anon;
revoke execute on function public.criar_monitoramento_djen_processo() from anon;
revoke execute on function public.proteger_campos_sensiveis_profile() from anon;
revoke execute on function public.validar_datajud_cron_secret(text) from anon, authenticated;
revoke execute on function public.validar_djen_cron_secret(text) from anon, authenticated;

grant execute on function public.validar_datajud_cron_secret(text) to service_role;
grant execute on function public.validar_djen_cron_secret(text) to service_role;
