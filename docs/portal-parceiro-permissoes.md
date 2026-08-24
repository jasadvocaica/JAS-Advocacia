# Matriz de permissões — Portal do Parceiro

Documento de referência para o que cada página do portal expõe ao parceiro
e o que **deve permanecer oculto** para proteger conteúdo interno do
escritório (modelos, teses, estratégias, base de clientes, financeiro
global). A implementação canônica está em
[`src/portal-parceiro/permissoes.ts`](../src/portal-parceiro/permissoes.ts).

## Princípios

1. **Negado por padrão.** Só é exibido o que está liberado nesta matriz.
2. **Duas camadas de defesa:**
   - **Banco (RLS + flags):** `documentos.compartilhar_com_parceiro` e
     `controladoria_itens.visivel_parceiro` precisam estar `true`.
   - **UI:** as páginas escondem botões/seções mesmo que o backend
     devolva dado a mais.
3. **Auditoria:** toda visualização/download de documento é registrada
   em `parceiro_documento_acesso_log`.
4. **Escopo:** parceiro só enxerga processos/clientes/tarefas onde está
   diretamente vinculado.

## Matriz por página

| Página | No menu | Pode ver | Ações permitidas | Sempre oculto |
|---|---|---|---|---|
| **Dashboard** | ✅ | Métricas dos processos dele | Visualizar | Faturamento global, métricas de outros parceiros, lista de clientes, tarefas internas |
| **Processos** | ✅ | Lista filtrada por `parceiro_id` | Visualizar lista | Processos sem vínculo, estratégia/observações privadas, honorários totais |
| **Processo (detalhe)** | — | Andamentos, partes, prazos visíveis | Ver detalhe, chat do processo, upload/download de docs marcados | Teses/modelos do escritório, minutas internas, comentários da controladoria, histórico da equipe, dados do contrato, cofre de credenciais |
| **Minhas tarefas** | ✅ | Tarefas onde é responsável + `visivel_parceiro=true` | Visualizar, concluir tarefas próprias | Tarefas de terceiros, backlog interno, atribuição a outros |
| **Meus prazos** | ✅ | Prazos dos processos dele + `visivel_parceiro=true` | Visualizar | Prazos sem vínculo, agenda interna |
| **Documentos** | ✅ | Apenas docs com `compartilhar_com_parceiro=true` dos processos dele | Visualizar, upload, download | Biblioteca de modelos/teses, rascunhos, docs de outros clientes, contratos comerciais |
| **Meus repasses** | ✅ | Apenas linhas em `honorarios_repasses` para o parceiro | Visualizar | Faturamento total, repasses de outros, custos, margem de lucro |
| **Perfil** | ✅ | Próprios dados | Editar perfil | Permissões internas, configurações do escritório, logs de outros |

## Páginas/áreas removidas do portal

- ❌ **Clientes** (lista geral) — substituída pela visão por processo.
- ❌ **Mensagens** (inbox global) — chat só dentro do processo.
- ❌ **Financeiro completo** — substituído por "Meus repasses".
- ❌ **Modelos / Teses / Biblioteca** — nunca expostos.
- ❌ **Configurações do escritório** — restrito ao painel interno.

## Campos sensíveis que nunca devem aparecer no portal

- `clientes.observacoes`, `clientes.renda_*`, `clientes.responsavel_legal_*`
- `cliente_credenciais.*` (cofre de senhas)
- `processos.estrategia`, `processos.observacoes_internas`
- `controladoria_comentarios` (sem flag pública)
- `honorarios_contratos.valor_*` (parceiro só vê `honorarios_repasses`)
- `equipe_*` (qualquer dado da equipe interna)
- `doc_modelos`, `doc_pecas` em status diferente de `protocolado`/`compartilhado`

## Como adicionar uma nova página ao portal

1. Adicionar entrada em `PERMISSOES_PARCEIRO` em
   `src/portal-parceiro/permissoes.ts` listando `acoes` e `ocultar`.
2. Adicionar item em `NAV_PARCEIRO_KEYS` (se for de menu).
3. Garantir que existe **flag ou RLS** filtrando os dados antes de
   chegarem ao frontend.
4. Atualizar este documento.
