# Assistente Bia — OpenAI

## Diagnóstico e arquitetura

O sistema usa React 18, TypeScript, Vite, componentes shadcn/Radix e Supabase Auth. PostgreSQL e RLS controlam as carteiras e permissões existentes. O backend é composto por Edge Functions Deno. O chat, a página `/assistente` e a tabela `assistente_conversas` já existiam; foram reutilizados. O assistente anterior usava um gateway de outro provedor e montava contexto com service role, sem os controles necessários por módulo.

A nova função `assistente-chat` autentica o JWT com `getUser`, verifica perfil interno ativo e permissões atuais, admite somente ferramentas de consulta registradas e acessa os dados jurídicos/financeiros com o JWT do usuário, sujeito a RLS. A service role é usada exclusivamente para reservas de consumo e persistência do histórico próprio; nunca para consultas do escritório. Não há SQL fornecido pelo modelo, MCP obrigatório, leitura de arquivos pessoais, folha salarial, pagamentos ou operações de escrita em cadastros.

## Configuração

1. No projeto Supabase JAS `mzwnljgujheumdslkloc`, configurar o secret `OPENAI_API_KEY` em Edge Functions → Secrets. Nunca colocar essa chave no frontend, no GitHub ou no chat.
2. Variáveis nativas do backend: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Frontend mantém apenas URL e chave publicável do projeto.
3. Conferir condições de confidencialidade e retenção da conta OpenAI. A API não usa os dados para treinamento por padrão; `store:false` evita estado de aplicação persistido nesta integração, mas não garante Zero Data Retention: monitoramento de abuso pode reter dados por até 30 dias. ZDR depende de elegibilidade e configuração da organização. Referência: https://developers.openai.com/api/docs/guides/your-data
4. Em `/assistente`, a gestora abre **Consumo e configuração da IA**, define os limites e habilita o assistente. O valor inicial de `habilitado` é false. Não habilitar sem secret e validação. O frontend não exige a antiga variável `VITE_BIA_ENABLED`.

## Modelo e consumo

Modelo fixado: `gpt-4.1-mini-2025-04-14`, com suporte a Responses e function calling, escolhido por custo e saída estruturada. A configuração guarda o modelo; esta versão só admite o snapshot testado. Trocar para outro modelo exige atualizar a lista admitida, preços, reserva máxima e testes. Referências: https://developers.openai.com/api/docs/models/gpt-4.1-mini e https://developers.openai.com/api/docs/guides/function-calling

Estimativa vigente usada: USD 0,40/milhão de tokens de entrada e USD 1,60/milhão de saída, conservando o preço de entrada integral para tokens cacheados. É estimativa, não fatura. Até quatro chamadas à OpenAI, seis ferramentas, 1.000 tokens de saída por chamada e 32.000 caracteres de contexto acumulado. Até 25 registros nas listas e 500 por fonte nos resumos. Períodos limitados a 93 dias. Resultados parciais são identificados.

O teto global escolhido para o escritório é **50.000 tokens por dia**, somando entrada e saída. O dia renova à meia-noite de `America/Cuiaba`. Antes de cada geração, o backend conta a entrada pelo endpoint oficial `/v1/responses/input_tokens` e reserva essa contagem mais o máximo de saída no PostgreSQL. Um lock global impede ultrapassar o teto por concorrência; a mesma solicitação/rodada não pode ser reservada duas vezes. Se a contagem ou a reserva falhar, não há geração.

Após resposta com uso confirmado, a reserva é substituída pelos tokens efetivamente informados pelo provedor. Falha ou interrupção sem uso confirmado mantém a reserva por todo o dia, pois a chamada pode ter sido cobrada. Contagem inesperadamente superior à reserva desativa o assistente e preserva o consumo real. O consumo anterior à implantação é incluído sem duplicação. A tela mostra usado, reservado e disponível; somente a gestão pode mudar o teto.

O controle cobre as gerações da API OpenAI feitas por `assistente-chat/limites.ts`; novos agentes que usem a mesma API devem reutilizar esse caminho. Ele não limita uso da mesma chave fora do sistema nem o consumo de modelos da plataforma que executa a rotina de agenda. Coleta DJEN, triagem determinística e agenda interna não consomem a chave OpenAI.

Reserva transacional de USD 0,20 antes de chamar a API, protegida por lock no banco. Limites padrão anteriores foram mantidos: USD 10 por usuário/mês, USD 100 global/mês, 30 solicitações por usuário/dia, intervalo mínimo de 15 segundos e uma solicitação pendente por usuário. Pedidos duplicados não geram nova chamada. Os contadores anteriores de USD/solicitações usam UTC; o novo teto diário de tokens usa Cuiabá. Reservas de falhas ou interrupções permanecem conservadoramente contabilizadas. A gestora consulta consumo total e individual sem acesso às conversas de terceiros.

## Ferramentas e permissões

Clientes: buscar_clientes, consultar_cliente. Processos: listar_processos_cliente, buscar_processos, consultar_processo, listar_processos_por_status, listar_processos_por_responsavel. Prazos/tarefas/agenda: listar_prazos, listar_prazos_proximos, listar_prazos_atrasados, consultar_pendencias_controladoria, consultar_agenda, listar_compromissos_por_responsavel, listar_atividades, consultar_atividades_por_responsavel, resumo_produtividade, listar_atividades_atrasadas. Diligências: listar_diligencias, consultar_diligencia. Financeiro: resumo_financeiro, consultar_receitas, consultar_despesas, listar_recebimentos_pendentes, comparar_periodos_financeiros.

