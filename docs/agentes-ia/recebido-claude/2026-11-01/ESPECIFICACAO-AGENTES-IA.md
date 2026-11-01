# Especificação — Agentes de IA dentro do sistema JAS

Juliana Araújo Advocacia · versão 3 · 01/11/2026

**Mudança da versão 3:** a equipe pede tudo pela **Central de Comandos**; a Manu
cria a atividade na Controladoria e distribui; o especialista entrega **dentro da
atividade**; pedido de quem ainda não é cliente fica ligado ao **atendimento**
(`triagem_atendimentos`) e passa para o cliente sozinho quando ele fecha.
Detalhes nas seções 16 a 18.

Documento para o programador (Codex) que vai implementar. Diz **o que construir,
em que ordem e como saber que ficou pronto**, partindo do que o sistema já tem.
Os nomes de tabela, função e arquivo citados existem no repositório
`jasadvocaica/JAS-Advocacia` na data deste documento.

**Mudança da versão 2:** o escritório **não vai mais usar o n8n**. Fila, horários,
retentativas e chamadas aos agentes passam a ser feitos pelo próprio Supabase
(`pg_cron` + `pg_net` + Edge Functions), no mesmo padrão que o sistema já usa
em `datajud-diario` e `djen-diario`.

---

## 1. Objetivo

Agentes de IA que trabalham **dentro do sistema jurídico** (app.julianaaraujoadvocacia.com):
leem os dados reais (processos, controladoria, clientes, financeiro), produzem
resultados (minutas, triagens, relatórios, conteúdo), propõem ações e, depois da
aprovação humana, executam essas ações no sistema e nos canais (Telegram,
WhatsApp, Instagram via Zernio). Tudo roda no Supabase: funciona com todos os
computadores desligados e sem servidor extra.

**Fora do escopo:** protocolo em tribunal, pagamento, envio a cliente sem
aprovação, qualquer acesso a senha de gov.br, e-CAC, PJe ou banco.

## 2. Regras invioláveis

O sistema é usado todo dia pela equipe. Nenhuma entrega pode quebrá-lo.

1. **Migrations só incrementais.** Nada de `DROP`, renomear coluna, mudar tipo
   ou apagar dados de tabela existente. Novas colunas sempre com `default`.
2. **A Vanessa (`agente-prazos`) precisa continuar funcionando** em todas as
   fases. A troca do n8n pela chamada direta dela é a Fase 0 e só termina quando
   ela roda igual a antes, pelo painel e pela agenda.
3. **RLS sempre.** Leitura feita pelos agentes usa a identidade de um usuário
   (quem disparou, ou o usuário técnico "Agentes"), com `has_permission`.
   `service_role` só para gravar o que é do próprio agente (execução, log,
   consumo, ação proposta) e para executar ação **já aprovada**, revalidando a
   permissão de quem aprovou.
4. **Aprovação humana** antes de qualquer efeito fora do agente. Relatório
   interno para a própria equipe pode sair sem aprovação se `exige_aprovacao = false`.
5. **Nada inventado.** Sem fonte, `CONFERIR`. Prazo calculado sai como
   "a confirmar pela advogada". Dado faltante vira `[PREENCHER]`.
6. **LGPD.** Mandar à IA só o necessário. Nunca registrar segredo em log.
7. **Publicidade OAB (Provimento 205/2021)** nos agentes de conteúdo.
8. **Custo limitado** por agente e no total (seção 10).
9. **Testes** para cada função nova e para as regras de permissão; o build e os
   testes atuais continuam passando.
10. **Nenhuma chave no código nem em migration.** Segredo de agendamento fica no
    Vault (`vault.decrypted_secrets`), como em `datajud-diario`.

## 3. O que já existe (reaproveitar)

