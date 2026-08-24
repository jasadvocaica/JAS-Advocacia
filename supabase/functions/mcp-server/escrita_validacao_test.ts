// Testes de integração — validação das 8 ferramentas de escrita
// Cobre: UUID inválido, campos ausentes, datas inválidas, enums inválidos.
// Executa contra a edge function já deployada usando credenciais do .env.

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const ENDPOINT = `${SUPABASE_URL}/functions/v1/mcp-server`;

let rpcId = 1;

async function chamar(ferramenta: string, args: Record<string, unknown>) {
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
  try { payload = JSON.parse(texto); } catch { /* erro não-JSON */ }
  return { http: resp.status, isError: json?.result?.isError === true, texto, payload };
}

function assertErroValidacao(r: any, campoEsperado?: string) {
  assertEquals(r.http, 200);
  assert(r.isError, `esperado isError=true, recebido: ${r.texto}`);
  assert(r.payload, `esperado payload JSON padronizado, recebido: ${r.texto}`);
  assertEquals(r.payload.success, false);
  assertEquals(r.payload.codigo, "VALIDACAO");
  if (campoEsperado) assertEquals(r.payload.campo, campoEsperado);
}

// ============ criar_cliente ============
Deno.test("criar_cliente: nome ausente", async () => {
  const r = await chamar("criar_cliente", {});
  assertErroValidacao(r, "nome");
});

Deno.test("criar_cliente: nome muito curto", async () => {
  const r = await chamar("criar_cliente", { nome: "A" });
  assertErroValidacao(r, "nome");
});

// ============ criar_processo ============
Deno.test("criar_processo: cliente_id ausente", async () => {
  const r = await chamar("criar_processo", { area_direito: "civil", status: "Em andamento" });
  assertErroValidacao(r, "cliente_id");
});

Deno.test("criar_processo: cliente_id UUID inválido", async () => {
  const r = await chamar("criar_processo", {
    cliente_id: "nao-uuid", area_direito: "civil", status: "Em andamento",
  });
  assertErroValidacao(r, "cliente_id");
});

Deno.test("criar_processo: area_direito ausente", async () => {
  const r = await chamar("criar_processo", {
    cliente_id: "00000000-0000-0000-0000-000000000000", status: "Em andamento",
  });
  assertErroValidacao(r, "area_direito");
});

// ============ atualizar_status_processo ============
Deno.test("atualizar_status_processo: processo_id ausente", async () => {
  const r = await chamar("atualizar_status_processo", { status: "Encerrado" });
  assertErroValidacao(r, "processo_id");
});

Deno.test("atualizar_status_processo: processo_id UUID inválido", async () => {
  const r = await chamar("atualizar_status_processo", { processo_id: "abc", status: "x" });
  assertErroValidacao(r, "processo_id");
});

// ============ criar_tarefa ============
Deno.test("criar_tarefa: titulo ausente", async () => {
  const r = await chamar("criar_tarefa", { processo_id: "00000000-0000-0000-0000-000000000000" });
  assertErroValidacao(r, "titulo");
});

Deno.test("criar_tarefa: prazo data inválida", async () => {
  const r = await chamar("criar_tarefa", {
    processo_id: "00000000-0000-0000-0000-000000000000",
    titulo: "Teste",
    prazo: "31/12/2025",
  });
  assertErroValidacao(r, "prazo");
});

Deno.test("criar_tarefa: prioridade enum inválido", async () => {
  const r = await chamar("criar_tarefa", {
    processo_id: "00000000-0000-0000-0000-000000000000",
    titulo: "Teste",
    prioridade: "altissima",
  });
  assertErroValidacao(r, "prioridade");
});

// ============ lancar_financeiro ============
Deno.test("lancar_financeiro: campos obrigatórios ausentes", async () => {
  const r = await chamar("lancar_financeiro", {});
  assertErroValidacao(r, "tipo");
});

Deno.test("lancar_financeiro: tipo enum inválido", async () => {
  const r = await chamar("lancar_financeiro", {
    tipo: "outra_coisa",
    descricao: "teste",
    valor: 100,
    data_vencimento: "2026-01-10",
    status_pagamento: "pendente",
  });
  assertErroValidacao(r, "tipo");
});

