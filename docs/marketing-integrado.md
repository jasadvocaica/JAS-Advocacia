# Marketing integrado do JAS

Implementação de 07/11/2026 na branch `codex/marketing-integrado-homologacao`.
Código validado localmente e backend instalado em produção em 07/11/2026, após autorização explícita de Juliana na conversa. Nenhum anúncio, mensagem, convite ou publicação foi enviado. Nenhuma coleta DJEN, fila de agenda ou job HTTP foi alterado.

## Entrega

- Seis grupos: Visão Geral, Planejamento, Produção, Aprovações, Campanhas e Resultados. Rotina editorial aparece antes dos resultados na abertura.
- Resultados leem as tabelas privadas já preenchidas pelo sincronizador Zernio. Visitas não disparam coleta. Conta, período, campanha, canal, usuário e ambiente fazem parte da chave de consulta.
- Gasto vem exclusivamente da série diária de conta, separado por moeda. Corrigida também a soma do painel legado para excluir nível de anúncio. Alcance único entre dias/publicações não é somado. Valores ausentes permanecem indisponíveis, distintos de zero confirmado. Retratos de campanha mostram seu próprio período.
- CRM separado das métricas Meta, com coorte de aquisição em Cuiabá e contratos comprovados por contratação formalizada vinculada ao cliente/lead. Estágio `convertido` isoladamente não comprova contrato. Há categoria Sem atribuição. Custos por lead/contrato continuam indisponíveis sem cobertura e atribuição compatíveis; não há aproximação por nome de campanha.
- CRM recebeu filtros de período, área, UF, canal, campanha, etapa, responsável, novas entradas/retornos e registros de teste. Não captura o WhatsApp do aplicativo.
- Receptor `marketing-leads`: HMAC SHA-256 sobre corpo bruto; `lead.received`; limite de 64 KB; allowlist de conta/formulário conferida no banco; somente contato mínimo. Nenhum laudo, diagnóstico ou payload integral é gravado.
- Ingestão atômica com bloqueios transacionais e chaves únicas por escritório/provedor/conta/lead, mais evento. Reenvios preservam nome, atribuição e estágio humanos. Dados de teste têm marca própria no CRM.
- Homologação de Página/formulário em Configurações → Integrações → Zernio. A interface autoriza somente testes; não oferece habilitação indiscriminada de produção.
- Reconciliação manual, paginada em lotes de 50, na mesma integração. Só consulta formulários conferidos, reaproveita a ingestão idempotente e mantém o cursor em caso de falha. O sincronizador antigo continua responsável pelo restante da coleta.
- Direct usa conversas existentes, páginas de 50, revisão de duplicidade e responsável obrigatório. Um vínculo confirmado é idempotente; várias conversas podem apontar para o mesmo lead sem alterar sua origem anterior. Origem sem evidência fica a confirmar.
- Importação de campanhas pelo par estável conta/ID externo, sem recriá-las. Vínculo tardio de leads só preenche campanha ainda não atribuída.
- Rascunhos de campanha no cadastro comercial, versões e aprovação na Central existente. A gestora vê texto, mídia, Página, público, moeda, orçamento e período. Edição exige nova aprovação; somente gestora pode decidir os novos pedidos.
- Campanha e publicação editorial têm execução **simulada e explicitamente identificada**, sem chamada externa nem marcação enganosa de publicação real. A simulação de campanha comprova estados PAUSED e idempotência. Ativação, orçamento e anúncios reais permanecem bloqueados.
- Alertas de desconexão, atraso, erro repetido e lead pendente usam a outbox interna existente e deduplicam por dia/motivo/conta, sem envios. IDs de entrega são descartados após 90 dias; a chave de origem mantém a deduplicação. Contatos continuam sujeitos à retenção do CRM.
- Contratação/onboarding continua no fluxo comercial existente, que bloqueia a contratação ao encaminhar e reutiliza o ID da tarefa operacional. Não foi criada segunda rotina.

## Evidências e estado de cada capacidade

