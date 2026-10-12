# Simplificação da navegação

O menu usa o componente existente AppLayout e conserva as permissões por módulo. Ordem: Início, Clientes, Produção jurídica, Marketing, Financeiro, Gestão de pessoas / RH, Sistema.

Clientes foi movido para grupo próprio, mantendo `/clientes`, pesquisa, criação, edição, detalhes, duplicados e a autorização do módulo clientes. Não existe breadcrumb comercial nas páginas de clientes: retorno e cancelamento já apontam para `/clientes`. Processos e Financeiro continuam consultando a mesma tabela clientes e seus vínculos cliente_id.

Ocultados na navegação comum: Comercial inteiro; Fluxos e POPs, Peças e documentos, Parceiros, Minha produção; atalhos iniciais extras (Mural, Visão operacional, Painel executivo). Início conserva Painel inicial e Painel da Juliana conforme permissões existentes. Nenhum arquivo dos painéis foi alterado.

Removido o atalho do rodapé de Marketing para demandas comerciais. A busca global não oferece destinos do módulo oculto de peças; o cabeçalho e sua estrutura visual permanecem intactos. Consultas de clientes, processos e tarefas permanecem disponíveis conforme autorização.

Rotas, componentes, serviços, permissões e tabelas dos módulos ocultos permanecem intactos. Demandas por serviço na aba do cliente, catálogos compartilhados, documentos do cliente, contratos e dados financeiros seguem disponíveis nas funcionalidades mantidas. Não houve migração ou escrita no banco.

Arquivos de implementação: src/components/layout/AppLayout.tsx, src/components/layout/GlobalSearch.tsx, src/pages/marketing/Marketing.tsx.

Validação: TypeScript sem erros, 396 testes passando, build de produção; teste de navegador com dados sintéticos verificando Clientes em /clientes, Comercial ausente, quatro destinos jurídicos mantidos e quatro ocultados, cinco grupos do Marketing, navegação, criação simulada e layout desktop/mobile sem erros de execução. Build apresenta avisos existentes de tamanho dos bundles e anotações de dependências. Nenhuma pendência de implementação identificada; a atualização do domínio depende da hospedagem que acompanha o GitHub.
