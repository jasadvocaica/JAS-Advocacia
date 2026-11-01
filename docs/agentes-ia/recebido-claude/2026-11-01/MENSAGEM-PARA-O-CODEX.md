# Mensagem para colar no Codex

Coloque a pasta `entrega-codex` em `docs/agentes-ia/` do repositório do sistema
e envie o texto abaixo.

---

Vamos colocar agentes de IA para funcionar sozinhos dentro do sistema JAS
(app.julianaaraujoadvocacia.com). **Não vamos mais usar o n8n**: fila, horários
e chamadas aos agentes passam a ser feitos pelo próprio Supabase (pg_cron + pg_net
+ Edge Functions), no mesmo padrão de `datajud-diario`.

Leia antes de escrever qualquer código:
1. `docs/agentes-ia/ESPECIFICACAO-AGENTES-IA.md` (versão 2): o que construir, regras e fases.
2. `docs/agentes-ia/migration-referencia.sql`: rascunho do banco, com a fila
   (`agentes_reservar`, `agentes_destravar`, `agentes_devolver`) e o relógio
   (`cron.schedule`). Confira contra o schema atual antes de usar.
3. `docs/agentes-ia/referencia/`: código de referência do `agentes-trabalhador`
   e do `agentes-agendador`, com testes (`node --test docs/agentes-ia/referencia/testes/`).
4. `docs/agentes-ia/personas/`: regras gerais e perfil de cada agente.

Regras:
- O sistema está em uso todo dia. Migrations só incrementais.
- A Vanessa (`agente-prazos`) precisa continuar funcionando em todas as fases.
- Leitura de dados pelos agentes sempre com as permissões de um usuário (RLS).
- Nenhuma ação sai sem aprovação humana.
- Nenhuma chave no código nem em migration: segredos nas Edge Functions e no Vault.

Faça **só a Fase 0** agora (seção 13): publicar o que está no branch
`vanessa-n8n` e trocar o n8n pela fila e pelo relógio do Supabase **sem parar a
Vanessa**. Antes de codar, me mostre:
- o que você encontrou no código que muda o plano;
- a lista de arquivos que vai criar ou alterar;
- como vai testar sem gastar crédito de IA;
- o que eu preciso fazer no painel do Supabase (secret `AGENTES_TOKEN`, Vault `agentes_token`).

Ao terminar, rode os testes e o build e me diga o que passou e o que não passou.
Só desligamos o n8n depois que a Vanessa rodar sozinha um dia útil pela fila nova.

---

## Fases seguintes (uma mensagem por vez)

> **Fase 1.** Siga a seção 13, Fase 1: executor genérico `agente-executar` com Manu e Helena.

> **Fase 2.** Siga a seção 13, Fase 2, e as seções 16 a 18: Central de Comandos
> (rota `/central`), Manu coordenadora que cria e distribui a atividade na
> Controladoria, entrega e revisão dentro da atividade, pedidos de atendimento
> (quem ainda não é cliente) que passam para o cliente na conversão, e as
> métricas. O banco está em `docs/agentes-ia/migration-central-atendimentos.sql`
> (aplicar depois da `migration-referencia.sql`; confira as colunas reais antes).
> Antes de codar, me mostre como vai ficar a tela da Central e a tela de revisão
> dentro da atividade.

> **Fase 3.** Instale a sala de Marketing seguindo
> `docs/agentes-ia/agentes-marketing/LEIA-ME.md` (seção "Instalar no sistema").
> O código já está escrito e testado; adapte só o encaixe em
> `agentes-acoes-executar` e a tela de aprovação. Rode os testes da pasta.

> **Fase 4 e 5.** Telegram, WhatsApp, restante da equipe e escritório virtual.
