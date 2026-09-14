-- Funções internas do motor comercial não são endpoints RPC para usuários.
-- Os gatilhos SECURITY DEFINER continuam a executá-las sob o proprietário.
revoke execute on function public.mkt_automacoes_enfileirar(text, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.mkt_automacoes_evento_contrato() from public, anon, authenticated;
revoke execute on function public.mkt_automacoes_evento_lead() from public, anon, authenticated;
revoke execute on function public.mkt_lead_registrar_historico() from public, anon, authenticated;