| Capacidade | Classificação | Evidência / limite |
|---|---|---|
| Fonte Zernio existente | Validada com integração real (leitura) | Consulta autorizada identificou conexão ativa, 3 posts, 4 campanhas, 500 conversas e sincronização concluída em 07/11. Nenhuma credencial foi lida. |
| Novo painel e filtros | Validada com integração real (RPC/cache) e simulação (interface) | Nova RPC instalada: 2 contas, 4 campanhas, 6 dias de Ads, BRL 95,85 entre 01 e 07/11. Desktop 1440/celular 390 e filtros verificados com fixtures. |
| Lead Meta e segurança do receptor | Validada com simulação | Handler real com dependências simuladas: assinatura válida/inválida, desativação, limite, conta negada e falha transitória. SQL testa replay, preservação humana e isolamento de teste. |
| Lead de teste do provedor | Bloqueada | Falta homologar Página/formulário/escopos, configurar o endpoint assinado no servidor/provedor e entregar um lead sintético real. Não se considera o teste local equivalente a essa entrega. |
| Direct → CRM | Validada com simulação | Revisão obrigatória, responsável, replay e duas conversas vinculadas ao mesmo lead. Origem não é inventada. |
| Contratação → tarefa | Parcial (reuso) | Implementação anterior preservada, com bloqueio e IDs únicos. Não foi criada contratação real nem tarefa real durante estes testes. |
| Editorial | Validada com simulação | Revisão existente preservada; autorização de publicação separada; versão alterada recusa execução; simulação não muda status para publicado. |
| Campanhas e Central | Validada com simulação | Versão, decisão exclusiva da gestora, pedido idempotente, PAUSED, nenhum gasto, edição invalida aprovação. |
| Criação/ativação real de anúncios | Bloqueada | Não há executor real habilitado nesta entrega. Deve haver homologação do formato completo, estados de campanha/conjunto/anúncio, limites de orçamento e reconciliação de timeout antes de liberar qualquer gasto. |
| Equipe real de Marketing | Configurada; execução por missão | Camila e Vinícius foram reutilizados. Bia, Theo e Alex cadastrados pelo RPC existente, com ferramentas somente de leitura e sem novas rotinas. A gestora solicita entregas pelo Marketing e acompanha a evidência no motor; cadastro não equivale a entrega concluída. |
| CPL/CPA e atribuição completa | Parcial | Fórmulas testadas; UI recusa cálculo quando não há prova de compatibilidade da série de gasto com a aquisição atribuída. Não mistura moedas ou leads de teste. |

## Validação executada

- `npm ci --legacy-peer-deps --no-audit --no-fund`: lockfile preservado. O repositório já tem conflitos de peers de date-fns/react-day-picker e Tiptap; instalação normal sem essa opção falhou.
- `npm test -- --maxWorkers=2 --reporter=dot`: **676 testes passaram em 68 arquivos**. Verificações adicionais do receptor foram repetidas após a integração dos alertas.
- `node tests/marketing/integrado-sql.mjs`: PostgreSQL WASM isolado, sem projeto real ou API externa; valida migration, permissões, coortes, idempotência, Direct, aprovações e alertas.
- `node tests/zernio/rodar-pglite.mjs`: regressão da integração, aprovação de ações e isolamento do navegador passou.
- `npx tsc --noEmit -p tsconfig.app.json`: passou.
- `npm run build`: passou; aviso de chunks grandes permanece.
- ESLint dos arquivos novos: sem erros. `npm run lint` geral permanece com **1345 erros e 115 avisos**, distribuídos pelo repositório; não foi feita reforma fora do escopo.
- `tests/marketing/interface.cjs`: desktop, celular, seis menus, criação de ideia, Campanhas/Resultados, separação de leads de teste no CRM e nenhum erro de runtime. Todas as APIs e sessões foram fictícias; rede externa interceptada.

## Instalação e homologação

