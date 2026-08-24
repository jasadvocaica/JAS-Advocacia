# Faithful Screen Craft — Sistema de Gestão Jurídica

Sistema web completo para escritórios de advocacia, com três portais distintos (interno, parceiro e cliente) e integração com Supabase.

## Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | React 18 + TypeScript + Vite |
| UI | shadcn/ui + Tailwind CSS |
| Backend / Banco | Supabase (PostgreSQL + Auth + Storage) |
| Estado remoto | TanStack React Query |
| Formulários | React Hook Form + Zod |
| Editor rich text | TipTap |
| Gráficos | Recharts |
| Documentos | docx, jsPDF, xlsx, mammoth |

## Pré-requisitos

- Node.js 18+
- npm 9+ (ou pnpm / bun)
- Conta no [Supabase](https://supabase.com)

## Configuração

### 1. Clonar e instalar

```bash
git clone <url-do-repo>
cd faithful-screen-craft
npm install
```

### 2. Variáveis de ambiente

Crie um arquivo `.env.local` na raiz:

```env
VITE_SUPABASE_URL=https://<seu-projeto>.supabase.co
VITE_SUPABASE_ANON_KEY=<sua-chave-anon>
```

Você encontra esses valores em **Supabase → Project Settings → API**.

### 3. Banco de dados

Aplique as migrations do Supabase:

```bash
npx supabase db push
```

Ou importe o schema manualmente via Supabase Studio.

### 4. Rodar em desenvolvimento

```bash
npm run dev
```

A aplicação estará disponível em `http://localhost:8080`.

## Scripts disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Servidor de desenvolvimento com HMR |
| `npm run build` | Build de produção |
| `npm run build:dev` | Build em modo development |
| `npm run preview` | Preview do build de produção |
| `npm run lint` | Verificação de lint com ESLint |
| `npm run test` | Executa a suíte de testes (Vitest) |
| `npm run test:watch` | Testes em modo watch |

## Portais

### Portal Interno (`/`)
Acesso exclusivo para a equipe do escritório. Módulos:
- **Clientes** — cadastro, triagem, atendimentos, duplicados
- **Processos** — gestão completa com acompanhamento
- **Controladoria** — fluxos processuais e monitoramento
- **Financeiro** — contratos, pagamentos, repasses, suprimentos, fechamento mensal
- **Documentos** — peças e modelos com editor rich text
- **Parceiros** — gestão, painel, distribuição por IA
- **Equipe** — ponto, férias, metas, comissões, folha de pagamento
- **Ferramentas** — calculadora de honorários, CNIS, PERDCOMP-INSS, notificações extrajudiciais, publicações PJe
- **IA** — assistente, automações, MCP Server
- **Configurações** — escritório, portais, integrações, DataJud

### Portal Parceiro (`/portal-parceiro`)
Para parceiros externos. Acesso a processos indicados, repasses, documentos e tarefas.

### Portal Cliente (`/portal-cliente`)
Para clientes do escritório. Acompanhamento de processos, documentos e financeiro.

## Perfis de acesso

| Perfil | Nível |
|--------|-------|
| `gestor` | Acesso total ao portal interno |
| `advogado` | Módulos jurídicos |
| `controladoria` | Módulo de controladoria e fluxos |
| `administrativo` | Clientes, documentos, agenda |
| `estagiario` | Acesso restrito conforme configuração |

## Integrações externas

- **DataJud** — consulta de processos no PJe via API do CNJ
- **ViaCEP** — preenchimento automático de endereço
- **CNIS** — calculadora previdenciária

## Estrutura de pastas

```
src/
├── components/       # Componentes reutilizáveis e shadcn/ui
├── contexts/         # AuthContext, PreviewModeContext
├── hooks/            # Hooks customizados
├── integrations/     # Cliente e tipos do Supabase
├── lib/              # Utilitários (formatadores, validações, exports)
├── pages/            # Páginas do portal interno
├── portal-cliente/   # Páginas e layout do portal cliente
└── portal-parceiro/  # Páginas e layout do portal parceiro
```

## Deploy

O projeto foi criado via [Lovable](https://lovable.dev) e pode ser publicado diretamente pela plataforma. Para deploy manual:

```bash
npm run build
# Faça o deploy da pasta dist/ no seu provedor (Vercel, Netlify, etc.)
```

Certifique-se de configurar as variáveis de ambiente `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no ambiente de produção.
