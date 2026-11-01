# Agentes DJEN e Controladoria

Os agentes `monitor-djen` e `monitor-prazos` funcionam no Supabase sem n8n, Claude aberto ou navegador aberto. Esta primeira versão automatiza coleta, vínculo, andamento, tarefa de triagem e sincronização da agenda. A interpretação jurídica e a conferência do prazo definitivo continuam com a responsável; não há cálculo de prazo por um modelo de IA nesta versão.

## Funcionamento

1. `djen-diario` acorda a cada cinco minutos e consulta até cinco monitoramentos por chamada. Cada monitoramento bem-sucedido volta após uma hora; falhas voltam após quinze minutos. A fila pode aumentar esses intervalos em carteiras maiores. O botão Monitor DJEN consulta um lote imediatamente; consulta manual mantém a exigência de gestor que já existia no módulo DJEN.
2. Publicações persistidas formam uma fila durável. O Assistente de Controladoria trata até 25 por rodada, incluindo importações antigas incompletas.
3. Processo e responsável interno ativo precisam existir. Caso contrário, a publicação permanece pendente com motivo visível. Nenhuma pessoa é escolhida por inferência.
4. Andamento, tarefa, responsáveis e vínculos são gravados em uma transação. Publicações com o mesmo identificador oficial e processo reaproveitam a tarefa, inclusive em concorrência.
5. A tarefa recebe meta interna no próximo dia útil após o recebimento, às 18h de Cuiabá. A disponibilização original permanece registrada no texto. Ela não é convertida automaticamente em data de intimação nem prazo judicial.
6. A fila de agenda mantém alterações e exclusões até receber confirmação HTTP da função de sincronização. O evento usa identificador estável para recuperar criação anterior sem duplicar após falha de conexão ou de gravação local.
7. Ao cadastrar e conferir o prazo judicial na Controladoria, o evento usa essa data como compromisso de dia inteiro. Enquanto não conferido, usa a meta interna e indica `CONFERIR PRAZO`; triagens sem prazo judicial exibem `TRIAGEM INTERNA`.

O calendário continua sendo o configurado em `GOOGLE_CALENDAR_ID`, com a conta de serviço da integração existente. Estes agentes não enviam mensagens a clientes nem protocolam documentos.

## Publicação

Não houve publicação em produção durante esta implementação. A API de gestão Supabase recusou a credencial do ambiente com HTTP 401; o estado real de cron, migrations, funções e autorização Google precisa ser conferido após restabelecer o acesso.

Aplicar em ambiente de teste primeiro:

1. Conferir que o projeto é `mzwnljgujheumdslkloc` e que as migrations anteriores, inclusive `20261031120000_agentes_ia_controle.sql`, foram aplicadas.
2. Pausar `djen-diario` durante a instalação para evitar incompatibilidade entre versões.
3. Aplicar `20261101142313_agentes_djen_nativos.sql` e `20261101143142_djen_agenda_recuperavel.sql`. Os novos jobs são criados pausados para permitir homologação antes da ativação.
4. Publicar `agentes-disparar`, `pje-comunica-sync` e `controladoria-sync-calendar`, incluindo os módulos `_shared` importados. Usar a configuração de JWT do arquivo `supabase/config.toml`: cada endpoint valida usuário ou segredo no handler.
5. Verificar a existência de `djen_cron_secret` e `calendar_sync_secret` no Vault, sem exibir seus valores. Conferir a presença dos segredos `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` e `GOOGLE_CALENDAR_ID`, e que a conta de serviço possui acesso de escrita ao calendário.
6. Publicar a interface, conferir uma publicação conhecida e executar os agentes. Confirmar tarefa, vínculo, responsável e evento correto; testar a conferência de uma data judicial.
7. Ativar `djen-diario`, `djen-triagem` e `djen-agenda`. Observar uma rodada agendada antes de considerar a operação validada.

Os jobs de triagem e agenda não dependem da ativação dos gatilhos antigos do Google Calendar: a outbox DJEN possui gatilhos próprios, restritos a itens com origem `pje_publicacao`. A migration também enfileira itens DJEN abertos sem evento ou com falha anterior. Ela não reativa a sincronização geral de outros tipos de item.

## Falhas e pausa

O painel Agentes de IA mostra última consulta concluída, quantidade de pendências e até cinco falhas por etapa. Corrigir processo/responsável ou autorização Google e executar Assistente de Controladoria para reabrir tentativas com erro. A agenda será despachada na rodada seguinte.

- Triagem: até oito tentativas, com espera progressiva; nova tentativa manual pode reabrir após correção.
- Agenda: até oito envios, com confirmação consultada na rodada seguinte. Uma nova edição do item cria nova revisão e reinicia as tentativas.
- Alterações enquanto um envio está em andamento não reaproveitam a confirmação da revisão anterior.
- Execuções manuais nativas interrompidas por mais de dez minutos são marcadas como erro; as publicações permanecem na fila.
- Desativar `monitor-djen` pausa novas coletas agendadas; desativar `monitor-prazos` pausa a triagem. Para interromper também a agenda, pausar `djen-agenda` em `cron.job`. Cancelamento não desfaz trabalho que já começou.

Os agentes externos antigos continuam opcionais e exigem n8n configurado. Sua aprovação registra uma revisão; não há retomada automática de workflow externo nesta entrega. O token desses webhooks só pode ser enviado ao servidor HTTPS configurado em `N8N_BASE_URL`, sem seguir redirecionamentos.

## Validação e limites

Testes React/Vitest, compilação e TypeScript do frontend; Deno com as versões exatas do Supabase importadas; PostgreSQL 17 isolado para rollback, repetição, deduplicação, retomada, aprovação, permissões e concorrência. O bootstrap SQL reproduz contratos mínimos das tabelas e simula cron, Vault e HTTP. Ele não substitui homologação no schema completo do projeto nem uma chamada real ao DJEN/Google.

A consulta continua sujeita à paginação e aos limites da API DJEN existente. As garantias de não duplicação de tarefa dependem do identificador oficial ou hash fornecido pela fonte. Os testes de agenda simulam respostas HTTP; não comprovam autorização da conta de serviço nem a configuração do calendário real.