| Peça | Onde | Situação |
|---|---|---|
| Catálogo de agentes | `agentes_ia` (`slug`, `webhook_url`, `exige_aprovacao`, `timeout_segundos`, `config jsonb`) | pronto; `webhook_url` deixa de ser usado |
| Execuções | `agente_execucoes` + enum `status_execucao` | pronto |
| Log de passos | `agente_execucao_logs` | pronto |
| Aprovações | `agente_aprovacoes` | grava a decisão, **não executa nada** |
| Disparo seguro | `supabase/functions/agentes-disparar` (`disparar`, `decidir`, `cancelar`) | hoje chama o **n8n** e espera o resultado |
| Painel de agentes | `src/pages/agentes-ia/AgentesIA.tsx`, `hooks/useAgentesIA.ts` | pronto |
| Vanessa | `supabase/functions/agente-prazos` (aceita `x-webhook-token` = `N8N_WEBHOOK_TOKEN`; com `execucao_id` usa a execução, sem ele cria uma `agendado`) | em produção via n8n; ainda só no branch local `vanessa-n8n` |
| Workflow n8n da Vanessa | `docs/n8n/agente-monitor-prazos.json` | **será aposentado** |
| Agendamentos no banco | `pg_cron` + `pg_net` + Vault (`datajud-diario`, `djen-diario`) | padrão a seguir |
| Ferramentas de leitura com permissão | `supabase/functions/assistente-chat/tools.ts` | só dentro do assistente |
| Funções de IA avulsas | `clientes-triagem-ia`, `ia-gerar-peticao`, `ferramentas-cnis-extrair`, `ferramentas-gerar-proposta`, `checklist-diligencias-ia`, `ia-relatorio-financeiro-mensal`, `ia-alerta-prazos-diario`, `ficha-atendimento-ia`, `tarefa-sugerir-ia` | prontas, viram ferramentas |
| WhatsApp | `whatsapp-webhook`, `whatsapp-enviar` e demais | pronto |
| Servidor MCP | `supabase/functions/mcp-server` | **não** usar como caminho dos agentes (escreve com service role) |

## 4. Lacunas a resolver

- **L0 · Dependência do n8n.** `agentes-disparar` e a agenda da Vanessa passam pelo n8n.
- **L1 · Disparo síncrono.** O disparo espera o agente terminar; tarefa longa morre no limite de tempo.
- **L2 · Aprovação sem efeito.** A ação aprovada não acontece.
- **L3 · Um agente = uma função.** Falta um executor genérico configurável.
- **L4 · Leitura presa no assistente.** `tools.ts` não é compartilhado.
- **L5 · Sem agenda editável.**
- **L6 · Sem Telegram.**
- **L7 · Custo sem visão geral.**
- **L8 · Sem identidade nas execuções agendadas.**

## 5. Arquitetura alvo

```
 Painel (app)   Telegram          WhatsApp            pg_cron a cada 5 min
      │             │                 │                      │
      ▼             ▼                 ▼                      ▼
agentes-disparar  telegram-webhook  whatsapp-webhook   agentes-agendador
      └─────────────┴────────┬────────┴──────────────────────┘
                             ▼
        agente_execucoes  status = 'pendente'   ◄── a FILA é a própria tabela
                             │
       pg_cron a cada minuto ▼  (e um "chute" imediato do agentes-disparar)
                   agentes-trabalhador
        · reserva até 3 pendentes (FOR UPDATE SKIP LOCKED)
        · devolve à fila o que travou; desiste após 3 tentativas
        · chama a função do agente: agentes_ia.funcao
                             │  header x-agentes-token
         ┌───────────────────┼───────────────────────┐
         ▼                   ▼                       ▼
   agente-executar     agente-marketing         agente-prazos
   (genérico)          (sala de Marketing)      (Vanessa)
         └───────────────────┼───────────────────────┘
                             ▼
     grava saída, logs, consumo e AÇÕES PROPOSTAS
     status 'aguardando_aprovacao' ──► aviso no Telegram / painel
                             │  gestora aprova
                             ▼
     agentes-acoes-executar (revalida a permissão de quem aprovou)
     · controladoria · WhatsApp · documento · Instagram (Zernio) …
                             ▼
     status 'concluida' ──► escritório virtual (Realtime)
```

Papéis:

- **Supabase**: dados, regras de acesso, fila (`agente_execucoes`), relógio
  (`pg_cron`) e cérebro dos agentes (Edge Functions).
- **Telegram**: comandos e avisos da gestora.
- **Zernio**: publicação no Instagram depois da aprovação.
- **Escritório virtual**: página do app que só visualiza (seção 11).

## 6. Modelo de dados

