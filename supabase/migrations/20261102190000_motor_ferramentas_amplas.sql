-- Ferramentas amplas dos agentes. Consultas: processos, clientes, agenda, diligências, financeiro, comercial e
-- pesquisa só em fontes oficiais. Ações (sensíveis): só executam depois da aprovação de quem tem "editar" no módulo.
insert into escritorio_privado.ferramentas(slug, nome, descricao, classe, modulo) values
  ('consultar_processo_completo', 'Ficha do processo', 'Dados, partes, andamentos, publicações do DJEN e itens abertos de um processo.', 'leitura', 'processos'),
  ('consultar_publicacoes_djen', 'Publicações do DJEN', 'Publicações capturadas no período, com texto resumido.', 'leitura', 'processos'),
  ('buscar_cliente', 'Buscar cliente', 'Cliente por nome ou CPF/CNPJ (documento mascarado) e seus processos.', 'leitura', 'clientes'),
  ('historico_cliente', 'Histórico do cliente', 'Atendimentos, triagens e interações recentes do cliente.', 'leitura', 'clientes'),
  ('consultar_agenda', 'Agenda', 'Audiências, reuniões, perícias e conciliações dos próximos dias.', 'leitura', 'controladoria'),
  ('listar_diligencias', 'Diligências', 'Diligências marcadas no período.', 'leitura', 'controladoria'),
  ('consultar_financeiro', 'Resumo financeiro', 'Recebido, saídas, parcelas em aberto e mais atrasadas.', 'leitura', 'financeiro'),
  ('consultar_comercial', 'Funil comercial', 'Leads por situação e canal, conversões e valor contratado.', 'leitura', 'marketing'),
  ('pesquisar_fontes_oficiais', 'Pesquisa em fontes oficiais', 'Legislação, jurisprudência e normas do INSS só em sites oficiais, com links.', 'leitura', null),
  ('atualizar_item_controladoria', 'Atualizar item da Controladoria', 'PROPÕE mudar a situação de um item (ex.: triagem concluída). Só após aprovação.', 'sensivel', 'controladoria'),
  ('criar_compromisso_agenda', 'Criar compromisso na agenda', 'PROPÕE audiência, reunião, perícia ou conciliação. Só após aprovação.', 'sensivel', 'controladoria'),
  ('criar_diligencia', 'Criar diligência', 'PROPÕE diligência para a equipe. Só após aprovação.', 'sensivel', 'controladoria'),
  ('criar_minuta', 'Salvar minuta (rascunho)', 'PROPÕE salvar minuta como rascunho no processo. Só após aprovação; nunca protocola.', 'sensivel', 'documentos')
on conflict (slug) do nothing;