Cada grupo requer a permissão de visualizar do módulo existente. Diligências usa os perfis existentes gestor, advogado e controladoria; a equipe consulta somente diligências que criou e vinculadas à sua carteira. Agenda reutiliza audiências, reuniões, diligências, perícias e conciliações de controladoria. A equipe consulta suas tarefas atribuídas; a gestão pode analisar distribuição. Permissões são revalidadas a cada ferramenta e antes da entrega. Não são enviados CPF, contato pessoal, salário ou textos integrais; apenas projeções mínimas necessárias à pergunta. Fontes são links internos já protegidos pelas rotas do sistema. Links inventados pelo modelo são apresentados como texto.

## Histórico e retenção

Histórico próprio por padrão, inclusive para a gestora: ninguém visualiza a conversa de outro usuário. O backend salva mensagens e fontes; o navegador não pode inserir ou adulterar respostas persistidas. O histórico usado como contexto contém somente até seis mensagens anteriores do usuário, sem reutilizar respostas com dados internos; evidências são reconsultadas.

Um hash do escopo atual considera perfil, roles, permissões e carteiras/tarefas/diligências próprias. Mudanças de acesso tornam conversas anteriores indisponíveis até revisão; inclusão de novos registros acessíveis também pode invalidar o hash conservadoramente. Históricos antigos foram preservados, mas não expostos automaticamente nesta versão por não possuírem o escopo verificado. Não foram apagados ou enviados à OpenAI.

Retenção padrão de 30 dias após a última interação, configurável entre 1 e 365 dias para novas conversas; mudanças de configuração valem para novas interações. Exclusão manual pela lixeira. Cron diário às 10:25 UTC (06:25 Cuiabá) elimina somente conversas com expiração definida e vencida. Consumo e auditoria mínima ficam por 13 meses, sem prompts, parâmetros ou resultados sensíveis nos logs de consumo. Mudança de usuário limpa estado e cancela a chamada no navegador. Cancelamento informa o backend; chamadas já enviadas ao provedor podem gerar custo.

## Deploy

Migrations incrementais `20261012122235_assistente_openai_seguro.sql` e `20261012123407_assistente_escopo_diligencias.sql` aplicadas no JAS. Não reaplicar manualmente no banco já migrado. A migration adiciona o hash/expiração no histórico existente e somente duas tabelas indispensáveis: configuração e consumo/auditoria. Nenhuma tabela de clientes, processos ou financeiro foi modificada.

Deploy da Edge Function `assistente-chat`, incluindo `index.ts` e `tools.ts`. `verify_jwt=false` no gateway porque a função valida o JWT por `getUser` antes de qualquer operação e suporta as chaves atuais do projeto. Não existe endpoint anônimo de consulta. A publicação do frontend segue `jasadvocaica/JAS-Advocacia`, com base `/` e hospedagem externa vinculada ao GitHub.

Arquivos principais: supabase/functions/assistente-chat/{index,tools}.ts; src/pages/assistente/{useAssistenteChat,AssistenteIA}.tsx/ts; src/components/assistente/{AssistenteFlutuante,MensagemAssistente,ConsumoAssistente}.tsx; ponto de extensão global em AppLayout; supabase/config.toml; migration e testes. Nenhum painel inicial ou da gestora foi alterado.

## Validação e limitações

Testes de ferramentas: bloqueio financeiro, IDs manipulados, tentativa de SQL/escrita, períodos, escopo próprio, consulta de clientes/processos/prazos/diligências/produtividade/financeiro e fontes mínimas. Testes do hook: conversa, resposta, nova conversa, erro, cancelamento e isolamento na troca de usuário. `tests/assistente/seguranca.sql` usa dados sintéticos e ROLLBACK: isolamento do histórico, revogação de permissão, ausência de processos fora da carteira, bloqueio de adulteração, configuração pela equipe, duplicação e concorrência. `tests/assistente/interface.cjs` usa mocks, Chromium e Playwright Core para desktop/celular e fontes; não chama a OpenAI nem o banco real.

460 testes automatizados aprovados na validação de 01/11/2026, incluindo bloqueio de geração sem saldo, contagem de entrada indisponível, reserva antes da geração, confirmação de uso e prevenção de duplicação. Typecheck Deno, TypeScript efetivo do frontend e build de produção aprovados. PostgreSQL 17 isolado verificou teto global e duas reservas concorrentes disputando o mesmo saldo. A descoberta de metadados pelo GraphQL permanece sujeita às permissões/RLS; a tabela de reservas de tokens é exclusiva do backend.

A validação de resposta real da OpenAI depende do secret e da habilitação. Não confundir testes com mocks e verificação de autenticação com uma chamada real bem-sucedida. Não ativar enquanto houver falha crítica de autorização.

Em 01/11/2026, a chave foi aceita no diagnóstico autenticado de disponibilidade do modelo e o teto de 50.000 tokens foi instalado. O assistente permaneceu desativado aguardando confirmação explícita para iniciar consumo pago; nenhuma geração foi executada nessa validação. O teste de geração protegido exige assistente habilitado, gestor ativo e reserva de orçamento. A migration `20261101154020_limite_diario_tokens_openai.sql` implementa o teto; os testes de `tests/assistente/tokens*` verificam limite, duplicação, renovação e duas reservas concorrentes reais.

Futuro: suporte a outros modelos com orçamento recalculado, revisão controlada de históricos antigos, consultas agregadas adicionais e eventual proposta de escrita com confirmação explícita, revalidação e auditoria. Nenhuma escrita de negócio está implementada nesta versão.
