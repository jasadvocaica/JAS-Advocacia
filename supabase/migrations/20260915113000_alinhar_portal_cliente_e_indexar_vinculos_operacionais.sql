-- O Portal do Cliente é somente leitura para dados cadastrais.
-- Alterações continuam disponíveis à equipe conforme permissão do módulo Clientes.
drop policy if exists "cliente edita proprio cadastro" on public.clientes;

-- Índices para vínculos usados no cadastro, listagens e Controladoria.
create index if not exists idx_clientes_criado_por
  on public.clientes (criado_por);
create index if not exists idx_clientes_advogado_responsavel_id
  on public.clientes (advogado_responsavel_id);
create index if not exists idx_clientes_parceiro_indicacao
  on public.clientes (parceiro_indicacao);
create index if not exists idx_clientes_campanha_origem
  on public.clientes (campanha_origem);
create index if not exists idx_clientes_lead_origem_id
  on public.clientes (lead_origem_id);

create index if not exists idx_controladoria_itens_criado_por
  on public.controladoria_itens (criado_por);
create index if not exists idx_controladoria_itens_concluido_por
  on public.controladoria_itens (concluido_por);
create index if not exists idx_controladoria_itens_tipo_prazo_id
  on public.controladoria_itens (tipo_prazo_id);