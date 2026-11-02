# Área de produção jurídica

**Configuração atual:** somente GPT/OpenAI está disponível na interface, por orientação da usuária. Claude foi retirado da seleção; preferências antigas por Claude não alteram o provedor das novas consultas. A produção está conectada à biblioteca de legislação importada; consulte a cobertura na aba Legislação e os detalhes em [biblioteca-juridica.md](biblioteca-juridica.md).

Implementação em `/documentos/pecas/novo` e `/documentos/pecas/:id`.

- Editor A4 com ajuste à largura, zoom e modo de tela cheia.
- Lateral recolhível com contexto, assistente e revisão; em telas menores fica abaixo do editor.
- Contexto salvo em `doc_pecas.contexto_producao`: tarefa de origem, determinação judicial, objetivos, fatos/documentos transcritos, orientações, datas informadas, fontes e checklist.
- A ação **Produzir minuta** na Controladoria abre o editor com cliente, processo e tarefa. A descrição e as orientações disponíveis são copiadas; o prazo continua exigindo conferência. A peça não conclui nem altera a tarefa.
- Sugestões da IA têm prévia e aplicação explícita. Antes de substituir ou restaurar, o rascunho atual é salvo; a operação transacional registra antes/depois. Falhas preservam o texto na tela.
- Autosave após três segundos também cobre metadados e contexto. O primeiro salvamento é manual, após informar título e cliente. Ctrl/Cmd+S salva. Erros são visíveis e interrompem novas tentativas automáticas até o salvamento manual.
- `atualizado_em` é comparado dentro de um bloqueio da linha para rejeitar gravações de sessões desatualizadas. A RPC usa `SECURITY INVOKER`, respeita RLS e reverte snapshots se houver erro.
- Histórico mostra prévia sem alterar a minuta; restauração cria outra versão. O número da versão pode avançar duas posições porque são preservados o estado anterior e o resultado.
- Comentários podem referenciar um trecho selecionado. Autor ou gestão podem resolver/reabrir, conforme as políticas já existentes.
- Checklist, pendências de preenchimento, comentários abertos e conferência do prazo são verificados na aprovação. Aprovar, finalizar e registrar protocolo exigem advogado/gestão também no banco. Documentos finalizados exigem reabertura para edição; protocolados permanecem bloqueados.
- Word continua sendo exportação local; PDF usa impressão do navegador. Registro de protocolo exige informar sua data e não envia arquivos ao tribunal.

## Ativação no ambiente publicado

A migração e a função foram ativadas no projeto JAS em 02/11/2026, após autorização. O teste transacional no banco real confirmou criação, salvamento, versões e rejeição de gravações desatualizadas; os dados de teste foram revertidos. A publicação do frontend é feita pelo workflow `Publicar sistema` ao atualizar `main`.

Componentes da publicação:

1. A migração `supabase/migrations/20261102141741_documentos_workspace.sql`.
2. A Edge Function `documentos-assistente` e sua configuração em `supabase/config.toml`.
3. O frontend atualizado.

O provedor ativo selecionado pela usuária é OpenAI (GPT), conectado diretamente pela API. O suporte técnico à Anthropic permanece reservado para futura ativação. Na verificação de 02/11/2026, a chave OpenAI estava configurada e o acesso ao modelo foi confirmado pela consulta à API de modelos, sem envio de dados de clientes. A chave Anthropic ainda não estava configurada. O editor, o salvamento e a revisão funcionam independentemente das chaves.

A lateral utiliza somente GPT. A origem da sugestão fica salva com a peça. Sem a chave OpenAI, a geração fica pendente e não alterna automaticamente para outro provedor.

OpenAI usa `OPENAI_API_KEY` e o modelo `gpt-4.1` por padrão, configurável por `OPENAI_MODEL`. Anthropic usa `ANTHROPIC_API_KEY` e `claude-sonnet-4-6`, configurável por `ANTHROPIC_MODEL`. As chaves ficam apenas nos secrets do Supabase. MCP pode conectar ferramentas e fontes, mas não fornece acesso ao modelo Claude nem substitui a credencial da API Anthropic. Não expor a chave no frontend. A consulta GET à função retorna apenas `status`, `ia_configurada` e a disponibilidade booleana de cada provedor, sem credenciais nem dados de clientes; `?verificar=openai` verifica o acesso à API de modelos, sem gerar texto. POST continua exigindo autenticação. Ela valida a sessão com `getUser`, usa o JWT do usuário e a chave anon para todas as consultas, e confere a permissão de editar documentos. Não usa `service_role`, não salva nem protocola.

Antes de publicar, testar em homologação com perfis reais de estagiária e advogado, confirmar as políticas existentes de clientes/processos/comentários e testar salvamento em duas sessões. A migração é aditiva, mas reforça transições de status também em outras telas que gravem `doc_pecas`.

## Limites atuais da assistência

A biblioteca indexa as normas importadas do repositório, com pesquisa por dispositivo e versão. A cobertura inicial é parcial e aparece na aba Legislação. A IA recebe a minuta, nome do cliente, identificação básica do processo, contexto informado e dispositivos recuperados. Links informados manualmente não são abertos durante a geração; anexos do caso não são lidos automaticamente. Não existe cálculo automático de prazo ou acionamento automático após DJEN nesta entrega.

A última sugestão e suas pendências são salvas com o contexto. A IA não confirma vigência de fontes, não inventa prova e deve marcar lacunas como `[INSERIR: ...]`. A revisão final é humana.

## Verificação

Para instalar as dependências neste projeto, use `npm ci --legacy-peer-deps`. Existe um conflito prévio entre `date-fns` 4 e o peer declarado por `react-day-picker` 8; atualizar o calendário fica fora desta alteração. O editor não depende desse calendário.

```bash
npx vitest run src/pages/documentos/workspace.test.ts src/pages/documentos/PecaForm.test.tsx
npx vitest run src/lib/documentos-export.test.ts
npm run test:documentos:db
npm run test:documentos:edge
npm run build
```

O teste do banco usa PostgreSQL WASM em memória, sem conexão ao projeto remoto. Valida criação, snapshots, rollback, concorrência, vínculos, RLS, aprovação, reabertura e protocolo. O teste da função executa o handler real com banco, Auth e provedor simulados, sem requisições externas. Isso não substitui a homologação com as políticas e credenciais do ambiente publicado.

As dependências do TipTap foram alinhadas na versão principal 3: a extensão Typography estava declarada na versão 2, em conflito com o editor. O lockfile npm foi sincronizado com o manifesto para permitir instalação reproduzível.
