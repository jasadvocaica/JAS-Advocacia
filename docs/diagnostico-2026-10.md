# Diagnóstico técnico — JAS Advocacia

Data: outubro/2026
Escopo: revisão completa de UI, código, segurança, UX e documentação.
Método: leitura estática de todo o `src/`, `supabase/`, configs e docs. Nada foi alterado no sistema.

---

## Veredito em uma frase

O sistema **não é amador em funcionalidade** — ele é grande, tem módulos de verdade
(controladoria com prazos, financeiro com repasses, portais externos, telemetria de erros).
O que faz ele **"parecer" amador** são 5 coisas muito específicas e todas corrigíveis:
identidade visual dividida em duas, formulários que erram por toast, tabelas que não
funcionam no celular, tipos desligados (`strict: false`) e documentação que diz uma coisa
enquanto o código faz outra.

Ou seja: o problema é **acabamento e consistência**, não capacidade.

---

## 1. O que já é profissional (não mexer)

Registrar isso é importante para não destruir na hora de reformar.

| Item | Onde | Por quê |
|---|---|---|
| Telemetria de erros centralizada | `src/lib/telemetria.ts` | Intercepta fetch, deduplica, grava em `ui_error_logs`, não quebra o app |
| Error Boundary por rota | `src/components/RouteErrorBoundary.tsx` | Reseta por rota, recupera erro de extensão de navegador, loga |
| RLS auditado | `docs/auditoria-rls.md` | Todas as tabelas com RLS, nenhuma `USING(true)` em mutação, `SECURITY DEFINER` revogado de `anon` |
| Tipos gerados do Supabase | `src/integrations/supabase/types.ts` | Base correta (só precisa ser regenerada) |
| Lazy loading de 100% das rotas | `src/App.tsx` | Performance de entrada boa |
| `useFormDraft` com flush em `pagehide`/`beforeunload` | `src/hooks/useFormDraft.ts` | Padrão correto de rascunho |
| Segregação de portal parceiro/cliente | `src/portal-parceiro`, `src/portal-cliente` | Bem separado, com regras próprias |
| Lógica de domínio testada | `src/lib/*.test.ts` | CPF, prazos, valores monetários, CNIS com testes |
| Testes de "contrato de coluna" | `painel-valeska/logic.test.ts` | Garante que coluna proibida não é consultada |
| `comRetry` com refresh de JWT | `src/lib/supabase-retry.ts` | Conceito avançado (só falta usar) |

---

## 2. Os 5 problemas que mais fazem o sistema parecer amador

### P1 — A identidade visual está dividida em duas

Existem **dois sistemas de cor convivendo**:

- Conteúdo: azul SaaS genérico `--primary: 210 79% 46%` (estilo "Astrea"), fundo cinza-azulado.
- Menu lateral: índigo quase preto + dourado, definido **só** em `.office-sidebar`
  (`src/index.css:262-274`), fora do design system.

Pior: o token chamado `gold` **é azul-escuro** (`src/index.css:31-33`), com comentário
admitindo "remapeado para compat com componentes legados". Então `text-gold` na marca
pinta de azul, e o dourado real só existe no menu.

**Efeito no cliente:** o sistema parece um produto white-label com o menu trocado.

**Conserto:** promover o par índigo + dourado a tema global (`--brand`, `--brand-accent`),
renomear `gold` → `brand`, e remover as três camadas de token sobrepostas.

### P2 — Formulários com 37 campos erram por toast

`src/pages/clientes/ClienteForm.tsx` tem **37 campos**, ~1.500px de altura, e **8 dos 9
erros** saem por `toast.error` (linhas 358-404). O usuário recebe "Informe um CEP válido"
sem saber em qual dos 6 cards está o campo. Só o CPF tem erro inline (L554-558).

Além disso o projeto **tem** `react-hook-form` + `zod` instalados e **`src/components/ui/form.tsx`
pronto — e nenhuma página usa**. Não há nenhum `zodResolver` no código.

**Conserto:** migrar os formulários grandes (Cliente, Processo, Contrato) para
`react-hook-form` + `zod` + `FormMessage`, com foco automático no primeiro erro.
Começar pelo CPF, que já é o padrão visual correto.

### P3 — As duas telas mais usadas não funcionam no celular

`ClientesList` (8 colunas) e `ProcessosList` (**14 colunas**) só têm `overflow-x-auto`,
sem nenhuma versão alternativa. No celular a secretária rola horizontalmente para
chegar no botão de abrir. Não existe nenhum `md:hidden` nesses arquivos.

**Conserto:** card-list abaixo de `md` com os 3 campos decisivos, e o resto em `Sheet`.

### P4 — TypeScript está desligado na prática

