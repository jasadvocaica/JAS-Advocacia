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
| Nina, Bela, Bia, Theo e Alex | Parcial | Consulta ao cadastro real não encontrou agentes com esses nomes. Interface informa ausência de executor e mantém o fluxo manual/missões existente; não apresenta agentes fictícios como operacionais. |
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
6. Configurar agentes reais e suas ferramentas individualmente, preservando o orçamento e as aprovações existentes. Não ativar automações de envio por consequência da configuração.
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

Juliana confirmou os termos e a privacidade. O formulário de teste e a entrega técnica assinada ainda precisam de homologação; isso não impede usar o painel, a triagem manual e os rascunhos internos. Criação real de anúncios, publicação real e os cinco agentes específicos continuam com as limitações descritas acima.
