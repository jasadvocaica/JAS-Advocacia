revoke all on public.escritorio_mensagens from anon;
revoke insert,update,delete,truncate,references,trigger on public.escritorio_mensagens from authenticated;
grant select on public.escritorio_mensagens to authenticated;