- `strict: false`, `noImplicitAny: false` em `tsconfig.app.json:17-22`.
- **933 `any`** em 201 arquivos (~50% da base).
- ~20 arquivos com `(supabase as any)` porque `types.ts` está **desatualizado** —
  faltam as tabelas `mkt_*`, `whatsapp_*`, `assistente_*`, `ie_jobs`, `seguranca_eventos`.

Consequência real, não teórica: `Dashboard.tsx:236` busca `atingimento_geral_pct` mas o
tipo espera `atingimento_pct`, e `d.atingimento_pct.toFixed(0)` (L854) **quebra em runtime**.

**Conserto:** regenerar tipos → remover `as any` → ligar `noImplicitAny` (depois `strict`).

### P5 — A documentação contradiz o código

`docs/navegacao-simplificada.md` afirma que o menu foi simplificado e que "Comercial
se ausenta". No código, Comercial **voltou** (`AppLayout.tsx:54-55`), Mural **voltou**
(L124-148), e Marketing ocupa **5 das ~20 entradas** do menu.

Para quem abre o projeto (você daqui a 6 meses, um dev novo, um auditor), isso é o
sinal mais forte de "amador" — porque sugere que ninguém sabe o estado real.

**Conserto:** README e docs refletindo a realidade + um `CHANGELOG` curto.

---

## 3. Achados por área

### 3.1 Visual / UI

| # | Achado | Gravidade | Local |
|---|---|---|---|
| V1 | `src/App.css` é lixo do template Vite, não importado, com `#root{max-width:1280px}` que quebraria o layout se ativado | Alta | `src/App.css` |
| V2 | Escala de `h1` com **4 tratamentos diferentes** (`text-3xl sm:text-4xl`, `text-3xl`, `text-2xl font-bold`, `font-serif italic`) | Alta | `PageHeader.tsx:13`, `Dashboard.tsx:108`, `MeuPonto.tsx:111`, `StepUpload.tsx:55` |
| V3 | Cores Tailwind cruas (`amber`/`emerald`/`blue`/`orange`/`violet`) em ~37 arquivos, ignorando os tokens `--success`/`--warning` que existem e não são usados | Média | ex.: `ParceirosPainel.tsx:124`, `WorkflowEtapas.tsx:25` (com hex cru `#7c3aed`) |
| V4 | Microtipografia `text-[9px]`/`[10px]`/`[11px]` em **361 ocorrências / 106 arquivos** — trava qualquer ajuste global de acessibilidade | Média | vários |
| V5 | Dark mode "meio-ligado": `.dark` é aplicado em `main.tsx:7` mas **não existe bloco `.dark`** no CSS; 21 arquivos usam `dark:` órfão | Média | `main.tsx:7`, `index.css` |
| V6 | Sem componente único de Heading, EmptyState, LoadingState ou StatusBadge — cada página improvisa (nenhuma tem skeleton nas listas principais) | Média | ~110 páginas |
| V7 | Logo em **3 implementações**: `BrandLogo.tsx`, `<svg>` inline em `AppLayout.tsx:196` (com `viewBox` mágico), e Login. Em `AppLayout` o `BrandLogo` é **importado e nunca usado** | Média | `AppLayout.tsx:23,196` |
| V8 | Bug em `BrandLogo.tsx:88`: `showTagline && !usandoCustom === false` → tagline só aparece quando há logo customizada, o oposto do que o comentário diz | Média | `BrandLogo.tsx:88` |
| V9 | `useBrandingLogo` faz query Supabase sem cache e o `loading` retornado nunca é usado → layout shift na troca | Média | `src/hooks/useBrandingLogo.ts:12-38` |
| V10 | Arquivos mortos: `src/components/ui/sidebar.tsx` (600+ linhas, 0 imports), classes `.text-gradient-gold`, `.glass-card`, `.gold-divider`, `.bg-navy-gradient` (0 usos) | Baixa | vários |
| V11 | Dois sistemas de toast convivendo: `sonner` no Login, `@/hooks/use-toast` no AppLayout | Baixa | `Login.tsx` vs `AppLayout.tsx:10` |

### 3.2 Código / arquitetura

