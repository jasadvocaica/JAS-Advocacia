# Sala de Marketing · agentes de Instagram

Quatro agentes de IA para o Instagram da Juliana Araújo Advocacia, feitos a
partir da skill-instagram (13 robôs) e encaixados na arquitetura de
`../ESPECIFICACAO-AGENTES-IA.md`. A publicação vai pelo **Zernio**, sempre
depois da aprovação da Dra. Juliana.

## A equipe

| Agente (slug) | Personagem | Robôs da skill | Entrega |
|---|---|---|---|
| `conteudo-instagram` | Camila, estratégia | ig-plan, ig-viral, ig-audit, ig-profile, ig-repurpose | plano da semana, análise do nicho, auditoria, bio, reaproveitamento |
| `video-design` | Vinícius, Reels e Stories | ig-reel, ig-story | roteiro com gancho, texto na tela, batidas, stories do dia |
| `redacao-instagram` | Lara, legendas e carrosséis | ig-caption, ig-carousel | legenda pronta, carrossel slide a slide |
| `comunidade-instagram` | Bruna, comentários e direct | ig-reply, ig-dm, ig-comment | rascunho de resposta (nunca publica nem envia sozinha) |

O Humanizador (ig-human) não é um agente: virou código e passa em **tudo**
que os quatro escrevem.

## Como funciona

```
pedido (painel, Telegram, plano semanal)
  → execução "pendente" na fila (agente_execucoes)
  → agentes-trabalhador (pg_cron, a cada minuto) → agente-marketing
      1. escolhe o robô pelo pedido (ou "robo" na entrada)
      2. instrução = regras da OAB + voz da Dra. Juliana + manual do robô
      3. IA (OpenAI, resposta em JSON estruturado)
      4. Humanizador: tira travessão, caracteres invisíveis e 226 vícios de IA
      5. Conferência OAB: promessa, preço, consulta grátis, caso de cliente, CPF...
      6. grava a entrega + relatório; se for post, PROPÕE "agendar_publicacao"
  → Dra. Juliana revisa, anexa o vídeo/imagens, ajusta data e aprova
  → agentes-acoes-executar → _shared/acoes/agendar-publicacao.ts
      confere a OAB de novo no texto final e agenda no Zernio
```

Proteções que estão no código:

- Nada vai ao Instagram sem a ação estar `aprovada`.
- Alerta grave da OAB no texto final **bloqueia** o agendamento.
- Direct e comentário nunca viram publicação; a Bruna não faz prospecção.
- Texto de terceiros (comentário, mensagem colada) entra como dado, não como ordem.
- Mesmo pedido repetido não publica duas vezes (`Idempotency-Key` = id da ação).
- Limite de gasto por agente por mês (`config.limite_mensal_usd`).
- O Instagram não aceita link do Google Drive, Dropbox, OneDrive ou iCloud; o código avisa antes.

## Arquivos

| Arquivo | O que é |
|---|---|
| `supabase/functions/agente-marketing/index.ts` | a Edge Function (Deno) |
| `supabase/functions/agente-marketing/nucleo.ts` | equipe, escolha do robô, instrução, tratamento da resposta |
| `supabase/functions/agente-marketing/conhecimento.ts` | **gerado**: manuais dos robôs, fórmulas de gancho, voz, OAB |
| `supabase/functions/_shared/marketing/humanizar.ts` + `slop.json` | Humanizador (tradução do `humanize.py`) |
| `supabase/functions/_shared/marketing/oab.ts` | conferência das regras de publicidade |
| `supabase/functions/_shared/marketing/zernio.ts` | cliente do Zernio |
| `supabase/functions/_shared/acoes/agendar-publicacao.ts` | executa a publicação aprovada |
| `migration-marketing.sql` | cadastra os 4 agentes (desligados) e o plano semanal |
| `voz-jas.md` | **a Dra. Juliana preenche** os [PREENCHER] |
| `camada-oab.md` | regras de publicidade que valem por cima da skill |
| `gerar-conhecimento.mjs` | regenera `conhecimento.ts` depois de editar voz, OAB ou robôs |
| `testes/marketing.test.ts` | 15 testes, sem rede e sem crédito |
| `skill-instagram/` | a skill original (MIT), como fonte |

## Instalar no sistema (para o Codex)

1. Ter as Fases 0, 1 e 2 da especificação prontas (fila e relógio no Supabase,
   tabelas `agente_acoes` e `agente_consumo`, `agentes-acoes-executar`).
2. Copiar `supabase/functions/agente-marketing/` e `supabase/functions/_shared/marketing/`
   e `_shared/acoes/agendar-publicacao.ts` para o repositório.
3. Em `agentes-acoes-executar`, para `tipo = 'agendar_publicacao'`, chamar
   `executarAgendarPublicacao(acao, { zernioChave, contaPadrao })`. Permissão
   de quem aprova: `marketing · criar`.
4. Secrets das Edge Functions: `OPENAI_API_KEY` (já existe), `AGENTES_TOKEN`
   (da Fase 0), `ZERNIO_API_KEY` e `ZERNIO_INSTAGRAM_ACCOUNT_ID` (novos). O id da conta sai de
   `GET https://zernio.com/api/v1/accounts`.
5. Aplicar `migration-marketing.sql` e publicar a função `agente-marketing`.
6. Rodar os testes: `node --test testes/` (Node 22.18+) ou `deno test testes/`.
7. Ligar um agente por vez (`ativo = true`) e testar com um pedido real.

## A tela de aprovação precisa de

- mostrar `saida.texto` (markdown), as `perguntas` e o `relatorio.oab` em destaque;
- na ação `agendar_publicacao`: legenda editável, formato, data/hora (Cuiabá) e
  **campo para anexar a mídia** (upload; a URL vai em `payload.midias`);
- sem data, o Zernio guarda como rascunho em vez de agendar.

## O que fica para depois

- Os programas `hookscore.py`, `beats.py`, `caption.py`, `detect.py` e `swipe.py`
  não foram traduzidos: o modelo faz essas checagens seguindo o manual. Dá para
  traduzir depois, se a nota do gancho fizer falta.
- O robô Viralização usa dados de outros perfis (Apify). Sem esse conector,
  ele pede que colem os números.
- Responder comentário e direct direto pelo Zernio, sempre com aprovação:
  conferir se o plano do Zernio tem esse recurso na API (não verificado).
