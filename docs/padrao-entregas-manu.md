# Padrão oficial de entregas — Manu

Os modelos centralizados ficam em `supabase/functions/telegram/modelos.ts`. Status oficiais: 🟢 Concluído, 🟡 Pendente, 🔴 Urgente, 🔵 Em andamento e ⚪ Não verificado. Cada documento identifica tipo, agente, referência em Cuiabá, status e fonte. Um relatório concluído não significa que todas as tarefas relatadas foram concluídas.

O renderer usa HTML nativo do Telegram, escapa todo texto recebido e divide mensagens antes do limite. Cada parte tem cabeçalho próprio e indicação da sequência. Não corta entidades HTML, pares Unicode ou o conteúdo restante. Links de detalhes usam somente o JAS. Campos ausentes aparecem como não informados, sem números ou confirmações inventados.

Os modelos abrangem agenda, Controladoria, financeiro, Marketing, tarefas, alertas, jurídico, gerencial, roteiros e legendas. Relatórios financeiros distinguem recebidos, previstos, vencidos e despesas. Jurídico separa prazo identificado de conferência confirmada pelo sistema; o renderer não transforma afirmação do modelo em confirmação de prazo. Relatórios operacionais informam período, fonte, resumo, detalhes, pendências, prioridades, responsáveis e providências. Os resumos agregados exibem até dez grupos de responsáveis e não expõem fichas de clientes.

Roteiros para gravação têm tema/objetivo/público/duração estimada, gancho pronto, texto integral falado, CTA, orientações e legenda. O padrão entra nas instruções do motor e no formato editorial. A gravação/publicação e a conformidade jurídica permanecem sujeitas à revisão humana. Solicitações de roteiro não podem concluir como tópicos incompletos.

Toda entrega é registrada em `escritorio_privado.telegram_manu_entregas`, com usuário/chat, snapshot do documento, partes e IDs reais das mensagens confirmadas. RLS e funções exclusivas do backend impedem leitura pública. O vínculo privado é conferido novamente antes de reservar cada parte. Partes confirmadas são reutilizadas em retomadas conhecidas; partes com resultado incerto não são repetidas automaticamente.

Botões de detalhes consultam apenas entregas do próprio vínculo. Solicitar ajustes pede o texto da diretora e o associa à entrega; gerar nova versão registra trabalho real, preserva o histórico e evita duplo clique enquanto a revisão está em andamento. Revisões de pautas suspendem aprovações obsoletas pelo fluxo existente. Aprovar pauta valida a versão e chama a mesma decisão do Marketing; só retorna confirmação após consultar o estado persistido. Não aprova o material final nem publica. Outros pedidos sensíveis mantêm o fluxo de aprovação existente.

Missões automáticas de Marketing e backoffice também são encaminhadas pela Manu quando encerram, apenas para a gestora com vínculo e avisos ativos. Não há envio retroativo em massa. As solicitações do Telegram já possuem seu aviso próprio, sem duplicá-lo. Os limites de orçamento e de tentativas continuam aplicados. O teto por resposta do motor é 1.800 tokens para acomodar a entrega completa, com reserva prévia dentro do orçamento vigente.

Instalação: aplicar as migrações `telegram_materializar_pautas` e `telegram_padrao_entregas_manu` após as migrações de conversa; publicar os arquivos do Telegram e o motor preservando os demais recursos da versão viva. O motor importa o modelo central e precisa levar esse arquivo no bundle. Não alterar o executor DJEN ou ativar `djen-agenda`.

Verificar: SQL `tests/agentes/manu-entregas-sql.mjs`, testes Vitest do Telegram, TypeScript e Deno. Homologar um documento real no Telegram e conferir os IDs de todas as partes, sem imprimir identificadores de chats, dados de clientes, tokens ou chaves.
