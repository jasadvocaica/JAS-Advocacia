-- Restringe funções internas do motor comercial e melhora consultas por vínculos.
-- Não altera nem remove dados existentes.

revoke execute on function public.mkt_automacao_definir_status(uuid, text) from public, anon;
revoke execute on function public.mkt_automacoes_enfileirar(text, uuid, uuid, text) from public, anon;
revoke execute on function public.mkt_automacoes_evento_contrato() from public, anon;
revoke execute on function public.mkt_automacoes_evento_lead() from public, anon;
revoke execute on function public.mkt_lead_registrar_historico() from public, anon;

create index if not exists idx_mkt_automacao_execucoes_automacao_id on public.mkt_automacao_execucoes (automacao_id);
create index if not exists idx_mkt_automacao_execucoes_conversa_id on public.mkt_automacao_execucoes (conversa_id);
create index if not exists idx_mkt_automacao_execucoes_lead_id on public.mkt_automacao_execucoes (lead_id);
create index if not exists idx_mkt_automacoes_atualizado_por on public.mkt_automacoes (atualizado_por);
create index if not exists idx_mkt_automacoes_criado_por on public.mkt_automacoes (criado_por);
create index if not exists idx_mkt_lead_historico_alterado_por on public.mkt_lead_historico (alterado_por);
create index if not exists idx_mkt_leads_cliente_id on public.mkt_leads (cliente_id);
create index if not exists idx_whatsapp_consentimento_eventos_mensagem_id on public.whatsapp_consentimento_eventos (mensagem_id);
create index if not exists idx_whatsapp_consentimento_eventos_realizado_por on public.whatsapp_consentimento_eventos (realizado_por);
create index if not exists idx_whatsapp_contatos_bloqueados_conversa_origem_id on public.whatsapp_contatos_bloqueados (conversa_origem_id);
create index if not exists idx_whatsapp_contatos_bloqueados_mensagem_origem_id on public.whatsapp_contatos_bloqueados (mensagem_origem_id);
create index if not exists idx_whatsapp_contatos_bloqueados_restaurado_por on public.whatsapp_contatos_bloqueados (restaurado_por);
create index if not exists idx_whatsapp_conversas_opt_out_mensagem_id on public.whatsapp_conversas (opt_out_mensagem_id);
create index if not exists idx_whatsapp_respostas_rapidas_atualizado_por on public.whatsapp_respostas_rapidas (atualizado_por);
create index if not exists idx_whatsapp_respostas_rapidas_criado_por on public.whatsapp_respostas_rapidas (criado_por);
