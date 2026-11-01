# Agentes DJEN e Controladoria

Os agentes `monitor-djen` e `monitor-prazos` funcionam no Supabase sem n8n. Esta versão automatiza coleta, vínculo, andamento e tarefa de triagem. A agenda interna lê diretamente a Controladoria, sem credencial Google. A cópia para o Google Agenda usa a rotina horária `Agenda da Controladoria` e a conexão Google Calendar do usuário. A interpretação jurídica e a conferência do prazo definitivo continuam com a responsável; não há cálculo de prazo por um modelo de IA nesta versão.

## Funcionamento

1. `djen-diario` acorda a cada cinco minutos e consulta até cinco monitoramentos por chamada. Cada monitoramento bem-sucedido volta após uma hora; falhas voltam após quinze minutos. A fila pode aumentar esses intervalos em carteiras maiores. O botão Monitor DJEN consulta um lote imediatamente; consulta manual mantém a exigência de gestor que já existia no módulo DJEN.
2. Publicações persistidas formam uma fila durável. O Assistente de Controladoria trata até 25 por rodada, incluindo importações antigas incompletas.
3. Processo e responsável interno ativo precisam existir. Caso contrário, a publicação permanece pendente com motivo visível. Nenhuma pessoa é escolhida por inferência.
4. Andamento, tarefa, responsáveis e vínculos são gravados em uma transação. Publicações com o mesmo identificador oficial e processo reaproveitam a tarefa, inclusive em concorrência.
5. A tarefa recebe meta interna no próximo dia útil após o recebimento, às 18h de Cuiabá. A disponibilização original permanece registrada no texto. Ela não é convertida automaticamente em data de intimação nem prazo judicial.
6. A agenda interna mostra as atividades diretamente do banco e oferece acesso ao item da Controladoria. A fila de cópia para o Google mantém alterações e exclusões até confirmação. O conector usa marcador estável na descrição e vínculo persistente para recuperar um evento já criado. O executor HTTP opcional usa identificador determinístico no Google.
7. Ao cadastrar e conferir o prazo judicial na Controladoria, o evento usa essa data como compromisso de dia inteiro. Enquanto não conferido, usa a meta interna e indica `CONFERIR PRAZO`; triagens sem prazo judicial exibem `TRIAGEM INTERNA`.

O calendário da conexão ativa é `juridico@julianaaraujoadvocacia.com`. A alternativa por conta de serviço continua disponível via `GOOGLE_CALENDAR_ID`. Estes agentes não enviam mensagens a clientes nem protocolam documentos.

## Publicação

Produção instalada e validada em 01/11/2026: as quatro migrations de agentes/agenda foram aplicadas; as três funções foram publicadas. Uma consulta real ao DJEN terminou sem erros, e uma rodada agendada de coleta e triagem também foi observada com sucesso. Foram criadas 14 novas tarefas; 16 eventos, incluindo dois itens anteriores, foram criados/releídos no Google e tiveram seus vínculos confirmados no banco. A fila de agenda ficou vazia na validação.

Juliana Araujo foi indicada pelo usuário para a triagem inicial dos oito processos existentes. Permaneceram 25 publicações sem processo cadastrado correspondente, que não geram tarefas por inferência, e uma triagem antiga atrasada, que requer revisão. Esses números são o retrato da validação, não contadores fixos.

O servidor não tinha a conta de serviço Google configurada. A rotina horária via conexão Google Calendar foi criada e habilitada. Sua execução futura depende dessa automação e da conexão permanecerem disponíveis; a sincronização inicial foi confirmada por chamadas diretas ao conector. O disparo manual da automação pela API de tarefas retornou `NOT_FOUND`, apesar de ela aparecer como habilitada na consulta. Portanto, a primeira execução horária completa ainda precisa ser observada. A agenda interna e os jobs Supabase funcionam independentemente dessa cópia externa.

Aplicar em ambiente de teste primeiro:

