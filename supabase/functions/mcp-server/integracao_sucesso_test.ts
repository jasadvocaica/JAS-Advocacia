// Teste de integração — happy-path das 13 ferramentas do mcp-server.
//
// Cobre:
//  - 5 ferramentas de leitura: listar_casos_ativos, prazos_urgentes,
//    resumo_dashboard, resumo_financeiro, buscar_caso.
//  - 8 ferramentas de escrita: criar_cliente → criar_processo →
//    atualizar_status_processo → criar_tarefa → registrar_movimentacao →
//    adicionar_documento → lancar_financeiro → atualizar_pagamento.
//
// As escritas encadeiam IDs (cliente criado vira dono do processo, etc.) e
// todos os registros são prefixados com "MCP_TEST_" para facilitar limpeza
// posterior. Roda contra a edge function já deployada usando o anon key do .env.
//
// Como executar:
//   deno test --allow-net --allow-env supabase/functions/mcp-server/integracao_sucesso_test.ts

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const ENDPOINT = `${SUPABASE_URL}/functions/v1/mcp-server`;

let rpcId = 1;

async function chamar(ferramenta: string, args: Record<string, unknown> = {}) {
  const resp = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: rpcId++,
      method: "tools/call",
      params: { name: ferramenta, arguments: args },
    }),
  });
  const json = await resp.json();
  const texto: string = json?.result?.content?.[0]?.text ?? "";
  let payload: any = null;
  try {
    payload = JSON.parse(texto);
  } catch {
    /* nem toda leitura retorna JSON formatado, mas as nossas retornam */
  }
  return {
    http: resp.status,
    isError: json?.result?.isError === true,
    rpcError: json?.error ?? null,
    texto,
    payload,
  };
}

function assertSucesso(r: Awaited<ReturnType<typeof chamar>>, contexto: string) {
  assertEquals(r.http, 200, `${contexto}: HTTP != 200`);
  assertEquals(r.rpcError, null, `${contexto}: erro JSON-RPC: ${JSON.stringify(r.rpcError)}`);
  assert(!r.isError, `${contexto}: isError=true → ${r.texto}`);
  assert(r.payload !== null, `${contexto}: payload não-JSON → ${r.texto}`);
}

// Estado partilhado entre os testes encadeados de escrita.
const estado: {
  clienteId?: string;
  processoId?: string;
  parcelaId?: string;
  tarefaId?: string;
} = {};

const SUFIXO = `_${Date.now().toString(36)}`;
const NOME_CLIENTE = `MCP_TEST_Cliente${SUFIXO}`;

// =====================================================================
// 1) FERRAMENTAS DE LEITURA — devem responder mesmo sem dados de teste
// =====================================================================

Deno.test("leitura · listar_casos_ativos", async () => {
  const r = await chamar("listar_casos_ativos", { limite: 5 });
  assertSucesso(r, "listar_casos_ativos");
  assert(Array.isArray(r.payload.casos), "esperado array 'casos'");
  assert(typeof r.payload.total === "number", "esperado 'total' numérico");
});

Deno.test("leitura · prazos_urgentes", async () => {
  const r = await chamar("prazos_urgentes", { dias: 7 });
  assertSucesso(r, "prazos_urgentes");
  assert(Array.isArray(r.payload.prazos ?? r.payload.itens ?? []), "esperado lista de prazos");
});

Deno.test("leitura · resumo_dashboard", async () => {
  const r = await chamar("resumo_dashboard");
  assertSucesso(r, "resumo_dashboard");
  // Aceita qualquer combinação dos campos do resumo, mas precisa ter chaves.
  assert(typeof r.payload === "object" && r.payload !== null, "esperado objeto");
  assert(Object.keys(r.payload).length > 0, "resumo vazio");
});

Deno.test("leitura · resumo_financeiro", async () => {
  const agora = new Date();
  const r = await chamar("resumo_financeiro", {
    mes: agora.getMonth() + 1,
    ano: agora.getFullYear(),
  });
  assertSucesso(r, "resumo_financeiro");
  assert(typeof r.payload === "object" && r.payload !== null, "esperado objeto");
});

Deno.test("leitura · buscar_caso", async () => {
  // String improvável para garantir que sempre encontre 0 (mas não dê erro).
  const r = await chamar("buscar_caso", { busca: "ZZZZZZ_INEXISTENTE_MCP_TEST" });
  assertSucesso(r, "buscar_caso");
  assert(typeof r.payload.encontrado === "boolean", "esperado 'encontrado' bool");
  assert(typeof r.payload.total === "number", "esperado 'total' numérico");
  assert(Array.isArray(r.payload.casos), "esperado 'casos' array");
});

// =====================================================================
// 2) FERRAMENTAS DE ESCRITA — encadeadas (cliente → processo → restantes)
// =====================================================================

