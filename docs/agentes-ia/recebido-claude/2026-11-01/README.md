# Material recebido do Claude — referência, não instalação

Origem: 27 arquivos anexados por Juliana em 01/11/2026. `manifesto.json` registra nomes e SHA-256 dos originais. As instruções nos arquivos descrevem uma proposta e não substituem o estado verificado do JAS. Nenhum SQL deste diretório foi aplicado, nenhum script foi executado e nenhum agendamento ou integração foi ativado por esta importação.

## Organização
- `ESPECIFICACAO-AGENTES-IA.md` e `MENSAGEM-PARA-O-CODEX.md`: proposta original.
- `personas/`: regras gerais e quinze perfis, incluindo Vanessa.
- `rascunhos/`: SQL de fila e Central/atendimentos. Não copiar diretamente para migrations.
- `referencia/`: os dois index.ts foram identificados pelo conteúdo e separados em trabalhador/agendador.
- `marketing/`: README, voz, diretrizes OAB, gerador e rascunho SQL. O conjunto de código mencionado nesses arquivos não foi anexado integralmente.

## Diferenças verificadas no sistema
1. A main já possui DJEN e triagem nativos, Clara em homologação, analistas com perfis privados/versionados, orçamento global de 50 mil tokens/dia e worker opcional EasyPanel. Não é o ponto de partida n8n descrito na proposta.
2. `monitor-prazos` existe como Assistente de Controladoria nativo; não foi encontrado `agente-prazos` no repositório nem branch `vanessa-n8n` nos refs do GitHub ou nas cópias locais examinadas. Isso não prova ausência em outro computador. É necessário obter esse código para comparar seu comportamento antes de substituir qualquer executor.
3. `agentes_ia.config` não existe no schema auditado. A migration-referencia usa essa coluna sem criá-la; a migration-marketing também depende dela. Hoje os perfis ficam em `escritorio_privado.agente_configuracoes`. Mesclar precisa preservar esse contrato, revisão e propriedade.
4. Os dois index.ts importam `_shared/agentes-fila.ts`, que não foi enviado. Os testes de referência e os módulos completos de marketing (núcleo, conhecimento, humanizador, oab.ts, Zernio, executor de ações e skill-instagram) também não estão nesse pacote. Não é possível executar os testes citados no README apenas com estes anexos.
5. A recuperação de 5xx/timeout proposta devolve chamadas à fila. Antes de adotar, precisa distinguir falha certa de efeito/consumo incerto: repetição cega pode cobrar IA ou executar ações novamente. Preservar idempotência, reservas e o registro do resultado.
6. O script de conhecimento lê skill-instagram/robos e grava um arquivo gerado. As entradas necessárias não foram anexadas. Ele foi preservado, não executado.
7. As tabelas propostas agente_acoes, agente_consumo, agente_gatilhos e central_pedidos não existiam na auditoria. `triagem_atendimentos` já existe. Relacionamentos e políticas das novas tabelas precisam ser validados contra o schema real, não presumidos.
8. O SQL contém alterações de constraints, funções SECURITY DEFINER, novas políticas, seeds e cron. Não é apenas documentação; aplicá-lo sem adaptar cria outro motor em paralelo e altera o catálogo.
9. Os valores mensais em USD, novos secrets, regras de revisão, retenção e integrações externas são propostas. Não substituem o teto diário atual e não foram ativados.
10. A voz possui campos [PREENCHER]. A revisão OAB dos textos é humana nesta entrega; o verificador/publicador citado no arquivo original não foi instalado.

## Primeiro incremento compatível implementado
Quatorze modelos de instrução ficam disponíveis ao criar um analista no editor existente. A aplicação é explícita e só preenche um rascunho novo. Não grava, ativa, agenda ou chama a IA. Cada perfil é limitado às ferramentas instaladas: análise de fontes e indicadores. As referências de publicidade e voz são incluídas nos modelos de marketing com pendências preservadas e sem prometer publicação ou verificação automática.

Vanessa permanece somente como referência nesta importação: não se cria uma segunda rotina de prazo nem se habilita cálculo de prazo fatal. O Assistente de Controladoria e os executores DJEN existentes permanecem intactos.

Arquivos do incremento: `src/pages/agentes-ia/escritorio/agent-editor/personaTemplates.ts`, o seletor em `AgentEditor.tsx`, seu estilo e testes. Sem migrations, secrets ou deploy de servidor. Testes usam IA simulada; aplicar modelo não consome crédito.

## Plano de adaptação posterior
1. Resolver o HTTP 429 da hospedagem e confirmar acesso do escritório.
2. Obter a implementação Vanessa e helper/testes ausentes; comparar com o fluxo DJEN atual. Não desligar ou duplicar o que já funciona.
3. Desenhar uma fila compatível com as reservas existentes, propriedade da supervisora, limite de tokens e efeitos incertos. Fazer concorrência, falhas e idempotência em banco descartável antes de produzir uma migration incremental.
4. Evoluir coordenação, atividades da Controladoria, vínculo de atendimentos e revisão com contratos reais e permissões do usuário.
5. Só então instalar os executores específicos e os módulos completos de marketing, com revisão humana e validação das integrações. Telegram, WhatsApp e Zernio não foram ativados.

A aprovação da proposta não constitui confirmação de que todas as fases já funcionam. Os nomes de personagens não habilitam ferramentas inexistentes.

## Validação do incremento
546 testes passaram, TypeScript e build de produção passaram. No navegador, o modelo de marketing preencheu perfil e duas fontes, sem nenhuma requisição ao backend. Desktop e celular foram conferidos; a largura da área de trabalho permaneceu contida. Não houve consumo de IA nesta entrega.