Rascunho completo em `migration-referencia.sql`. Conferir contra o schema atual.

| Mudança | Para quê |
|---|---|
| `agentes_ia` + `funcao` (nome da Edge Function), `persona`, `modulos_leitura text[]`, `acoes_permitidas text[]`, `modo_execucao` | chamada direta sem n8n (L0); executor genérico (L3) |
| `agente_execucoes` + `executar_como`, `chave_idempotencia`, `tentativas`, `reservada_em` | RLS nas agendadas, não duplicar, retentar, destravar (L8) |
| função `agentes_reservar(limite)` | pega pendentes sem duas execuções iguais em paralelo |
| nova `agente_acoes` | ações propostas, aprovadas e executadas (L2) |
| nova `agente_consumo` | tokens e custo (L7) |
| nova `agente_gatilhos` | horários e eventos editáveis (L5) |
| nova `agente_canais` | vínculo Telegram ↔ usuário (L6) |
| `cron.schedule` `agentes-trabalhador` (1 min) e `agentes-agendador` (5 min) | relógio sem n8n |

Gravação nas tabelas novas só por Edge Function (service role). Leitura com
`has_permission(auth.uid(), 'controladoria', 'visualizar')`.

## 7. Ciclo de vida e contratos

### 7.1 Estados (`status_execucao`, sem mudar o enum)

`pendente` → `executando` → (`aguardando_aprovacao` → `concluida` | `rejeitada`) | `concluida` | `erro` | `cancelada`

### 7.2 Segredo interno

Um segredo só para chamadas entre partes do sistema: `AGENTES_TOKEN` (secret das
Edge Functions) e o mesmo valor no Vault como `agentes_token` (para o `pg_cron`).
Header: `x-agentes-token`. Comparação em tempo constante (copiar `mesmoSegredo`
de `agente-prazos`). Durante a transição, `agente-prazos` aceita também o header
antigo `x-webhook-token` com `N8N_WEBHOOK_TOKEN`; depois da Fase 0, remover.

### 7.3 Disparo — `agentes-disparar`, ação `disparar`

Mantém o contrato com o painel. Muda por dentro:

- Não usa mais `webhook_url` nem `N8N_BASE_URL`.
- Aceita `chave_idempotencia` (opcional); se já existe, devolve a existente.
- Grava `executar_como = user.id` e `status = 'pendente'`.
- `modo_execucao = 'assincrono'`: responde `202 { execucao_id, status: 'pendente' }`
  na hora e dá um "chute" no trabalhador com
  `EdgeRuntime.waitUntil(fetch(…/agentes-trabalhador))`, para não esperar o
  próximo minuto. Se o chute falhar, o cron pega no minuto seguinte.
- `modo_execucao = 'sincrono'` (Vanessa): chama
  `${SUPABASE_URL}/functions/v1/${agente.funcao}` com `{ execucao_id }` e
  `x-agentes-token`, espera até `timeout_segundos` e trata a resposta como hoje.

### 7.4 `agentes-trabalhador` (nova)

Chamado pelo `pg_cron` a cada minuto e pelo chute do disparo. Código de
referência em `referencia/agentes-trabalhador/index.ts`.

1. Valida `x-agentes-token`.
2. Destrava: `executando` com `reservada_em` há mais de 10 min volta para
   `pendente` se `tentativas < 3`; senão vira `erro` ("travou 3 vezes").
3. Reserva com `rpc('agentes_reservar', { limite })`, respeitando no máximo 3
   `executando` no total e 1 por agente. A função marca `executando`,
   `reservada_em = now()` e soma `tentativas`.
4. Para cada reservada, chama `/functions/v1/${funcao}` com `{ execucao_id }`
   e espera em paralelo (`Promise.allSettled`, até 140 s).
5. Resposta HTTP 5xx ou queda de rede: volta para `pendente` (até 3 tentativas).

### 7.5 Função do agente (`agente-executar`, `agente-marketing`, `agente-prazos`)

1. Valida `x-agentes-token`.
2. Carrega execução e agente. Se já `concluida`/`aguardando_aprovacao`/
   `rejeitada`/`cancelada`, sai sem refazer (idempotente).