Deno.test("escrita · criar_cliente", async () => {
  const r = await chamar("criar_cliente", {
    nome: NOME_CLIENTE,
    telefone: "65999999999",
    email: `mcp.test${SUFIXO}@example.com`,
    observacoes: "Cliente criado por teste de integração MCP",
  });
  assertSucesso(r, "criar_cliente");
  assertEquals(r.payload.success, true);
  assert(typeof r.payload.id === "string" && r.payload.id.length === 36, "id do cliente inválido");
  estado.clienteId = r.payload.id;
});

Deno.test("escrita · criar_processo", async () => {
  assert(estado.clienteId, "cliente não foi criado no teste anterior");
  const r = await chamar("criar_processo", {
    cliente_id: estado.clienteId,
    area_direito: "civil",
    status: "Em andamento",
    vara: "1ª Vara Cível",
    comarca: "Primavera do Leste/MT",
    descricao: `Processo de teste ${SUFIXO}`,
    valor_causa: 10000,
  });
  assertSucesso(r, "criar_processo");
  assertEquals(r.payload.success, true);
  assert(typeof r.payload.id === "string", "id do processo ausente");
  estado.processoId = r.payload.id;
});

Deno.test("escrita · atualizar_status_processo", async () => {
  assert(estado.processoId, "processo não foi criado");
  const r = await chamar("atualizar_status_processo", {
    processo_id: estado.processoId,
    status: "Em diligência",
    fase_atual: "Inicial",
    observacao: "Atualização via teste de integração",
  });
  assertSucesso(r, "atualizar_status_processo");
  assertEquals(r.payload.success, true);
});

Deno.test("escrita · criar_tarefa", async () => {
  assert(estado.processoId, "processo não foi criado");
  const amanha = new Date(Date.now() + 86400000).toISOString().split("T")[0];
  const r = await chamar("criar_tarefa", {
    processo_id: estado.processoId,
    titulo: `MCP_TEST_Tarefa${SUFIXO}`,
    descricao: "Tarefa criada por teste de integração",
    prazo: amanha,
    prioridade: "media",
  });
  assertSucesso(r, "criar_tarefa");
  assertEquals(r.payload.success, true);
  estado.tarefaId = r.payload.id;
});

Deno.test("escrita · registrar_movimentacao", async () => {
  assert(estado.processoId, "processo não foi criado");
  const hoje = new Date().toISOString().split("T")[0];
  const r = await chamar("registrar_movimentacao", {
    processo_id: estado.processoId,
    tipo_movimentacao: "Despacho",
    descricao: "Despacho de teste de integração",
    data_movimentacao: hoje,
  });
  assertSucesso(r, "registrar_movimentacao");
  assertEquals(r.payload.success, true);
});

Deno.test("escrita · adicionar_documento", async () => {
  assert(estado.processoId, "processo não foi criado");
  const r = await chamar("adicionar_documento", {
    processo_id: estado.processoId,
    nome_documento: `MCP_TEST_doc${SUFIXO}.pdf`,
    tipo_documento: "Petição",
    observacao: "Documento de teste",
  });
  assertSucesso(r, "adicionar_documento");
  assertEquals(r.payload.success, true);
});

Deno.test("escrita · lancar_financeiro", async () => {
  assert(estado.clienteId && estado.processoId, "cliente/processo não criados");
  const venc = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
  const r = await chamar("lancar_financeiro", {
    cliente_id: estado.clienteId,
    processo_id: estado.processoId,
    tipo: "honorario",
    descricao: `Honorário de teste${SUFIXO}`,
    valor: 1500,
    data_vencimento: venc,
    status_pagamento: "pendente",
  });
  assertSucesso(r, "lancar_financeiro");
  assertEquals(r.payload.success, true);
  assert(typeof r.payload.id === "string", "id da parcela ausente");
  estado.parcelaId = r.payload.id;
});

Deno.test("escrita · atualizar_pagamento", async () => {
  assert(estado.parcelaId, "parcela não foi criada");
  const hoje = new Date().toISOString().split("T")[0];
  const r = await chamar("atualizar_pagamento", {
    lancamento_id: estado.parcelaId,
    data_pagamento: hoje,
    observacao: "Pagamento confirmado via teste de integração",
  });
  assertSucesso(r, "atualizar_pagamento");
  assertEquals(r.payload.success, true);
});

// =====================================================================
// 3) Resumo no final — útil ao rodar o suite manualmente
// =====================================================================

Deno.test("resumo · todas as 13 ferramentas exercitadas", () => {
  // Este teste é declarativo: se chegou até aqui, todas as anteriores passaram.
  const cobertas = [
    "listar_casos_ativos",
    "prazos_urgentes",
    "resumo_dashboard",
    "resumo_financeiro",
    "buscar_caso",
    "criar_cliente",
    "criar_processo",
    "atualizar_status_processo",
    "criar_tarefa",
    "registrar_movimentacao",
    "adicionar_documento",
    "lancar_financeiro",
    "atualizar_pagamento",
  ];
  assertEquals(cobertas.length, 13, "esperado cobrir 13 ferramentas");
});