1. **Concluído:** aplicada somente a migration aditiva `20261107192003_marketing_integrado.sql` pelo conector, sem executar migrations antigas. O nome do arquivo foi alinhado à versão real registrada no Supabase para evitar reaplicação pelo CLI. O estado histórico da branch main não foi alterado e nenhuma branch paga foi criada.
2. **Concluído:** publicados `zernio` v7, `motor-missoes` v9 e `marketing-leads` v1. HTTP sem sessão: 401 nos internos; 503 com confirmação de receptor desligado no webhook. Zernio live foi comparado ao bundle da base e era idêntico byte a byte. No motor foram preservados os arquivos live e incluídos somente os sete comandos/linhas dos dois executores simulados; endpoints de automações presentes no main e ausentes no live não foram publicados como mudança colateral.
3. Publicar o frontend e comparar conta/período nos dois painéis. Conferir permissões da equipe e métricas reais sem enviar nada.
4. No servidor, configurar o segredo exclusivo do webhook pelo mecanismo seguro existente; não colocá-lo em chat, frontend ou commit. Registrar endpoint `marketing-leads` no provedor somente para eventos necessários. `MARKETING_LEADS_HABILITADO=true` somente na homologação preparada; `MARKETING_LEADS_SOMENTE_TESTE` permanece true.
5. Conferir Página, leitura de formulários/leads, termos e privacidade. Usar formulário exclusivo de teste, gerar lead sintético autorizado e comprovar um registro após repetição/reconciliação.
6. Equipe real configurada em 07/11: Camila e Vinícius preservados; Bia, Theo e Alex com execução manual e leituras mínimas. Antes de considerar homologada a geração, solicitar e revisar uma entrega no motor existente. Nenhum envio ou aumento de orçamento foi habilitado.
7. Antes de anúncios reais, implementar/homologar o executor específico e limites por conta/moeda. Aprovação simulada não autoriza gasto ou ativação futura.

### Reversão

Desativar receptor/ações novas, voltar frontend e handlers à versão anterior e revogar EXECUTE das RPCs novas. Preservar tabelas novas, origens e vínculos para não perder deduplicação ou auditoria. A migration não remove registros antigos; não se recomenda DROP de dados como rollback.

## Referências conferidas