3. Confere o limite de custo (seção 10).
4. Monta o pedido à IA: regras gerais + `persona`; ferramentas de leitura de
   `modulos_leitura` filtradas pelas permissões de `executar_como` (seção 8);
   ferramenta `propor_acao` restrita a `acoes_permitidas`.
5. No máximo 6 chamadas de ferramenta, cada uma em `agente_execucao_logs`, sem dado pessoal.
6. Grava `saida = { texto, fontes }`, `resumo`, consumo e ações.
7. Tem ação proposta **ou** `exige_aprovacao` → `aguardando_aprovacao` e abre
   `agente_aprovacoes`; senão, `concluida`.
8. Aviso no Telegram (se configurado) e Realtime.

Resposta: `{ status, resumo, saida }`, o mesmo contrato que a Vanessa já usa.

### 7.6 Ação proposta (`agente_acoes`)

O modelo chama `propor_acao({ tipo, payload, motivo })`. O payload é validado
com o esquema do tipo antes de gravar. Tipos da v1:

| tipo | payload | executa via | permissão de quem aprova |
|---|---|---|---|
| `criar_item_controladoria` | tipo do item, título, descrição, vencimento, processo_id?, cliente_id?, prioridade | RPC `public.salvar_item_controladoria` com o JWT de quem aprovou, `origem = 'agente_ia'`, **não conferido** | controladoria · criar |
| `responder_whatsapp` | conversa/contato, texto | `whatsapp-enviar` com o JWT de quem aprovou | o que `whatsapp-enviar` já exige |
| `criar_documento_rascunho` | título, conteúdo, processo_id?, cliente_id? | tabela `documentos`, como rascunho (conferir colunas) | documentos · criar |
| `registrar_nota_processo` | processo_id, texto | andamento/nota **interna** | processos · editar |
| `agendar_publicacao` | formato, legenda, quando, mídias | Zernio (`agentes-marketing/`, já escrito) | marketing · criar |

### 7.7 Aprovação — `agentes-disparar`, ação `decidir`

1. Aceita `acoes: [{ id, aprovar, payload_editado? }]`; sem lista, vale para todas.
2. Ação aprovada: `status = 'aprovada'` e chama `agentes-acoes-executar` com o JWT de quem aprovou.
3. `agentes-acoes-executar` revalida `has_permission`, executa uma por vez, grava `executada`/`erro`.
4. "Devolver com ajuste": nova execução com `entrada.ajuste_de`, `entrada.ajuste` e `entrada.anterior`.

## 8. Leitura de dados pelos agentes

- Mover `assistente-chat/tools.ts` para `_shared/ferramentas-leitura.ts` **sem
  mudar comportamento** (os testes do assistente passam sem alteração).
- `agente-executar` monta o `Acesso` a partir de `executar_como`. Agendadas
  usam o usuário técnico "Agentes" (interno, só "visualizar"). Sem sessão de
  navegador, aplicar as mesmas checagens de `has_permission` no código, ou
  gerar a sessão desse usuário pelo caminho que o projeto já usa; documentar a escolha.
- Funções de IA existentes viram ferramentas, com a permissão do `executar_como`.

## 9. Catálogo dos agentes

`funcao` = Edge Function que o trabalhador chama. Personas em `personas/<nome>.md`.

