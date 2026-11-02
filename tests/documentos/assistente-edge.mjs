// Executa o handler real com Auth, banco e provedor simulados; nenhuma chamada externa.
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const source = (
  await readFile(
    new URL(
      "../../supabase/functions/documentos-assistente/index.ts",
      import.meta.url,
    ),
    "utf8",
  )
).replace(/import\s*\{\s*createClient\s*\}\s*from\s*"[^"]+";/, "");
const compilado=await build({stdin:{contents:source,loader:"ts",resolveDir:fileURLToPath(new URL("../../supabase/functions/documentos-assistente/",import.meta.url))},bundle:true,write:false,platform:"node",format:"cjs",target:"es2022"});
const code=compilado.outputFiles[0].text;

const ids = {
  user: "00000000-0000-4000-8000-000000000001",
  peca: "10000000-0000-4000-8000-000000000001",
  cliente: "20000000-0000-4000-8000-000000000001",
  processo: "30000000-0000-4000-8000-000000000001",
};
let handler,
  permitido = true,
  sessao = true,
  providerCalls = 0,
  providerStatus = 200,
  providerConfigured = true,
  anthropicConfigured = true,
  providerCode = null,
  providerFinish = "stop",
  enviado;
let fundamentos=[], inventarFonte=false;
const authOptions = [];
const client = {
  auth: {
    getUser: async () => ({
      data: { user: sessao ? { id: ids.user } : null },
      error: null,
    }),
  },
  rpc: async (nome,args) => nome === "jur_pesquisar" ? {data:args.p_ids?fundamentos.filter((f)=>args.p_ids.includes(f.id)):fundamentos,error:null} : { data: permitido, error: null },
  from(table) {
    const data =
      table === "doc_pecas"
        ? {
            id: ids.peca,
            cliente_id: ids.cliente,
            processo_id: ids.processo,
            status: "rascunho",
          }
        : table === "clientes"
          ? { id: ids.cliente, nome: "Cliente fictício" }
          : {
              id: ids.processo,
              cliente_id: ids.cliente,
              numero_cnj: "Processo fictício",
            };
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data, error: null }),
    };
    return query;
  },
};
const DenoMock = {
  env: {
    get: (name) => {
      if (name === "SUPABASE_SERVICE_ROLE_KEY")
        assert.fail("Nunca deve usar service_role");
      if (["OPENAI_MODEL", "ANTHROPIC_MODEL"].includes(name)) return undefined;
      if (name === "ANTHROPIC_API_KEY" && !anthropicConfigured)
        return undefined;
      if (name === "OPENAI_API_KEY" && !providerConfigured) return undefined;
      return name === "SUPABASE_ANON_KEY" ? "anon-fixture" : "fixture";
    },
  },
  serve: (fn) => {
    handler = fn;
  },
};
const fetchMock = async (url, options) => {
  if (url === "https://api.openai.com/v1/models/gpt-4.1") {
    assert.equal(options.headers.Authorization, "Bearer fixture");
    return new Response("{}", { status: providerStatus });
  }
  providerCalls++;
  enviado = JSON.parse(options.body);
  const anthropic = url === "https://api.anthropic.com/v1/messages";
  if (anthropic) {
    assert.equal(enviado.model, "claude-sonnet-4-6");
    assert.equal(enviado.max_tokens, 12000);
    assert.equal(options.headers["x-api-key"], "fixture");
    assert.equal(options.headers["anthropic-version"], "2023-06-01");
    assert.equal(options.headers.Authorization, undefined);
    return new Response(
      JSON.stringify({
        content: [
          {
            type: "text",
            text: JSON.stringify({ texto: "Sugestão Claude", pendencias: [] }),
          },
        ],
        stop_reason: providerFinish === "length" ? "max_tokens" : "end_turn",
      }),
      { status: providerStatus },
    );
  }
  assert.equal(url, "https://api.openai.com/v1/chat/completions");
  assert.equal(enviado.model, "gpt-4.1");
  assert.equal(enviado.max_completion_tokens, 12000);
  assert.equal(options.headers.Authorization, "Bearer fixture");
  return new Response(
    JSON.stringify({
      error: providerCode ? { code: providerCode } : undefined,
      choices: [
        {
          finish_reason: providerFinish,
          message: {
            content: JSON.stringify({
              fontes_utilizadas: inventarFonte?["L99"]:fundamentos.length?["L1"]:[],
              texto: "Sugestão para revisão",
              pendencias: ["Conferir documentos"],
            }),
          },
        },
      ],
    }),
    { status: providerStatus },
  );
};
new Function("createClient", "Deno", "fetch", code)(
  (...args) => {
    authOptions.push(args);
    return client;
  },
  DenoMock,
  fetchMock,
);
const body = {
  peca_id: ids.peca,
  cliente_id: ids.cliente,
  processo_id: ids.processo,
  acao: "minuta",
  instrucao: "Manifestar sobre laudo",
  titulo: "Manifestação",
  conteudo: "Texto atual",
  contexto: {
    documentos: "Trecho do laudo",
    fontes: [],
    ultima_ia: { texto: "NÃO USAR COMO PROVA" },
  },
};
const call = (payload = body, token = true) =>
  handler(
    new Request("http://localhost/documentos-assistente", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer token-fixture" } : {}),
      },
      body: JSON.stringify(payload),
    }),
  );