| # | Achado | Gravidade | Local |
|---|---|---|---|
| C1 | **369 `supabase.from(...)` em 115 arquivos**, quase todas dentro de páginas. Não existe camada `services/` | Alta | todo `src/pages` |
| C2 | O mesmo lookup `profiles/clientes/parceiros (id, nome) where ativo` duplicado **27 vezes** em 21 arquivos | Alta | ex.: `ProcessosList.tsx:92`, `TriagemList.tsx:93`, `ContratoForm.tsx:79` |
| C3 | React Query usado em **só 51 queries** (21 arquivos, quase tudo `/comercial`) contra 369 manuais. `invalidateQueries` em 6 arquivos. Resultado: dados desatualizados entre telas e refetch duplicado | Alta | `App.tsx:167-177` |
| C4 | 4 arquivos gigantes: `ComercialWhatsApp.tsx` (~1.411), `TimbradoUploader.tsx` (~997), `Dashboard.tsx` (~1.060), `App.tsx` (~500 com 150 `lazy()`) | Alta | — |
| C5 | **501 `toast.error` em 134 arquivos** com 4 dialetos diferentes; alguns **vazam `error.message` cru do banco** ao usuário | Alta | ex.: `RepassesList.tsx:93` |
| C6 | Erros silenciosos: `Controladoria.tsx:117,223` só fazem `console.error` — usuário não vê nada. `AuthContext.tsx:105-107` retorna sem mensagem se as 3 queries de perfil falharem | Alta | — |
| C7 | `console.log` de debug em produção | Média | `PecaForm.tsx:331,333,335,337` |
| C8 | `comRetry` (refresh de JWT + retry) usado em apenas **5 arquivos** | Média | `src/lib/supabase-retry.ts` |
| C9 | ESLint "gentil": `no-unused-vars: off`, sem `no-explicit-any`, `no-console`, `no-floating-promises` | Média | `eslint.config.js:23` |
| C10 | `tsconfig.json` raiz com `compilerOptions` que **são ignorados** (project references incompleto) | Baixa | `tsconfig.json:5-11` |
| C11 | Teste placeholder `expect(true).toBe(true)`; zero cobertura nos 3 maiores arquivos e no `AuthContext` | Média | `src/test/example.test.ts` |
| C12 | `Dashboard` faz early return para estagiário antes dos hooks (L83-85) — funciona, mas viola regra de hooks e é frágil | Média | `Dashboard.tsx:83` |

### 3.3 Segurança

| # | Achado | Gravidade | Local |
|---|---|---|---|
| S1 | `portal-cliente` **não tem ErrorBoundary** → erro de render = tela branca para o cliente | Alta | `PortalClienteLayout.tsx` |
| S2 | Sem ErrorBoundary no nível de `<App />` — erro em `AuthProvider`/rotas não é capturado | Média | `main.tsx` |
| S3 | Login do cliente **não tem "esqueci minha senha"** — só a dica "senha inicial = primeiro nome + 123#" (padrão previsível, risco real) | Alta | `Login.tsx:196,258-260` |
| S4 | Campo CPF do cliente usa `autoComplete="username"` → gerenciador de senhas preenche credencial da equipe | Média | `Login.tsx:231` |
| S5 | Toggle "mostrar senha" com `tabIndex={-1}` → inacessível por teclado (WCAG 2.1.1) | Média | `Login.tsx:212` |
| S6 | `SelecionarPortal.tsx`: cards são `<Card onClick>` sem `role`, `tabIndex` ou `onKeyDown` → **impossível escolher portal por teclado** | Alta | `SelecionarPortal.tsx:106-116` |
| S7 | RLS: **auditado e saudável** (ver `docs/auditoria-rls.md`). Sem segredos hardcoded encontrados no `src/` | ✅ OK | — |
| S8 | `.env.example` existe; confirmar que `.gitignore` cobre `.env.local` | Verificar | `.gitignore` |

### 3.4 UX / navegação

| # | Achado | Gravidade | Local |
|---|---|---|---|
| U1 | Menu com **12 a ~22 itens**, acordeão que só mantém **um grupo aberto por vez** e se re-sincroniza a cada navegação → "o menu se fecha sozinho" | Alta | `AppLayout.tsx:141-169` |
| U2 | "Intimações" aponta para `/ferramentas/publicacoes-pje` — produção jurídica mora em Ferramentas | Média | `AppLayout.tsx:48` |
| U3 | Marketing ocupa 5 entradas de menu; ícones posicionais por índice (`[LayoutDashboard, ...][index]`) quebram ao adicionar item | Média | `AppLayout.tsx:50,56` |
| U4 | Nenhuma página tem **breadcrumb** (componente existe, usado só no portal parceiro) | Média | `PageHeader.tsx` |
| U5 | "Sincronizar acesso" no header é `window.location.reload()` disfarçado — perde filtros e formulário em edição | Alta | `AppLayout.tsx:360-376` |
| U6 | Dashboard do gestor: **11 blocos**; gráficos e mapa aparecem **antes** de "o que vence hoje"; o mesmo prazo aparece 2-3x na tela; todos os links levam a `/controladoria` genérico sem `?item=` | Alta | `Dashboard.tsx:420-880` |
| U7 | "Movimentações recentes" (DataJud) não é clicável para o processo | Média | `Dashboard.tsx:761-785` |
| U8 | `ClienteForm` reimplementa o auto-save **sem** o flush em `pagehide`/`blur` do hook oficial; na edição o rascunho **sobrepõe dados do banco**; "Descartar" faz `reload()` | Alta | `ClienteForm.tsx:171-236` |
| U9 | Bloco de "Triagem com IA" no meio do cadastro; resultado gravado como texto livre em `observacoes` (não filtrável/relatável) | Média | `ClienteForm.tsx:341-353,601-705` |
| U10 | Botão "Salvar" só no fim de formulário de ~1.500px; sem barra sticky | Média | `ClienteForm.tsx:900` |
| U11 | Acessibilidade sistêmica: `Label` sem `htmlFor` em ~37 campos (e o padrão se repete no app); ações de linha só com ícone sem `aria-label` (`ProcessosList.tsx:568-573`); sino de notificações sem label e sem `aria-live` (`NotificacoesBadge.tsx:92`); hamburger mobile sem label (`AppLayout.tsx:294`) | Alta | vários |
| U12 | Cabeçalhos de ordenação de tabela são `<TableHead onClick>` — não focáveis por teclado | Média | `ProcessosList.tsx:476-485`, `ClientesList.tsx:339-349` |

