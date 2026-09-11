-- Evita recalcular auth.uid() para cada linha consultada.
-- Mantém exatamente as mesmas permissões do módulo Comercial.

alter policy mkt_camp_delete on public.mkt_campanhas using (has_permission((select auth.uid()), 'marketing'::modulo, 'excluir'::acao_permissao));
alter policy mkt_camp_insert on public.mkt_campanhas with check (has_permission((select auth.uid()), 'marketing'::modulo, 'criar'::acao_permissao));
alter policy mkt_camp_select on public.mkt_campanhas using (has_permission((select auth.uid()), 'marketing'::modulo, 'visualizar'::acao_permissao));
alter policy mkt_camp_update on public.mkt_campanhas using (has_permission((select auth.uid()), 'marketing'::modulo, 'editar'::acao_permissao));

alter policy mkt_conteudo_delete on public.mkt_conteudo using (has_permission((select auth.uid()), 'marketing'::modulo, 'excluir'::acao_permissao));
alter policy mkt_conteudo_insert on public.mkt_conteudo with check (has_permission((select auth.uid()), 'marketing'::modulo, 'criar'::acao_permissao));
alter policy mkt_conteudo_select on public.mkt_conteudo using (has_permission((select auth.uid()), 'marketing'::modulo, 'visualizar'::acao_permissao));
alter policy mkt_conteudo_update on public.mkt_conteudo using (has_permission((select auth.uid()), 'marketing'::modulo, 'editar'::acao_permissao));

alter policy mkt_leads_delete on public.mkt_leads using (has_permission((select auth.uid()), 'marketing'::modulo, 'excluir'::acao_permissao));
alter policy mkt_leads_insert on public.mkt_leads with check (has_permission((select auth.uid()), 'marketing'::modulo, 'criar'::acao_permissao));
alter policy mkt_leads_select on public.mkt_leads using (has_permission((select auth.uid()), 'marketing'::modulo, 'visualizar'::acao_permissao));
alter policy mkt_leads_update on public.mkt_leads using (has_permission((select auth.uid()), 'marketing'::modulo, 'editar'::acao_permissao));
