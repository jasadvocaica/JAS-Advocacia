# Operação automática e Telegram

O cron `operacao24h-pulso` verifica a operação a cada cinco minutos, todos os dias, no Supabase. O motor de missões existente executa as tarefas. Não depende de manter uma conversa ou navegador aberto.

Manu acompanha pendências de leads e aprovações; Helena faz triagem da Controladoria; Sofia identifica falhas e perfis sem executor. Só recebem nova missão quando as contagens relevantes mudam, há pendências e passou pelo menos uma hora desde a última triagem. A consulta operacional é obrigatória antes de concluir e essas missões usam apenas a ferramenta de leitura. As entregas ficam registradas no painel do Telegram, na Sala da Gestora. Os limites existentes de orçamento, tentativas e reserva continuam aplicados.

As quatro rotinas de Marketing passam a trabalhar todos os dias, em seus horários próprios, incluindo fins de semana. Os conteúdos continuam sujeitos à revisão. O monitor não publica, ativa campanhas, altera responsáveis ou calcula prazos jurídicos. O coletor DJEN permanece separado e o job HTTP `djen-agenda` continua desligado.

Os resumos são enviados às 09:30 e 18:00 em America/Cuiaba; mudanças são agrupadas com intervalo mínimo de uma hora, e novos alertas críticos respeitam intervalo de 30 minutos. Horários e pausas podem ser ajustados no painel. `/resumo` permite consultar manualmente. Apenas a gestora das rotinas existentes recebe ativação inicial, no seu chat privado já vinculado. A autorização é conferida novamente imediatamente antes de enviar.

O texto contém contagens de leads comerciais, aprovações, tarefas e falhas; exclui leads marcados como teste. Não contém nomes, contatos ou detalhes de casos. As triagens internas de Helena podem consultar até dez tarefas reais no JAS para orientar a revisão, sem exportar essa lista para o Telegram.

Reservas atômicas e chaves únicas evitam entregas concorrentes. O estado `enviado` exige o ID real retornado pelo Telegram. Se o transporte tiver resultado desconhecido, o estado fica `incerto` e não há reenvio automático. Somente rejeição conhecida por limite (429) pode ser repetida, com espera e máximo de três tentativas. Relatórios automáticos antigos são substituídos pelos mais recentes e expiram em três horas.

Instalação: aplicar a migração; publicar os handlers `telegram` e `motor-missoes`; executar `scripts/operacao24h-bootstrap.sql`. A migração cria o cron inicialmente desligado; o bootstrap só liga esse cron e desativa os intervalos antigos de Manu e Helena para evitar duplicação. Em atualizações, preservar os demais arquivos e recursos da versão viva das Edge Functions.

Validação: `node tests/agentes/operacao24h-sql.mjs`, testes Vitest do diretório `src/pages/agentes-ia/escritorio/telegram`, TypeScript e Deno check. Em produção, confirmar estados de envio e entrega das tarefas, sem consultar ou imprimir IDs de chats ou segredos.