Deno.test("lancar_financeiro: data_vencimento inválida", async () => {
  const r = await chamar("lancar_financeiro", {
    tipo: "honorario",
    descricao: "teste",
    valor: 100,
    data_vencimento: "10-01-2026",
    status_pagamento: "pendente",
  });
  assertErroValidacao(r, "data_vencimento");
});

Deno.test("lancar_financeiro: cliente_id UUID inválido", async () => {
  const r = await chamar("lancar_financeiro", {
    cliente_id: "xxx",
    tipo: "honorario",
    descricao: "teste",
    valor: 100,
    data_vencimento: "2026-01-10",
    status_pagamento: "pendente",
  });
  assertErroValidacao(r, "cliente_id");
});

Deno.test("lancar_financeiro: status_pagamento enum inválido", async () => {
  const r = await chamar("lancar_financeiro", {
    cliente_id: "00000000-0000-0000-0000-000000000000",
    tipo: "honorario",
    descricao: "teste",
    valor: 100,
    data_vencimento: "2026-01-10",
    status_pagamento: "talvez",
  });
  assertErroValidacao(r, "status_pagamento");
});

// ============ atualizar_pagamento ============
Deno.test("atualizar_pagamento: lancamento_id ausente", async () => {
  const r = await chamar("atualizar_pagamento", { data_pagamento: "2026-01-10" });
  assertErroValidacao(r, "lancamento_id");
});

Deno.test("atualizar_pagamento: lancamento_id UUID inválido", async () => {
  const r = await chamar("atualizar_pagamento", { lancamento_id: "abc", data_pagamento: "2026-01-10" });
  assertErroValidacao(r, "lancamento_id");
});

Deno.test("atualizar_pagamento: data_pagamento inválida", async () => {
  const r = await chamar("atualizar_pagamento", {
    lancamento_id: "00000000-0000-0000-0000-000000000000",
    data_pagamento: "ontem",
  });
  assertErroValidacao(r, "data_pagamento");
});

// ============ adicionar_documento ============
Deno.test("adicionar_documento: campos obrigatórios ausentes", async () => {
  const r = await chamar("adicionar_documento", {});
  assertErroValidacao(r, "nome_documento");
});

Deno.test("adicionar_documento: processo_id UUID inválido", async () => {
  const r = await chamar("adicionar_documento", {
    processo_id: "nao-uuid",
    nome_documento: "doc.pdf",
    tipo_documento: "RG",
  });
  assertErroValidacao(r, "processo_id");
});

Deno.test("adicionar_documento: sem processo_id nem cliente_id", async () => {
  const r = await chamar("adicionar_documento", {
    nome_documento: "doc.pdf",
    tipo_documento: "RG",
  });
  assertErroValidacao(r, "processo_id");
});

// ============ registrar_movimentacao ============
Deno.test("registrar_movimentacao: processo_id ausente", async () => {
  const r = await chamar("registrar_movimentacao", {
    tipo_movimentacao: "Despacho",
    descricao: "Teste de movimentação",
    data_movimentacao: "2026-01-10",
  });
  assertErroValidacao(r, "processo_id");
});

Deno.test("registrar_movimentacao: processo_id UUID inválido", async () => {
  const r = await chamar("registrar_movimentacao", {
    processo_id: "abc",
    tipo_movimentacao: "Despacho",
    descricao: "Teste de movimentação",
    data_movimentacao: "2026-01-10",
  });
  assertErroValidacao(r, "processo_id");
});

Deno.test("registrar_movimentacao: data_movimentacao inválida", async () => {
  const r = await chamar("registrar_movimentacao", {
    processo_id: "00000000-0000-0000-0000-000000000000",
    tipo_movimentacao: "Despacho",
    descricao: "Teste de movimentação",
    data_movimentacao: "10/01/2026",
  });
  assertErroValidacao(r, "data_movimentacao");
});

Deno.test("registrar_movimentacao: prazo_resposta data inválida", async () => {
  const r = await chamar("registrar_movimentacao", {
    processo_id: "00000000-0000-0000-0000-000000000000",
    tipo_movimentacao: "Despacho",
    descricao: "Teste de movimentação",
    data_movimentacao: "2026-01-10",
    prazo_resposta: "amanha",
  });
  assertErroValidacao(r, "prazo_resposta");
});
