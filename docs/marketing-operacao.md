# Departamento de Marketing

O módulo está em `/marketing`, organizado em cinco menus: Visão Geral, Planejamento, Produção, Aprovações e Resultados. A administradora concede acesso em Marketing → Configurações → Permissões da equipe; o acesso básico também aparece no gerenciamento existente de usuários.

O botão Novo inicia formulários curtos. Detalhes avançados reúnem referências, vínculos, textos, editor de artigos e checklist. Uma ideia aprovada vira pauta; uma pauta aprovada gera materiais individuais ou um pacote de Reels, carrossel, stories, artigo e post. Cada material exige aprovação própria. Modelos são mantidos pela direção e sempre originam rascunhos sem aprovação herdada.

Os arquivos permanecem no Google Drive. O sistema armazena links e versões, sem upload de mídias, alteração de compartilhamento, IA ou publicação automática. A direção analisa o link e a versão submetida; modificar o arquivo externo depois da aprovação pode invalidar sua correspondência com o material aprovado.

Roteiro aprovado entra na fila de gravação. Gravação e edição precedem nova submissão do vídeo final. A aprovação do roteiro não autoriza publicação. A publicação manual exige aprovação da versão atual, URL HTTPS e data/hora efetiva. Alterar o conteúdo invalida sua aprovação; versões submetidas e decisões permanecem registradas.

As rotinas recorrentes geram tarefas independentes, com ocorrências idempotentes e até 31 datas por rotina em cada execução. O cron roda diariamente às 10:15 UTC (06:15 em Cuiabá), com notificações de atraso e revisão jurídica de artigos. As rotinas de concorrência e os cadastros de pesquisa/concorrentes permanecem preservados, mas fora do escopo e da criação desta versão.

O departamento não concede acesso ao CRM. Operadores comerciais que já tinham acesso foram preservados; novos usuários de marketing recebem somente permissões de conteúdo. Clientes, demandas, contratos e dados financeiros são protegidos no backend. Supervisão de tarefas, aprovação e orçamento são capacidades distintas. Os relatórios de demanda suprimem grupos pequenos e usam meses encerrados para a equipe; a direção possui indicadores completos.

O catálogo de áreas, serviços e teses é compartilhado com o comercial e o jurídico. Serviços são reutilizados de `catalogo_servicos`; clientes e contratos não são duplicados. Serviços e oportunidades ficam no menu Comercial e na aba correspondente do cliente. Cada demanda possui identidade e histórico próprios, incluindo novas contratações do mesmo serviço.

## Validação

- Testes transacionais em `tests/marketing/fluxos.sql`, sempre encerrados com ROLLBACK: publicação e aprovação, troca de versão, roteiro/vídeo, pacote idempotente, múltiplos serviços, recorrências, URLs e RLS. Nenhuma conta de teste permanece no banco.
- 131 testes automatizados de marketing, catálogo e DataJud; tipagem de produção e build.
- Teste de interface em `tests/marketing/interface.cjs`: cinco menus, criação e navegação, desktop e celular, sem dados reais ou chamadas ao backend real. Requer Vite em 4173, Chromium e Playwright Core. Para reproduzir sem alterar dependências do projeto: instale `playwright-core@1.56.1` em uma pasta temporária e configure NODE_PATH para seu node_modules.

As migrations de marketing têm os mesmos números das versões aplicadas no Supabase JAS. Não reaplique scripts manualmente sobre o banco já migrado.

## Publicação

A branch main de `jasadvocaica/JAS-Advocacia` recebe esta integração, preservando a base `/`, o portal de clientes e as rotas comerciais existentes. A hospedagem externa acompanha o GitHub, conforme informado pela administradora.

O ajuste adicional que separa a permissão de atendimento aos próprios clientes da permissão do CRM está pendente de autorização da revisão automática; não foi aplicado nem incluído nesta publicação.
