# Integração Zernio — entrega

**Situação:** implementada e testada com respostas simuladas da API. **A conexão real ainda não foi
testada**, porque nenhuma chave do Zernio foi usada. Sem chave, a tela mostra "Aguardando configuração da API".

## Para a administradora (sem editar código)

1. Entre em **Configurações › Integrações › Zernio**.
2. Aba **Configurações**: cole a chave de API do Zernio (começa com `sk_`) e clique em **Salvar credencial**.
   O sistema cifra a chave, testa a conexão e lista as contas. Depois disso a chave só aparece mascarada.
3. Aba **Visão geral**: marque as contas que o JAS deve acompanhar (Instagram e Meta Ads).
4. Aba **Configurações**: ligue **Coleta de dados**. Se quiser que os agentes usem os dados, ligue
   **Análises internas**. Se quiser sincronizar sozinho, ligue **Sincronização automática** e escolha a frequência.
5. Clique em **Sincronizar agora** para a primeira coleta. O histórico fica na aba **Sincronizações**.

Respostas a comentários só saem depois de aprovadas na Central de Aprovações (Sala da Gestora) **e** com
"Ações externas com aprovação" ligado. Publicação automática, resposta automática e alteração de anúncios
estão travadas no banco.

## Arquivos

| Tipo | Arquivo |
|---|---|
| Migration | `supabase/migrations/20261102140000_integracao_zernio.sql` |
| Cliente da API, criptografia e conversões | `supabase/functions/_shared/zernio.ts` |
| Motor de sincronização (etapas, cursores, retomada) | `supabase/functions/_shared/zernio-sync.ts` |
| Edge Function | `supabase/functions/zernio/index.ts` |
| Ferramentas dos agentes | `supabase/functions/_shared/motor.ts`, `supabase/functions/motor-missoes/index.ts` |
| Tela | `src/pages/configuracoes/integracoes/ZernioIntegracao.tsx` (rota `/configuracoes/integracoes/zernio`) |
| Modificados | `src/App.tsx`, `IntegracoesConfig.tsx` (atalho), `ConfiguracoesLayout.tsx`, `SalaGestora.tsx` (rótulos do pedido) |
| Testes | `src/lib/zernio.test.ts`, `ZernioIntegracao.test.tsx`, `tests/zernio/fluxo.sql`, `tests/zernio/rodar-pglite.mjs` |

## Endpoints oficiais usados (conferidos em docs.zernio.com em 01/11/2026)

Base `https://zernio.com/api`, autenticação `Authorization: Bearer sk_…`.

| Endpoint | Uso | Recurso do plano |
|---|---|---|
| `GET /v1/accounts` | teste de conexão e contas (cursor) | — |
| `GET /v1/analytics` | publicações do Instagram com métricas (page/limit, até 366 dias) | Analytics (402 sem ele) |
| `GET /v1/inbox/comments` | publicações com comentários (cursor) | Inbox (403 sem ele) |
| `GET /v1/inbox/comments/{postId}` | comentários e respostas | Inbox |
| `POST /v1/inbox/comments/{postId}` | responder comentário, só após aprovação (`Idempotency-Key` = id do pedido) | Inbox |
| `GET /v1/inbox/conversations` | conversas do direct (cursor, limite 100) | Inbox |
| `GET /v1/ads/campaigns` | campanhas com métricas e orçamento | Ads (403 sem ele) |
| `GET /v1/ads/ad-sets` | conjuntos de anúncios | Ads |
| `GET /v1/ads` | anúncios e criativos | Ads |
| `GET /v1/ads/timeline` | métricas diárias da conta de anúncios | Ads |

## Tabelas (schema `marketing_privado`, sem acesso do navegador)

`zernio_conexoes`, `zernio_contas`, `zernio_sync_jobs`, `zernio_sync_logs`, `zernio_posts`,
`zernio_post_metricas` (histórico por dia), `zernio_comentarios`, `zernio_conversas`, `zernio_campanhas`,
`zernio_conjuntos`, `zernio_anuncios`, `zernio_anuncio_metricas` (diário). Todas com id externo único e upsert.

## Serviços e jobs

- **Fila** (`zernio_sync_jobs`): um job ativo por vez; lease de 120 s; job interrompido é retomado do
  cursor salvo; rate limit adia o job pelo `Retry-After`; falha genérica tenta de novo com espera crescente
  (até 3 vezes).
- **Etapas:** contas → publicações → comentários → conversas → campanhas → conjuntos → anúncios → métricas
  diárias. Recurso fora do plano é pulado e registrado; falha de uma etapa não derruba as outras (job "parcial").
- **Incremental:** depois da primeira coleta (90 dias), busca desde a última sincronização com 7 dias de folga.
- **Automático:** `pg_cron` a cada 15 min chama `marketing_privado.zernio_cron()`, que só age com chave,
  coleta ligada e sincronização vencida. Endereço e segredo vêm do Vault (`project_url`, `djen_cron_secret`):
  sem eles, nada é chamado.
- **Retenção (LGPD):** `zernio_purgar()` diária: conversas 90 dias, comentários e métricas 365 dias, logs 90 dias
  (configurável na tela).

## Agentes

Ferramentas de leitura (classe `leitura`, módulo marketing), concedidas agente por agente na gestão do motor:
`zernio_indicadores`, `zernio_publicacoes`, `zernio_comentarios`, `zernio_conversas`, `zernio_anuncios`,
`zernio_saude`. Sem chave ou com análises desligadas, devolvem `disponivel: false` e um aviso para não estimar.
Ação sensível: `zernio_responder_comentario` (vira pedido na Central de Aprovações).

Sugestão pelo catálogo decidido: Nina (indicadores, publicações, anúncios), Bela (publicações, comentários),
Bruna (comentários, conversas, responder comentário), Theo (anúncios, indicadores), Alex (saúde).
A especificação cita "Bia — Atendimento"; no catálogo o atendimento de comentários e direct é da **Bruna**
(a Bia é a assistente do sistema).

## Testes executados

- `npx vitest run src/lib/zernio.test.ts src/pages/configuracoes/integracoes`: chave (formato, máscara,
  AES-GCM), chave inválida/expirada, retentativa com espera, `Retry-After`, limite longo adia o job,
  recurso fora do plano, `Idempotency-Key`, paginação por cursor, incremental, retomada após interrupção,
  falha parcial, nenhum endpoint fora da lista, ferramentas dos agentes, estados da tela.
- `node tests/zernio/rodar-pglite.mjs`: credencial só cifrada e só pela administração, travas, job único,
  lease e retomada, upsert sem duplicar, histórico por dia, seleção de contas, adiamento, consulta dos
  agentes com e sem dados, logs sem chave, revogação, ação externa só com aprovação, isolamento do navegador.

## Limitações conhecidas da API

- A documentação não detalha os campos dos itens de `posts` em `/v1/analytics`; o JAS lê os nomes usuais
  (`_id`, `content`, `publishedAt`, `analytics`) e guarda o que vier. Conferir com a primeira chave real.
- Os campos internos de `metrics` e `budget` de campanhas e anúncios não são documentados: são guardados
  como vieram e exibidos só se existirem (`spend`, `impressions`, `clicks`).
- Comentários e conversas têm cache de até 10 minutos no Zernio; o recomendado para tempo real é webhook
  (`comment.received`), não implementado nesta etapa.
- Métricas de anúncios: 90 dias de histórico ao conectar; mais antigo pode vir com `202` (backfill).
- Coleta de comentários limitada a 25 publicações por rodada para respeitar os limites; o restante entra
  nas rodadas seguintes.
