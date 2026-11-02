# Motor de missões (Fase 2): como testar e ligar

Tudo aqui é para a **homologação** (projeto Supabase separado). Nada foi aplicado
em produção. O motor nasce **desligado** e nenhum agente recebe ferramenta sozinho.

## O que entra

| Peça | Arquivo |
|---|---|
| Migration (missões, tarefas, ferramentas por agente, aprovações com escopo, orçamento em dólar, auditoria) | `supabase/migrations/20261102120000_motor_missoes_fase2.sql` |
| Regras puras (validação de ferramentas, rodadas de function calling, avisos e simulação de orçamento) | `supabase/functions/_shared/motor.ts` |
| Edge Function | `supabase/functions/motor-missoes/index.ts` |
| Testes | `src/lib/motor.test.ts` (vitest) e `tests/motor/*.sql` (banco descartável) |

## Testes

Banco descartável em memória (PGlite, sem Docker):

```bash
npm i --no-save @electric-sql/pglite@0.2.17
node tests/motor/rodar-pglite.mjs
```

Ou com PostgreSQL de verdade, num banco vazio:

```bash
psql -v ON_ERROR_STOP=1 -f tests/motor/bootstrap.sql -f supabase/migrations/20261102120000_motor_missoes_fase2.sql -f tests/motor/fluxo.sql
```

O fluxo cobre:
- missão nasce com o motor desligado e nada é reservado;
- só gestor cria missão e liga o motor;
- delegar exige a ferramenta concedida; a delegação é idempotente;
- a ação sensível vira pedido de aprovação e não executa antes de aprovada;
- quem decide precisa de permissão `editar` no módulo; quem não tem não vê o pedido;
- o hash do escopo aprovado é conferido, e escopo alterado depois não executa;
- a execução acontece **uma vez só**, e a missão fecha depois da ação;
- o limite do dia é o orçamento mensal dividido pelos dias restantes; reserva acima é recusada;
- aumento de orçamento só por gestor e nunca acima do teto (US$ 20);
- custo acima do reservado desliga o motor;
- a auditoria não aceita alteração e o navegador não enxerga nada;
- sem orçamento, a tarefa volta para a fila sem gastar tentativa.

Tipos da função:

```bash
deno check --no-config --import-map=tests/agentes/deno-imports.json supabase/functions/motor-missoes/index.ts
```

## Ferramentas da Fase 2

| Ferramenta | Classe | O que faz |
|---|---|---|
| `consultar_indicadores` | leitura | contagens da Controladoria (reusa `escritorio_contexto_analista`) |
| `listar_itens_controladoria` | leitura | até 20 itens abertos, sem dados pessoais |
| `buscar_processo` | leitura | tribunal, vara, área, situação pelo CNJ |
| `delegar_tarefa` | escrita interna | nova tarefa para outro agente na mesma missão (profundidade máx. 3, máx. 12 tarefas) |
| `criar_item_controladoria` | **sensível** | só cria pedido na Central de Aprovações; ao aprovar, grava com o id do pedido (repetir não duplica) |

## Ligar na homologação (nesta ordem)

1. Aplicar a migration **só no projeto de homologação**.
2. Publicar `motor-missoes` só na homologação.
3. Conferir que `assistente_config.habilitado` está ligado lá e que a chave OpenAI é a de teste.
4. Conceder ferramentas, agente por agente (ação `ferramenta`), começando pela Manu com
   `delegar_tarefa` e um agente com leitura.
5. Ligar o motor (ação `ajustar` com `ligado: true`).
6. Criar o gatilho de pulso **desligado**, apontando para a própria homologação
   (`x-djen-cron-secret` do Vault da homologação), e ativar só para o teste.
7. Teste de aceite: uma missão cria tarefa, delega, lê dado real, propõe uma
   atividade, e a atividade só aparece na Controladoria depois de aprovada, uma vez.

## Telas

| Tela | Rota | O que faz |
|---|---|---|
| Sala da Gestora | `/escritorio/gestora` | Manu como Gestora Geral: Central de Aprovações (ação e orçamento), orçamento do mês e do dia, ligar/desligar o motor com confirmação, agentes em operação, comunicação entre agentes |
| Central de Missões | `/escritorio/missoes` | Quadro por estado real (na fila, em execução, aguardando aprovação, concluídas, com falha), nova missão (Manu por padrão), detalhe com as tarefas delegadas, atividades recentes da auditoria |

As duas leem a ação `painel` de `motor-missoes` (só gestor) e mostram aviso claro quando o motor ainda não está instalado. Testes: `src/pages/agentes-ia/escritorio/missoes/missoes.test.tsx`.

## Fica para as próximas fases

- Pulso pelo worker da VPS (hoje: cron com segredo).
- Gestora com distribuição por desempenho, salas e reuniões (Fase 3).
- Consumo dos `eventos` (DJEN, falhas) pelo motor.