| slug | personagem | funcao | lê | ações | gatilho sugerido | aprovação |
|---|---|---|---|---|---|---|
| `monitor-prazos` (existe) | Vanessa | `agente-prazos` | (própria) | (própria) | dias úteis 07:15 (como hoje no n8n) | não (lança como não conferido) |
| `relatorio-diario` (existe) | Manu | `agente-executar` | controladoria, processos | — | seg a sex 07:00 | não |
| `minuta-pecas` (existe) | Helena | `agente-executar` | processos, clientes | `criar_documento_rascunho` | manual | sim |
| `triagem-clientes` | Beatriz | `agente-executar` | clientes | `criar_item_controladoria` | manual / novo cliente | sim |
| `processos-andamentos` | Gustavo | `agente-executar` | processos, controladoria | `registrar_nota_processo`, `criar_item_controladoria` | semanal | sim |
| `previdenciario` | Rafael | `agente-executar` | processos, clientes | `criar_documento_rascunho` | manual | sim |
| `propostas-contratos` | Thiago | `agente-executar` | clientes | `criar_documento_rascunho` | manual | sim |
| `leads-whatsapp` | Mariana | `agente-executar` | clientes | `responder_whatsapp` | mensagem nova de não cliente | sim, sempre |
| `financeiro` | Fernando | `agente-executar` | financeiro | `responder_whatsapp` | mensal / manual | sim, sempre |
| `diligencias-forum` | Gabriel | `agente-executar` | diligencias, controladoria | `criar_item_controladoria` | diário 07:30 | sim |
| `inss-administrativo` | Renata | `agente-executar` | processos, clientes, atendimentos | `criar_item_controladoria` (prazo não conferido), `criar_documento_rascunho` | Central de Comandos | sim |
| `conteudo-instagram` | Camila | `agente-marketing` | — | `agendar_publicacao` | segunda 08:00 | sim |
| `video-design` | Vinícius | `agente-marketing` | — | `agendar_publicacao` | manual | sim |
| `redacao-instagram` | Lara | `agente-marketing` | — | `agendar_publicacao` | manual | sim |
| `comunidade-instagram` | Bruna | `agente-marketing` | — | — | manual | sim |

No escritório virtual, o Renato (prazos) passa a ser a **Vanessa**.

A sala de Marketing já tem código pronto e testado em `agentes-marketing/`
(ver `agentes-marketing/LEIA-ME.md`).

## 10. Custo e limites