const health = await handler(
  new Request("http://localhost/documentos-assistente"),
);
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), {
  status: "ok",
  ia_configurada: true,
  provedores: { openai: true, anthropic: true },
});
const conexao = await handler(
  new Request("http://localhost/documentos-assistente?verificar=openai"),
);
assert.equal(conexao.status, 200);
assert.equal((await conexao.json()).conexao.valida, true);
providerConfigured = false;
anthropicConfigured = false;
assert.equal(
  (await handler(new Request("http://localhost/documentos-assistente"))).status,
  503,
);
providerConfigured = true;
anthropicConfigured = true;

assert.equal((await call(body, false)).status, 401);
sessao = false;
assert.equal((await call()).status, 401);
sessao = true;
permitido = false;
assert.equal((await call()).status, 403);
permitido = true;
assert.equal((await call({ ...body, cliente_id: ids.processo })).status, 409);
assert.equal((await call({ ...body, acao: "protocolar" })).status, 400);
assert.equal(
  providerCalls,
  0,
  "pedidos não autorizados não podem chegar ao provedor",
);
const sucesso = await call();
assert.equal(sucesso.status, 200);
const jsonSucesso=await sucesso.json();
assert.deepEqual({provedor:jsonSucesso.provedor,modelo:jsonSucesso.modelo,texto:jsonSucesso.texto,pendencias:jsonSucesso.pendencias}, {
  provedor: "openai",
  modelo: "gpt-4.1",
  texto: "Sugestão para revisão",
  pendencias: ["Conferir documentos"],
});
assert.ok(
  authOptions.every(
    (args) =>
      args[1] === "anon-fixture" &&
      args[2].global.headers.Authorization === "Bearer token-fixture",
  ),
);
assert.ok(!JSON.stringify(enviado).includes("NÃO USAR COMO PROVA"));
fundamentos=[{id:"b".repeat(64),norma_id:"lei-teste",titulo:"Lei de teste",artigo:"Art. 20",trecho:"TEXTO ORIGINAL RECUPERADO DO BANCO",fonte_oficial:"https://www.planalto.gov.br/lei",fonte_repositorio:"https://github.com/ctresb/leis/blob/"+"a".repeat(40)+"/lei.md",versao_sha:"c".repeat(64),commit:"a".repeat(40),versao_texto:"compilada",capturado_em:"2026-10-13",importado_em:"2026-11-02T12:00:00Z",notas:""}];
const fundamentada=await call({...body,contexto:{...body.contexto,fontes:[{origem:"biblioteca",dispositivo_id:fundamentos[0].id,trecho:"TEXTO FORJADO PELO CLIENTE"}]}});
assert.equal(fundamentada.status,200);
const pacote=await fundamentada.json();assert.equal(pacote.fontes_utilizadas[0].id,fundamentos[0].id);
assert.ok(JSON.stringify(enviado).includes("TEXTO ORIGINAL RECUPERADO DO BANCO"));
assert.ok(!JSON.stringify(enviado).includes("TEXTO FORJADO PELO CLIENTE"));
inventarFonte=true;assert.equal((await call()).status,502);inventarFonte=false;fundamentos=[];
const claude = await call({ ...body, provedor: "anthropic" });
assert.equal(claude.status, 200);
const jsonClaude=await claude.json();
assert.deepEqual({provedor:jsonClaude.provedor,modelo:jsonClaude.modelo,texto:jsonClaude.texto,pendencias:jsonClaude.pendencias}, {
  provedor: "anthropic",
  modelo: "claude-sonnet-4-6",
  texto: "Sugestão Claude",
  pendencias: [],
});
anthropicConfigured = false;
const chamadasAntes = providerCalls;
assert.equal((await call({ ...body, provedor: "anthropic" })).status, 503);
assert.equal(providerCalls, chamadasAntes);
anthropicConfigured = true;
assert.equal((await call({ ...body, provedor: "desconhecido" })).status, 400);
providerStatus = 429;
assert.equal((await call()).status, 429);
providerCode = "insufficient_quota";
assert.equal((await call()).status, 402);
providerCode = null;
providerStatus = 401;
assert.equal((await call()).status, 503);
providerStatus = 200;
providerFinish = "length";
assert.equal((await call()).status, 502);
console.log(
  "PASS: autenticação, permissão, isolamento do caso, contexto sob RLS, resposta da IA e falhas do provedor.",
);