- [Supabase changelog e alterações](https://supabase.com/changelog?types=breaking-change), [funções e privilégios](https://supabase.com/docs/guides/database/functions).
- [Zernio Webhooks](https://docs.zernio.com/webhooks), [Lead Forms e reconciliação](https://docs.zernio.com/platforms/meta-ads/lead-forms), [Campanhas](https://docs.zernio.com/platforms/meta-ads/campaigns).
- [Provimento 205/2021](https://www.oab.org.br/leisnormas/legislacao/provimentos/205-2021), [Comitê Regulador](https://marketingjuridico.oab.org.br/). A revisão humana confere também atos posteriores e as regras aplicáveis no momento de cada veiculação; este software não certifica conformidade jurídica automaticamente.

## Instalação de produção autorizada e verificada

O bloqueio inicial de aprovação foi resolvido após autorização explícita da gestora para aplicar a migration e publicar as três funções no projeto principal. A nova RPC foi conferida com dados reais e permissões verificadas: anon sem EXECUTE, ingestão somente pelo backend e cinco tabelas privadas com RLS. Não há formulários habilitados.

O advisor manteve a mesma contagem de avisos anteriores. Acrescentou cinco informações RLS sem política nas tabelas privadas: acesso direto de anon/authenticated revogado, com acesso apenas pelo backend e pelas RPCs que validam a pessoa. Referência: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy.

Juliana confirmou os termos e a privacidade. O formulário de teste e a entrega técnica assinada ainda precisam de homologação; isso não impede usar o painel, a triagem manual e os rascunhos internos. Criação real de anúncios e a ligação da publicação editorial à execução externa continuam com as limitações descritas acima. Os cinco agentes reais estão cadastrados; a geração de uma entrega não foi simulada como execução bem-sucedida.

## Complemento de 07/11 — equipe real e descoberta de formulários

- Hostinger usa a conexão GitHub/aplicação Node.js, conforme a gestora. O dashboard com investimento, funil e prioridades foi encontrado nos arquivos públicos servidos pelo domínio.
- Migration `20261107232918_marketing_equipe_real.sql`: consulta autenticada da equipe de Marketing, sem prompts ou configurações privadas. Camila e Vinícius passam a aparecer pelos nomes reais.
- Script idempotente `scripts/marketing/provisionar-equipe.sql`, validado com rollback antes de persistir: cria Bia, Theo e Alex pela mesma configuração do Escritório, com supervisora existente, sem alterar agentes anteriores, orçamento ou agendamento. Ferramentas novas são somente de leitura.
- `zernio` versão 8: ação administrativa `descobrir_formularios`, GET paginado oficial por conta ativa/selecionada e sem reconexão pendente. Retorna apenas ID, nome, Página quando fornecida e estado. Não consulta respostas, não cria formulário ou lead e não muda a autorização de homologação.
- Configurações permite escolher uma conta, consultar os formulários e preencher o cadastro de teste a partir da seleção. Se o provedor omitir a Página, o campo permanece em branco para conferência; não é inferido.
- Referência técnica: https://docs.zernio.com/platforms/meta-ads/lead-forms e contrato do SDK oficial https://github.com/zernio-dev/zernio-node/blob/main/src/generated/types.gen.ts.
- Validação: 33 verificações SQL isoladas; 13 testes de normalização/handler/interface (incluindo conta arbitrária, usuário sem gestão, agente desativado e reconexão). Chromium confirmou dashboard, solicitação de missão no celular e ausência de erros de runtime com APIs simuladas. Consulta autenticada real da equipe e estado das ferramentas conferidos em produção.
- Ainda pendentes: escolha do formulário real, configuração do webhook assinado e entrega de lead de teste do provedor; executor de criação pausada/ativação de anúncios e homologação da publicação vinculada à versão editorial. Receptor e automações externas não foram ativados.

## Consulta Meta solicitada pela gestora (somente leitura)

A gestora pediu os nomes exatos da Página selecionada, contas de anúncios no escopo e formulários antes de escolher o teste. Foi instalada a migration `20261107234742_marketing_consulta_meta.sql` e o Zernio v9. A consulta usa o job e o cron Zernio existentes: só GET `/v1/accounts`, `/v1/ads/accounts` com `inScopeOnly=true` e `/v1/ads/lead-forms`. Não lê respostas de leads e reduz imediatamente as respostas a nomes/IDs; logs recebem apenas códigos fixos. Paginação limitada sinaliza consulta parcial, sem fingir completude.

O job real terminou concluído: uma conexão Meta Ads, uma Página selecionada, uma conta de anúncios no escopo e sete formulários; consulta completa. Os nomes e IDs foram apresentados à gestora para escolha. Nada foi criado na Meta. A campanha segue somente em validação, sem criação pausada nem ativação até aprovações específicas de conta/teto e ativação, respectivamente.

A consulta de metadados não atualiza `ultima_sync_ok_em` como se tivesse sincronizado métricas. Reserva e limite de tentativas continuam na fila existente; repetir a solicitação enquanto o job está ativo reutiliza o mesmo ID. Novos RPCs são somente service_role, com gestão ativa validada na criação. Validação isolada: 36 verificações SQL e 12 testes de formulários/handler.

A missão real de homologação de Alex concluiu em uma tentativa e duas rodadas, usando somente `zernio_saude`. Essa evidência comprova execução do motor com a ferramenta concedida; não equivale à homologação de leads, anúncios ou publicação editorial.

## Homologação suspensa e validações do CRM

A gestora informou a URL `https://julianaaraujoadvocacia.com/politica-de-privacidade/`, com texto ainda provisório, e pediu para deixar pendentes a criação do formulário `JAS | Homologação CRM` e o lead sintético. Nenhum deles foi criado; os sete formulários consultados não foram usados no teste. O código de preparo de criação foi separado da entrega e não foi instalado no projeto.

Nas demais validações, foi corrigido o contrato de reconciliação: a resposta oficial de GET `/v1/ads/lead-forms/{formId}/leads` usa `id` e `createdTime`, ao contrário do webhook (`leadgenId` e `createdAt`). Ambos agora convergem para o mesmo identificador externo e data, mantendo compatibilidade. Se a resposta trouxer outro formulário, a entrada é recusada antes de gravar.

Validação isolada: 42 verificações SQL e 17 testes de resultados/receptor. Incluem reentregas sem duplicação, revisão humana preservada, formulário não autorizado recusado, dados de teste separados dos indicadores comerciais e duas campanhas distintas compartilhando o mesmo formulário com origem correta por lead. Não se usa formulário para inferir campanha. O executor do servidor passou em `deno check`.

Para a etapa futura, formulários reais devem aceitar criação personalizada ou reutilização explícita quando finalidade/perguntas forem compatíveis, com nomes descritivos (por exemplo `JAS | Pejotização | v1`). Nenhuma funcionalidade de criação de formulário, anúncio, ativação ou orçamento está sendo considerada homologada por estes testes locais. A aprovação de cada etapa permanece separada.
