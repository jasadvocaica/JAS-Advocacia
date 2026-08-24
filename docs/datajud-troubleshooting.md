# DataJud — Guia rápido de erros e soluções

Guia rápido para identificar e resolver os erros mais comuns ao consultar processos via API pública do CNJ. Cada bloco lista os sintomas, a causa provável e o passo-a-passo para corrigir o segredo e validar a correção.

> **Wiki oficial do CNJ:** https://datajud-wiki.cnj.jus.br/api-publica/acesso

---

## Antes de começar

A maioria dos erros de DataJud é resolvida **atualizando o segredo `DATAJUD_API_KEY`** com o valor publicado na wiki. O sistema faz uma tentativa automática após falha de autenticação — se ainda assim falhar, siga o guia abaixo.

---

## 401 — Chave inválida ou expirada

**Categoria:** Autenticação

O CNJ rotacionou a chave pública do DataJud (acontece de tempos em tempos) ou o segredo `DATAJUD_API_KEY` foi cadastrado com espaços/aspas extras.

### Como reconhecer
- Mensagem contendo `401`, `unauthorized` ou `security_exception`.
- Banner amarelo/vermelho **"Chave do DataJud inválida ou expirada"** ao consultar processo.
- Falha imediata, sem demora de rede.

### Passos para corrigir
1. **Abrir a wiki oficial do CNJ** — acesse https://datajud-wiki.cnj.jus.br/api-publica/acesso e copie a chave pública atual (string base64 que começa com letras e termina com `==`).
2. **Atualizar o segredo `DATAJUD_API_KEY`** — no painel **Integrações → DataJud**, clique em **"Atualizar chave"** e cole o valor exatamente como está na wiki — sem aspas, sem espaços antes ou depois, sem o prefixo `ApiKey `.
3. **Aguardar a propagação** — após salvar, espere ~15 segundos para o segredo propagar nas funções de borda.

### Como retestar
Volte para um processo com número CNJ válido e clique em **"Consultar DataJud"**. Em caso de sucesso, novos andamentos aparecem em até 5 segundos.

---

## 429 — Limite de consultas atingido

**Categoria:** Rate limit

O CNJ aplica limites por IP/chave. Consultas em massa (jobs ou cliques repetidos) saturam a janela.

### Como reconhecer
- Mensagem contendo `429`, `rate` ou `limit`.
- Funcionou minutos atrás e parou de funcionar de repente.

### Passos para corrigir
1. **Aguardar 2–5 minutos** — a janela de rate limit do DataJud é curta. Não tente reconsultar imediatamente.
2. **Evitar disparos paralelos** — se houver job mensal rodando, espere ele terminar antes de consultas manuais. Verifique o histórico em **Configurações → DataJud**.

### Como retestar
Após o tempo de espera, repita a consulta. Se persistir por mais de 30 minutos, abra a wiki para confirmar mudanças nos limites.

---

## Falha de rede / timeout

**Categoria:** Conectividade

O endpoint do CNJ ficou intermitente ou houve uma queda momentânea. Não é problema do escritório.

### Como reconhecer
- Mensagem contendo `network`, `fetch failed`, `timeout` ou `econnrefused`.
- Demora longa antes do erro aparecer.

### Passos para corrigir
1. **Verificar status do CNJ** — confirme em https://datajud-wiki.cnj.jus.br se há aviso de manutenção ou indisponibilidade.
2. **Tentar de novo em 1–2 minutos** — use o botão **"Tentar novamente"** do banner — ele já reexecuta a chamada.

### Como retestar
Se o segundo retry falhar, aguarde mais alguns minutos. O sistema também tenta automaticamente uma vez em caso de 401 logo após rotação de chave.

---

## Tribunal não suportado

**Categoria:** Cobertura

Nem todos os tribunais publicam dados na API pública do DataJud. Tribunais militares, eleitorais antigos ou alguns ramos específicos podem ficar de fora.

### Como reconhecer
- Mensagem contendo `tribunal`, `não suportado` ou `nao suportado`.
- Acontece sempre para o mesmo processo, independentemente da chave.

### Passos para corrigir
1. **Confirmar o ramo do tribunal** — verifique na wiki do CNJ a lista atualizada de tribunais com endpoint disponível em https://datajud-wiki.cnj.jus.br/api-publica/endpoints.
2. **Cadastrar andamentos manualmente** — use a aba **"Andamentos"** do processo e marque a fonte como **"manual"** — assim os fluxos seguem funcionando.

### Como retestar
Não é necessário reconsultar via DataJud. O processo continuará funcionando com andamentos manuais.

---

## Erro genérico (5xx ou inesperado)

**Categoria:** Outros

Erro temporário do servidor do CNJ ou da função de borda durante deploy/atualização.

### Como reconhecer
- Mensagem sem padrão claro, geralmente com `500`/`502`/`503`.
- Resposta vazia ou `Edge function returned 502`.

### Passos para corrigir
1. **Conferir o detalhe técnico** — expanda o item **"Detalhe técnico"** do banner — o conteúdo bruto da resposta ajuda a identificar se o erro vem do CNJ ou da nossa função.
2. **Repetir após 1 minuto** — aguarde e tente novamente — a maioria dos 5xx do CNJ se resolve sozinha.
3. **Persistindo, abra um chamado** — se ocorrer em múltiplos processos por mais de 15 minutos, registre o detalhe técnico e contate o suporte.

### Como retestar
Após o intervalo, repita a consulta. O banner deve sumir assim que a chamada for bem-sucedida.

---

## Roteiro rápido de validação após trocar a chave

1. Abra um processo conhecido com número CNJ válido (ex.: o último consultado com sucesso).
2. Clique em **"Consultar DataJud"** e aguarde — o banner de erro deve desaparecer.
3. Confirme que novos andamentos foram salvos e que o log de execução em **Configurações → DataJud** mostra a chamada com status verde.
4. Se houver job agendado, dispare manualmente um dry run para validar antes da próxima execução automática.
