# Clara M1 — homologação de TXT → cliente fictício

## Escopo e estado

M0 está documentado em `docs/auditorias/2026-11-01-M0-escritorio-inteligente.md`. M1 implementa somente TXT, cliente pessoa física fictícia, CPF confirmado, contato e revisão obrigatória. Não é Alex completo, não importa processos nem consulta fontes jurídicas. PDF/DOCX, OCR e múltiplos clientes pertencem aos próximos marcos.

O schema `homologacao` espelha a estrutura de `public.clientes` com `LIKE`, sem copiar dados, triggers, índices ou chaves estrangeiras de negócio. A função nativa `clara_m1_aprovar` grava exclusivamente em `homologacao.clientes`, como prospecto inativo; nunca escreve em `public.clientes`, processos, agenda ou financeiro. Os demais campos são preservados pelos defaults do contrato. Não são geradas comunicações externas.

A migração inicia `homologacao.clara_config.habilitado=false`. Não há instalação automática em produção por CI. Instalação no único projeto acessível, JAS, exige aprovação do ambiente conforme seção 20 da especificação aceita.

## Contratos

Endpoint dedicado `clara-comando`, com autenticação própria (`getUser`), gestor interno ativo e permissão `clientes/criar`. As funções SQL são `SECURITY INVOKER` e exclusivas de `service_role`. O schema de homologação não é exposto ao navegador nem a `anon/authenticated`.

- `status`: estado real da homologação.
- `receber`: comando, `ambiente:"homologacao"`, `dados_ficticios:true`, nome `.txt` e texto até 12.000 caracteres. Hash SHA-256 por conteúdo/versão/usuária fornece idempotência.
- `executar`: `tarefa_id`, reserva sob lock, até três tentativas manuais; resposta e consumo reais, sem retry automático de geração.
- `consultar`: snapshot sem texto integral e linha do tempo, somente da usuária proprietária.
- `aprovar`: cadastra no espelho ou reutiliza CPF existente sem sobrescrever; divergência de nome gera pendência. Aprovação repetida é idempotente.
- `cancelar`: cancela etapas ainda não concluídas.
- `recuperar`: marca como falha uma execução interrompida há mais de dez minutos, sem liberar reservas financeiras incertas. A próxima tentativa é explícita.

A geração usa `respostaComLimite`, sem ferramentas de escrita e com limite de saída de 1.000 tokens. Entrada é contada antes da reserva no orçamento global de 50.000 tokens/dia. Nenhuma chamada é feita ao atualizar ou consultar a tela. A preços configuráveis por milhão de tokens, com data de vigência, registra custo estimado; não é promessa de valor da fatura.

O código rejeita campos fora do contrato, valida CPF, contato, data e proveniência literal. Conflitos, múltiplos CPFs rotulados, ausência de identificadores/contato ou cadastro de menor produzem pendência. Isso não equivale a verificação de identidade civil. A revisão deve conferir os trechos e não apenas o nome do campo. Campos não extraídos não são inventados.

## Instalação revisável (não executar sem confirmar o ambiente)

1. Confirmar o schema e a autorização para instalar homologação no projeto escolhido. Registrar o estado antes da alteração. Não resetar migrations nem copiar dados de clientes.
2. Aplicar `supabase/migrations/20261101180430_clara_m1_homologacao.sql` e verificar grants/RLS. A instalação não ativa o fluxo.
3. Publicar `clara-comando` com seus imports: `_shared/clara.ts`, `assistente-chat/limites.ts` e `src/lib/cpf.ts`. `verify_jwt=false` porque o handler faz autenticação própria e permite diagnóstico privado do teste controlado.
4. Reutilizar somente os Secrets já presentes no servidor. Não exportar valores de `OPENAI_API_KEY`, chaves Supabase ou segredo cron. O teste não precisa de segredo no frontend.
5. Após aprovação, ativar apenas `homologacao.clara_config`: `update homologacao.clara_config set habilitado=true where id;`. O teto em `public.assistente_config` não é ampliado.
6. Executar o teste controlado descrito abaixo, confirmar o cadastro e a repetição, registrar evidências e somente então integrar/publicar a UI segundo o fluxo acordado.

## Teste real controlado

A ação interna `teste_m1` valida o segredo cron existente pelo RPC, exige `usuario_teste` gestor ativo e usa **somente** `CLARA_EXEMPLO`, nunca documento arbitrário do corpo. Essa ação passa pelo mesmo recebimento, reserva, IA e validação, retornando prévia para aprovação. Não aprova automaticamente. O segredo pode ser aplicado internamente em `net.http_post`, sem ser devolvido por consulta.

Após a prévia, conferir que nome, CPF de fixture e e-mail `.invalid` correspondem ao exemplo antes de aprovar. Confirmar o UUID e campos em `homologacao.clientes`. Repetir `teste_m1`: deve retornar o mesmo `tarefa_id` e cliente, sem nova geração nem aumento de tokens da tarefa. Confirmar, por contagem sem dados pessoais, que `public.clientes` não sofreu inserção do fixture.

Registrar o resultado real: UUID da tarefa, UUID do cliente fictício, tokens de entrada/saída, custo estimado e eventos. Não registrar a chave. Até executar esse teste, o marco é **PARCIAL / aguardando homologação real**, mesmo com testes locais passando.

## Uso na interface

`/escritorio` abre a Central de Comando. Escolher **Usar exemplo fictício**, conferir a declaração, clicar **Enviar comando**, revisar campos/evidências e aprovar o cadastro fictício. O executor é escolhido automaticamente: Clara. A usuária não seleciona agente. O mapa continua em `/escritorio/planta` como visualização complementar. A tarefa mais recente é retomada pelo seu UUID local; o backend sempre revalida identidade e propriedade.

Se houver pendência, corrigir o TXT e enviar novamente; o novo conteúdo gera outra tarefa, preservando o histórico anterior. No M1 não há edição livre de campos pós-extração, evitando romper a evidência. A retomada automática por workers/agendamento pertence a M5/M6; M1 exige o disparo do executor pela interface ou endpoint autenticado.

## Testes e rollback

- `src/lib/clara-m1.test.ts`: evidências, CPF, conflito, data inválida, escopo e prompt injection.
- `CentralComando.test.tsx`: prévia, aprovação explícita e repetição sem IA.
- `tests/clara/fluxo.sql`: isolamento de usuários, nenhuma escrita em produção, gate de aprovação, idempotência e logs sem dados pessoais.
- `tests/clara/concorrencia.py`: duas sessões PostgreSQL reais para intake e aprovação concorrentes.
- Testes financeiros existentes continuam validando o hard cap de 50.000 e concorrência do orçamento.

Rollback operacional: desabilitar `homologacao.clara_config.habilitado` e retirar a função de execução de serviço. Consultas e cancelamentos podem continuar para auditoria. Não excluir tabelas, tarefas ou evidências. Nenhum registro de produção precisa ser revertido, pois não foi modificado.