- `agente_consumo` por execução: modelo, tokens, custo estimado.
- Limite mensal por agente em `config.limite_mensal_usd` (padrão 5) e global
  (padrão 50). Passou do limite, a execução vai para `erro` ("limite do mês
  atingido") e avisa no Telegram.
- Modelo fixo por agente em `config.modelo`. Padrão `gpt-4.1-mini-2025-04-14`.
- No máximo 3 execuções `executando` ao mesmo tempo, 1 por agente (garantido em `agentes_reservar`).

## 11. Canais e agenda

### Agenda (`agentes-agendador`, nova)

- `pg_cron` a cada 5 minutos (migration de referência).
- Lê `agente_gatilhos` ativos com horário vencido no fuso America/Cuiaba e cria
  a execução `pendente` uma vez por dia (`chave_idempotencia = gatilho_id + data`),
  com `executar_como` do gatilho ou do usuário técnico. O trabalhador faz o resto.
- A agenda da Vanessa (dias úteis) vira um gatilho como os outros.

### Telegram (`telegram-webhook`, nova)

- Webhook do Bot API com `secret_token` (header `X-Telegram-Bot-Api-Secret-Token`);
  segredos `TELEGRAM_WEBHOOK_SECRET` e `TELEGRAM_BOT_TOKEN`.
- Usar um **bot novo, só do sistema** (o @clarajas_bot é da Manu/Hermes).
- Vínculo: código de 6 dígitos gerado no app (10 min); no Telegram `/vincular 123456`.
  Sem vínculo, "não autorizado". Cada comando usa as permissões do usuário vinculado.
- Comandos: texto livre (vai para a Manu), `/tarefas`, `/ver <n>`, `/aprovar <n>`,
  `/recusar <n>`, `/ajustar <n> <texto>`.
- Avisos: aguardando aprovação, erro, limite de custo, briefing.

### WhatsApp

- `whatsapp-webhook`: mensagem de número que não é cliente e sem conversa aberta
  → cria execução `pendente` de `leads-whatsapp` com `chave_idempotencia = id da mensagem`.
- Resposta só por `responder_whatsapp` aprovada.

### Escritório virtual

- Página do app (há uma `src/pages/escritorio-habbo` começada).
- Lê `agentes_ia` e `agente_execucoes` com Supabase Realtime.
- Boneco trabalhando = `executando`; selo "para revisar" = `aguardando_aprovacao`.
- Aprovar pelo escritório usa `agentes-disparar` → `decidir`.

## 12. Segurança

- Segredos (OpenAI, Telegram, Evolution, Zernio, `AGENTES_TOKEN`) só em secrets
  das Edge Functions e no Vault. Nunca no frontend, em migration ou no git.
- Chamadas internas e webhooks: token comparado em tempo constante.
- `agentes-acoes-executar` só aceita `aprovada` e revalida a permissão na hora.
- Logs sem CPF, telefone, documento integral ou segredo.
- Texto vindo de cliente entra como dado, entre delimitadores; ações sempre aprovadas.

## 13. Entrega por fases

Cada fase termina com o sistema funcionando, testes passando e a Vanessa intacta.

**Fase 0 · Sair do n8n sem parar a Vanessa** (antes de desligar o n8n)
- Publicar no GitHub e no Supabase o que está no branch local `vanessa-n8n`
  (painel de agentes, `agentes-disparar`, `agente-prazos`).
- Migration: `agentes_ia.funcao` (`monitor-prazos` → `agente-prazos`),
  colunas de execução, `agentes_reservar`, Vault `agentes_token`.
- `agente-prazos`: aceitar `x-agentes-token`/`AGENTES_TOKEN` (e o antigo, na transição).
- `agentes-disparar`: chamar `agente.funcao` direto, sem n8n.
- `agentes-trabalhador` + `cron.schedule` a cada minuto.
- `agente_gatilhos` + `agentes-agendador` + gatilho "Vanessa · dias úteis 07:15".
- **Pronto quando:** disparar a Vanessa pelo painel funciona com o n8n
  desligado, e no dia útil seguinte ela roda sozinha às 07:15. Só então desligar o
  workflow do n8n e remover `N8N_BASE_URL`, `N8N_WEBHOOK_TOKEN` e `webhook_url`.

**Fase 1 · Executor genérico**
- `_shared/ferramentas-leitura.ts` (refatoração sem mudar comportamento).
- `agente-executar` + `agente_consumo` + limite de custo.
- Agentes: Manu (`relatorio-diario`) e Helena (`minuta-pecas`).
- **Pronto quando:** disparar a Helena devolve `pendente` na hora, em até um
  minuto ela está `executando` e termina em `aguardando_aprovacao` com a minuta,
  com consumo gravado.

**Fase 2 · Central de Comandos e entrega na Controladoria** (seções 16 e 17)
- Tabela `central_pedidos`, vínculo com atendimento e gatilho de conversão.
- Tela **Central de Comandos** no app; Manu coordenadora (`coordenar-pedido`).
- Entrega dentro da atividade (comentário + documento rascunho + etapa
  "Revisar entrega do agente") e revisão pela própria atividade.
- `agente_acoes`, `propor_acao`, `agentes-acoes-executar`, `decidir` com ações e ajuste.
- Agentes: Rafael (CNIS), Renata (INSS administrativo), Beatriz.
- **Pronto quando:** alguém lança "analisar CNIS" para um atendimento novo, a
  Manu cria a atividade com o Rafael e o revisor certos, a análise aparece na
  atividade e no sino de quem pediu, a revisão aprova; depois, ao converter o
  atendimento em cliente, a atividade e o documento aparecem no cliente.

**Fase 2B · Métricas** (seção 18)
- Views de métricas e a tela de painel (pode ser junto com a Fase 2).

**Fase 3 · Marketing**
- Instalar `agentes-marketing/` (Camila, Vinícius, Lara, Bruna) com Zernio.
- **Pronto quando:** o plano da semana chega na segunda às 08:00 e um reel
  aprovado com vídeo aparece agendado no Zernio.

**Fase 4 · Telegram e WhatsApp**
- `telegram-webhook` com vínculo, comandos e avisos; briefing da Manu no Telegram.
- Lead no `whatsapp-webhook` → Mariana; Thiago, Fernando.

**Fase 5 · Restante da equipe e escritório virtual**
- Gustavo e Gabriel; página do escritório virtual lendo `agente_execucoes`.

## 14. Testes obrigatórios

- Permissão: usuário sem módulo não recebe a ferramenta; consulta forçada falha.
- Agendada usa o usuário técnico e não vê fora da permissão dele.
- Idempotência: mesmo disparo ou gatilho duas vezes gera uma execução só.
- `agentes_reservar` em paralelo não entrega a mesma execução duas vezes.
- Execução travada volta para a fila e para depois de 3 tentativas.
- Função do agente chamada duas vezes não refaz o trabalho.
- Ação não aprovada nunca executa; aprovador sem permissão é recusado.
- Limite de custo bloqueia a chamada à IA.
- Token errado é recusado (trabalhador, agendador, agentes, Telegram).
- Regressão: Vanessa, assistente e painel funcionam como antes.
- Testes com IA simulada (sem crédito), no padrão de `tests/assistente/`.
- Pedido sem processo, cliente nem atendimento é recusado.
- Converter atendimento em cliente leva atividades, documentos, execuções e pedidos
  junto, e grava o histórico em `cliente_atendimentos`; converter de novo não duplica.
- Atendimento descartado não aparece para quem não tem permissão de clientes.
- Correção da escolha da Manu fica registrada e entra na métrica de acerto.
- Métricas batem com uma contagem manual em dados de teste.

## 15. Decisões que dependem da Dra. Juliana

1. Usuário técnico "Agentes": quais módulos ele pode **ver**? (Sugestão: controladoria, processos, clientes; financeiro só para o Fernando.)
2. Limites de custo: 5 USD por agente/mês e 50 USD no total estão bons?
3. Bot novo do Telegram: quem cria e quais usuários podem se vincular?
4. Fernando pode mandar lembrete de cobrança pelo WhatsApp (sempre com aprovação), ou só rascunho?
5. Quem revisa por padrão quando o pedido é de um atendimento (ainda sem processo):
   quem pediu, ou um advogado fixo por área?
6. Atendimento descartado: por quanto tempo guardar as análises e documentos (LGPD)?
   Sugestão: 180 dias, depois apagar.
7. Horas poupadas: qual o tempo médio humano de cada tipo de pedido (ex.: análise
   de CNIS = 1 h 30)? Sem isso, a métrica de "ganho" não aparece.

---

## 16. Central de Comandos e entrega na Controladoria

A equipe tem **uma porta só** para pedir trabalho aos agentes. A Controladoria
continua sendo onde o trabalho fica registrado, revisado e medido.

### 16.1 Tela (app, rota `/central`)

- Campo "O que você precisa?" (texto livre), anexos (upload para o Storage),
  marcar **urgente** (prazo correndo, audiência).
- **Vínculo obrigatório**, numa busca só por nome, CPF ou número: processo, cliente
  **ou atendimento**. Se não existir, botão **"Novo atendimento"** com nome,
  telefone e assunto (cria `triagem_atendimentos`, `proximo_passo = 'pendente'`).
- Lista "Meus pedidos" com a etapa de cada um e o link para a atividade.
- Permissão para pedir: `controladoria · criar`.

### 16.2 Ciclo do pedido (`central_pedidos.status`)

```
novo ──► distribuido ──► em_execucao ──► em_revisao ──► concluido
  │          ▲                                 │
  │   (corrigido pela pessoa)                  ├──► devolvido ──► em_execucao (nova rodada)
  └──► recusado (Manu não entendeu / fora do escopo; volta para quem pediu)  └──► recusado
```

1. **Pedido** grava `central_pedidos` (`novo`) e uma execução da Manu
   (`coordenar-pedido`) na fila.
2. **Manu coordena** (função `coordenar-pedido`, IA com saída em JSON):
   - escolhe o especialista (`agente_sugerido`) e escreve o título da atividade;
   - **cria a atividade na Controladoria** pela RPC `salvar_item_controladoria`:
     tipo `tarefa`, `origem = 'agente_ia'`, vínculo (processo, cliente ou
     atendimento), prazo interno (urgente: hoje; normal: 2 dias úteis),
     `responsavel_id` = **revisor** (quem pediu, ou a regra da decisão 5);
   - grava o agente em `controladoria_itens.agente_executor` (coluna nova;
     `controladoria_responsaveis` só aceita usuários reais) e comenta
     "Pedido distribuído para Rafael (IA)";
   - cria a execução do especialista com `entrada = { pedido_id, item_id, texto, anexos }`;
   - `status = 'distribuido'`.
   - Se não entender ou não houver especialista: `recusado` com o motivo em
     comentário e aviso para quem pediu.
3. **Correção**: na atividade ou na Central, a pessoa troca o especialista com
   um clique enquanto não começou; grava `corrigido_por` e `agente_escolhido`.
4. **Especialista executa** (`em_execucao`) e entrega **na atividade**:
   - comentário em `controladoria_comentarios`: resumo de até 10 linhas e o que
     precisa de atenção;
   - documento **rascunho** em `documentos` (categoria `analise_ia`), ligado ao
     mesmo processo, cliente ou atendimento;
   - se achar prazo: ação `criar_item_controladoria` (prazo **não conferido**),
     aplicada só depois da revisão;
   - etapa da atividade → **"Revisar entrega do agente"** (`controladoria_etapas_historico`)
     e notificação em `notificacoes` para o revisor (e Telegram, se vinculado).
   - `status = 'em_revisao'`, `entregue_em = now()`.
5. **Revisão na própria atividade**, com três botões:
   - **Aprovar**: documento deixa de ser rascunho, ações aprovadas executam,
     atividade concluída, `status = 'concluido'`, `decisao = 'aprovado'`;
     comentário "Revisado por Fulana".
   - **Devolver com ajuste**: comentário com o ajuste, `rodadas + 1`, nova
     execução do mesmo agente, `status = 'em_execucao'`.
   - **Recusar**: `status = 'recusado'`, atividade cancelada com o motivo.

### 16.3 Por que dois responsáveis

O **agente executa**, a **pessoa responde**. A atividade fica no nome de quem
revisa (é ela que aparece na carga de trabalho e nos prazos); o agente aparece
como executor. Assim a Controladoria continua mostrando quem é o responsável
humano por cada coisa.

## 17. Atendimento antes do cliente

Análise de CNIS ou de indeferimento muitas vezes acontece **antes** do contrato.
A pessoa ainda não é cliente; ela é um **atendimento** (`triagem_atendimentos`,
que o sistema já tem, com `proximo_passo` e `cliente_id` preenchido na conversão).

- `controladoria_itens`, `documentos`, `agente_execucoes` e `central_pedidos`
  ganham a coluna `triagem_atendimento_id` (opcional).
- Pedido de atendimento: tudo é gravado com `triagem_atendimento_id` e **sem**
  `cliente_id`.
- **Conversão automática**: gatilho em `triagem_atendimentos` quando `cliente_id`
  passa de vazio para preenchido. Ele:
  1. preenche `cliente_id` em atividades, documentos, execuções e pedidos daquele
     atendimento (só onde estiver vazio);
  2. grava cada pedido concluído no histórico do cliente (`cliente_atendimentos`,
     `ferramenta = 'agente_ia'`, título, resumo, link da atividade);
  3. não faz nada se rodar de novo (idempotente).
- Leitura de dados de atendimento pelos agentes: grupo de ferramentas
  `atendimentos`, com a mesma permissão da tabela (`clientes · visualizar`).
- Atendimento **descartado** (`proximo_passo = 'descartar'`): as análises ficam
  pelo prazo da decisão 6 e depois são apagadas por rotina.
- O lead do WhatsApp (Mariana) também cria ou usa o atendimento; o `mkt_leads`
  continua sendo do marketing e pode apontar para o atendimento.

## 18. Métricas

Saem de `central_pedidos` (tempos e decisões), `agente_execucoes` e
`agente_consumo`. Views com `security_invoker = true` (respeitam o RLS de quem
consulta). Tela "Métricas dos agentes" no painel de agentes, com filtro de
período, agente, pessoa e área.

| Métrica | Cálculo |
|---|---|
| Volume | pedidos por semana, por agente, por quem pediu, por área |
| Tempo do agente | `entregue_em − distribuido_em` (mediana) |
| Tempo de revisão | `revisado_em − entregue_em` (mediana) |
| Tempo total | `revisado_em − criado_em` |
| Aprovado de primeira | `decisao = 'aprovado' and rodadas = 0` ÷ revisados |
| Devolvido / recusado | % por agente (a principal para melhorar as instruções) |
| Acerto da Manu | pedidos sem `corrigido_por` ÷ distribuídos |
| Gargalo | itens `em_revisao` agora, por revisor, e há quanto tempo |
| Custo | soma de `agente_consumo.custo_usd` por agente e por pedido |
| Horas poupadas | pedidos aprovados × tempo humano médio do tipo (decisão 7) |
| Conversão | atendimentos com análise de agente que viraram cliente |