---

## 4. Plano de execução sugerido

Ordenado por **razão impacto/risco**. Cada fase é independente e pode parar no fim de qualquer uma.

### Fase 0 — Limpeza segura (1-2h, risco ~zero)
- Deletar `src/App.css`, `src/components/ui/sidebar.tsx` e as classes CSS órfãs.
- Remover os 4 `console.log` de `PecaForm.tsx`.
- Deletar `src/test/example.test.ts`.
- Corrigir `docs/navegacao-simplificada.md` para refletir o código.
- Escrever `CHANGELOG.md` e refazer o `README.md` (hoje chama o sistema de
  "Faithful Screen Craft" e o `package.json` ainda é `vite_react_shadcn_ts`/`0.0.0`).

### Fase 1 — Segurança e não-perder-dados (2-4h, risco baixo)
- ErrorBoundary no portal do cliente e na raiz do app.
- Recuperação de senha para o cliente (fluxo Supabase `resetPasswordForEmail`).
- `Login`: remover `tabIndex={-1}`, corrigir `autoComplete`, `aria-invalid` + `aria-describedby`.
- `SelecionarPortal`: trocar `Card onClick` por `<button>`.
- `ClienteForm`: usar `useFormDraft`, parar de mesclar rascunho por cima do banco, tirar o `reload()`.

### Fase 2 — Identidade visual unificada (1-2 dias, risco médio)
- Tema global índigo + dourado; renomear `gold` → `brand`; apagar tokens mortos.
- Remover `dark:` órfãos (decisão oficial: sem dark mode).
- Componentes `Heading`, `StatusBadge` (com `success`/`warning`), `EmptyState`, `LoadingState`.
- Unificar logo num único `BrandLogo` com `Skeleton` no loading e cache via React Query.
- Padronizar ações de tabela com um `<IconAction label="...">` obrigatório.

### Fase 3 — TypeScript e dados (3-5 dias, risco médio)
- Regenerar `types.ts` (`npx supabase gen types typescript`) e remover `(supabase as any)`.
- Ligar `noImplicitAny` + `no-unused-vars` + `no-console` no ESLint.
- Criar `src/services/lookups.ts` e eliminar as 27 duplicatas.
- Migrar as listas principais (Clientes, Processos, Financeiro) para React Query.

### Fase 4 — UX das telas mais usadas (3-5 dias, risco médio)
- Card-list mobile para Clientes e Processos.
- Forms grandes em `react-hook-form` + `zod`, erro inline e foco no primeiro inválido.
- Dashboard: bloco "Hoje" no topo, com deep-links `?item=`.
- Menu: um único `NAV` tipado com ícone no item; permitir múltiplos grupos abertos;
  Marketing em 1 entrada; corrigir rota de "Intimações".
- Breadcrumb no `PageHeader`.

### Fase 5 — Robustez (contínuo)
- Helper `exibirErro(err, contexto)` substituindo os 501 toasts ad hoc.
- Adotar `comRetry` nas mutations.
- Quebrar `ComercialWhatsApp`, `TimbradoUploader`, `Dashboard`, `App.tsx`.
- Testes em `AuthContext`, `RouteErrorBoundary` e nos formulários migrados.

---

## 5. Regra de ouro para as próximas alterações

Antes de qualquer mudança visual, rodar `npm run build` e `npm test` e guardar o resultado.
O projeto tem `strict` desligado, então o `tsc` não protege: o build é o único indicador
confiável de que nada quebrou.