1. Conferir que o projeto é `mzwnljgujheumdslkloc` e que as migrations anteriores, inclusive `20261031120000_agentes_ia_controle.sql`, foram aplicadas.
2. Pausar `djen-diario` durante a instalação para evitar incompatibilidade entre versões.
3. Aplicar `20261101142313_agentes_djen_nativos.sql`, `20261101143142_djen_agenda_recuperavel.sql` e `20261101151455_agenda_djen_conector.sql`. Os novos jobs são criados pausados para permitir homologação antes da ativação. Na implantação inicial, o histórico foi alinhado às versões dos arquivos após conferir as migrations efetivamente aplicadas.
4. Publicar `agentes-disparar`, `pje-comunica-sync` e `controladoria-sync-calendar`, incluindo os módulos `_shared` importados. Usar a configuração de JWT do arquivo `supabase/config.toml`: cada endpoint valida usuário ou segredo no handler.
5. Verificar a existência de `djen_cron_secret` e `calendar_sync_secret` no Vault, sem exibir seus valores. Para usar o executor HTTP Google, configurar `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` e `GOOGLE_CALENDAR_ID`, com acesso de escrita. Para usar o conector, verificar o acesso de escrita da conta Google conectada ao calendário autorizado.
6. Publicar a interface, conferir uma publicação conhecida e executar os agentes. Confirmar tarefa, vínculo, responsável e evento correto; testar a conferência de uma data judicial.
7. Ativar `djen-diario` e `djen-triagem`. Para a cópia Google, usar somente um executor: rotina horária do conector, ou job `djen-agenda` depois de configurar a conta de serviço e desativar a rotina do conector. Na configuração atual, `djen-agenda` permanece pausado.

Os jobs de triagem e agenda não dependem da ativação dos gatilhos antigos do Google Calendar: a outbox DJEN possui gatilhos próprios, restritos a itens com origem `pje_publicacao`. A migration também enfileira itens DJEN abertos sem evento ou com falha anterior. Ela não reativa a sincronização geral de outros tipos de item.

## Falhas e pausa

O painel Agentes de IA mostra última consulta concluída, quantidade de pendências e até cinco falhas por etapa. Corrigir processo/responsável ou autorização Google e executar Assistente de Controladoria para reabrir tentativas com erro. A agenda será despachada na rodada seguinte.

- Triagem: até oito tentativas, com espera progressiva; nova tentativa manual pode reabrir após correção.
- Agenda: até oito tentativas. O conector reserva o trabalho por vinte minutos e confirma a revisão após reler o evento. No executor HTTP opcional, a resposta é conferida na rodada seguinte. Uma nova edição do item cria nova revisão e reinicia as tentativas.
- Alterações enquanto um envio está em andamento não reaproveitam a confirmação da revisão anterior.
- Execuções manuais nativas interrompidas por mais de dez minutos são marcadas como erro; as publicações permanecem na fila.
- Desativar `monitor-djen` pausa novas coletas agendadas; desativar `monitor-prazos` pausa a triagem. Para interromper a cópia Google, pausar a rotina `Agenda da Controladoria` e, se estiver ativo, o job `djen-agenda`. A agenda interna continua refletindo os registros do sistema. Cancelamento não desfaz trabalho que já começou.

Os agentes externos antigos continuam opcionais e exigem n8n configurado. Sua aprovação registra uma revisão; não há retomada automática de workflow externo nesta entrega. O token desses webhooks só pode ser enviado ao servidor HTTPS configurado em `N8N_BASE_URL`, sem seguir redirecionamentos.

## Validação e limites

Testes React/Vitest, compilação e TypeScript do frontend; Deno com as versões exatas do Supabase importadas; PostgreSQL 17 isolado para rollback, repetição, deduplicação, retomada, aprovação, permissões e concorrência. O bootstrap SQL reproduz contratos mínimos das tabelas e simula cron, Vault e HTTP. Ele não substitui homologação no schema completo do projeto nem uma chamada real ao DJEN/Google.

A consulta continua sujeita à paginação e aos limites da API DJEN existente. As garantias de não duplicação de tarefa dependem do identificador oficial ou hash fornecido pela fonte. Os testes locais de agenda simulam HTTP; a gravação/releitura real dos 16 eventos validou o conector, mas não comprova a autorização da conta de serviço ausente. O domínio respondeu HTTP 200 com identificação padrão de navegador; a visualização autenticada completa não foi inspecionada neste ambiente.
