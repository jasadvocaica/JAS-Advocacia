# Colocar o sistema online — passo a passo

> Atualização de 01/11/2026: os dois primeiros agentes DJEN agora executam no Supabase sem n8n. A implantação, os testes reais e os limites atuais estão em [agentes-djen-operacao.md](agentes-djen-operacao.md). O roteiro abaixo é histórico para agentes externos opcionais; n8n não é requisito para coleta e triagem DJEN.

Situação em 31/10/2026. Objetivo: sistema acessível por URL e agentes de IA funcionando.

## O diagnóstico

O painel de Agentes de IA e a função `agentes-disparar` existem **somente na máquina local**.
Nunca foram enviados ao GitHub (`jasadvocaica/JAS-Advocacia`) nem publicados no Supabase.
Por isso o site online não tem os agentes.

Além disso, o n8n — que é quem **executa** o trabalho dos agentes — não está acessível.
Sem n8n online, o painel registra a execução mas ninguém executa nada.

A ordem correta é: **n8n → banco → função → site**. Publicar o site antes disso só
mostra uma tela que falha.

---

## ETAPA 1 — Colocar o n8n online (bloqueia tudo)

Sem esta etapa, nenhum agente funciona, em lugar nenhum.

### Opção A — n8n Cloud (mais rápido, ~US$ 24/mês)

1. Acesse https://n8n.io e crie a conta com o e-mail do escritório.
2. O endereço será algo como `https://jasadvocacia.app.n8n.cloud`.
3. Anote esse endereço — é o `N8N_BASE_URL` da etapa 3.

**Atenção:** a avaliação gratuita expira em 14 dias e a instância é **apagada**.
Se o acesso que você criou antes não funciona mais, é provavelmente isso.

### Opção B — VPS (mais barato, exige administração)

1. Contrate um VPS (Hostinger, Contabo, DigitalOcean — a partir de ~R$ 30/mês).
2. Instale com Docker, seguindo https://docs.n8n.io/hosting/installation/docker/.
3. Aponte um subdomínio (ex.: `automacao.jasadvocacia.com.br`) e configure HTTPS
   com Caddy ou Nginx. **Nunca exponha o n8n sem HTTPS.**

### Em qualquer opção: o que precisa existir lá dentro

Para cada agente do painel, um workflow com nó **Webhook**:

| Agente (slug)     | URL do webhook (caminho)      |
| ----------------- | ----------------------------- |
| `monitor-prazos`  | `/webhook/agente-monitor-prazos` |
| `minuta-pecas`    | `/webhook/agente-minuta-pecas`   |
| `relatorio-diario`| `/webhook/agente-relatorio-diario` |

O corpo que o sistema envia é:

```json
{ "execucao_id": "...", "agente_slug": "monitor-prazos", "entrada": {}, "processo_id": null, "cliente_id": null, "item_id": null }
```

O workflow deve devolver JSON. Para pausar em aprovação humana, devolva
`{ "status": "aguardando_aprovacao", "conteudo": {...} }`.
Para concluir, devolva `{ "status": "concluida", "resumo": "...", "saida": {...} }`.

Se você configurar um token (recomendado), o n8n recebe o header `x-webhook-token`
com o valor que estiver no segredo `N8N_WEBHOOK_TOKEN` (etapa 3). O nó Webhook apenas
valida esse header.

Depois de publicar cada workflow, copie a URL de **produção** (não a de teste) e
preencha a coluna `webhook_url` da tabela `agentes_ia` (etapa 2, passo final).

---

## ETAPA 2 — Banco de dados

A migration `supabase/migrations/20261031120000_agentes_ia_controle.sql` cria
`agentes_ia`, `agente_execucoes`, `agente_execucao_logs` e `agente_aprovacoes`
com RLS por permissão de `controladoria`, e os três agentes iniciais.

Aplique no painel do Supabase → **SQL Editor**: cole o arquivo inteiro e execute.
É idempotente por natureza (cria tabelas novas), mas **rode uma única vez**.

Depois:

```sql
UPDATE public.agentes_ia
SET webhook_url = 'https://SEU-N8N/webhook/agente-monitor-prazos'
WHERE slug = 'monitor-prazos';
```

(repita para os outros dois agentes).

Para desligar um agente temporariamente, use `UPDATE ... SET ativo = false`.
Não existe coluna `habilitado`; o controle é a coluna `ativo`.

---

## ETAPA 3 — Secrets na Edge Function

No painel do Supabase → **Edge Functions** → **Secrets**:

| Nome                 | Valor                                              |
| -------------------- | -------------------------------------------------- |
| `N8N_BASE_URL`       | `https://SEU-N8N` (sem barra no final)             |
| `N8N_WEBHOOK_TOKEN`  | string longa aleatória (a mesma validada no n8n)   |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já são nativos.

Depois publique a função:

```powershell
npx supabase login
npx supabase functions deploy agentes-disparar --project-ref mzwnljgujheumdslkloc
```

O `verify_jwt` fica `true` (padrão) — a função valida o usuário por `getUser`.

---

## ETAPA 4 — Site na Vercel

1. Envie o código ao GitHub (na raiz do projeto):

```powershell
git add -A
git commit -m "Painel de agentes de IA e ponte com n8n"
git push origin main
```

2. Na Vercel → **Add New Project** → importe `jasadvocaica/JAS-Advocacia`.
3. Framework: **Vite**. Build: `npm run build`. Output: `dist` (já vem do `vercel.json`).
4. Em **Environment Variables**, defina:

| Nome                          | Valor                                   |
| ----------------------------- | --------------------------------------- |
| `VITE_SUPABASE_URL`           | `https://mzwnljgujheumdslkloc.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | a chave publicável do projeto          |

5. **Deploy**. Cada `git push` na `main` passa a publicar sozinho.

---

## ETAPA 5 — Ligar o assistente (Bia)

Este é separado dos "agentes": a Bia usa a OpenAI direto.

1. Secret `OPENAI_API_KEY` nas Edge Functions.
2. Publicar: `npx supabase functions deploy assistente-chat --project-ref mzwnljgujheumdslkloc`
3. Em `/assistente`, a gestora abre **Consumo e configuração da IA** e marca
   `habilitado`. Começa desligado por segurança.

---

## O que eu posso fazer daqui

- Commitar e enviar o código ao GitHub.
- Instalar a CLI do Supabase e publicar `agentes-disparar` e `assistente-chat`
  (preciso do seu login/token do Supabase).
- Aplicar a migration pelo SQL Editor com você (ou via CLI, se autenticado).
- Configurar e publicar na Vercel.

**Não posso** criar nem hospedar o n8n. Essa decisão é sua, e a escolha entre
Cloud e VPS muda o custo e quem administra.
