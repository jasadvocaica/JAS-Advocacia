-- A função é usada exclusivamente como trigger; não precisa ser executável via API.
revoke execute on function public.criar_monitoramento_djen_processo() from public, anon, authenticated;
grant execute on function public.criar_monitoramento_djen_processo() to service_role;
