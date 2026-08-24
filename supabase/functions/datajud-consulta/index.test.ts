// Testes automatizados para a edge function `datajud-consulta`.
//
// Cobertura:
//  1. Formato exato do header Authorization ("APIKey <chave>" sem espaços extras).
//  2. consultarProcesso usa o header correto e devolve o _source quando há hit.
//  3. Quando a API responde 401, lança erro contendo o status (sinaliza chave inválida).
//  4. Smoke E2E: a função deployada retorna 200 para o caminho "processo_unico"
//     com a chave válida (somente roda se SUPABASE_URL/ANON_KEY/USER_JWT/PROCESSO_ID
//     estiverem disponíveis no ambiente).

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import {
  assert,
  assertEquals,
  assertMatch,
  assertRejects,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { buildDataJudAuthHeader, consultarProcesso } from "./index.ts";

// ---------- 1. Formato do header ----------

Deno.test("buildDataJudAuthHeader: prefixo 'APIKey' + 1 espaço + chave", () => {
  const h = buildDataJudAuthHeader("abc123");
  assertEquals(h, "APIKey abc123");
  // Regex estrita: começa com APIKey, exatamente um espaço, depois a chave sem
  // espaços nem aspas/quebras de linha extras.
  assertMatch(h, /^APIKey [^\s"'`]+$/);
});

Deno.test("buildDataJudAuthHeader: não adiciona espaços/caracteres extras", () => {
  const key = "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==";
  const h = buildDataJudAuthHeader(key);
  assertEquals(h, `APIKey ${key}`);
  // Sem 'Bearer', sem aspas, sem espaços no fim/início.
  assertEquals(h.startsWith("APIKey "), true);
  assertEquals(h.includes("Bearer"), false);
  assertEquals(h.trim(), h);
  // Apenas 1 espaço entre prefixo e chave
  assertEquals(h.split(" ").length, 2);
});

// ---------- 2/3. consultarProcesso usa o header certo ----------

function withMockedFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
  fn: () => Promise<void>,
) {
  const original = globalThis.fetch;
  globalThis.fetch = async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input.url;
    return await handler(url, init);
  };
  return fn().finally(() => {
    globalThis.fetch = original;
  });
}

Deno.test("consultarProcesso envia Authorization no formato 'APIKey <chave>'", async () => {
  const apiKey = "minha-chave-de-teste";
  let capturado: Record<string, string> = {};

  await withMockedFetch(
    (url, init) => {
      assertStringIncludes(url, "/api_publica_tjsp/_search");
      const headers = new Headers(init?.headers as HeadersInit);
      capturado = {
        authorization: headers.get("Authorization") ?? "",
        contentType: headers.get("Content-Type") ?? "",
      };
      return new Response(
        JSON.stringify({
          hits: { hits: [{ _source: { numeroProcesso: "123", movimentos: [] } }] },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
    async () => {
      const out = await consultarProcesso("12345678901234567890", "TJSP", apiKey);
      assertEquals(capturado.authorization, `APIKey ${apiKey}`);
      assertEquals(capturado.contentType, "application/json");
      assert(out, "Esperava receber o _source do hit");
      assertEquals((out as any).numeroProcesso, "123");
    },
  );
});

Deno.test("consultarProcesso lança erro com status quando DataJud responde 401", async () => {
  await withMockedFetch(
    () => new Response("unauthorized", { status: 401 }),
    async () => {
      await assertRejects(
        () => consultarProcesso("12345678901234567890", "TJSP", "chave-invalida"),
        Error,
        "DataJud 401",
      );
    },
  );
});

Deno.test("consultarProcesso retorna null quando não há hits", async () => {
  await withMockedFetch(
    () =>
      new Response(JSON.stringify({ hits: { hits: [] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    async () => {
      const out = await consultarProcesso("99999999999999999999", "TJSP", "qualquer");
      assertEquals(out, null);
    },
  );
});

// ---------- 4. Smoke E2E (opcional) ----------
//
// Só roda se TODAS as variáveis estiverem presentes. Em CI sem segredos é ignorado
// silenciosamente para não falhar o pipeline.

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ??
  Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? "";
const USER_JWT = Deno.env.get("DATAJUD_TEST_USER_JWT") ?? "";
const PROCESSO_ID = Deno.env.get("DATAJUD_TEST_PROCESSO_ID") ?? "";

const e2eHabilitado = !!(SUPABASE_URL && SUPABASE_ANON_KEY && USER_JWT && PROCESSO_ID);

Deno.test({
  name:
    "E2E: datajud-consulta retorna 200 com chave válida (set DATAJUD_TEST_USER_JWT + DATAJUD_TEST_PROCESSO_ID)",
  ignore: !e2eHabilitado,
  async fn() {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/datajud-consulta`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${USER_JWT}`,
      },
      body: JSON.stringify({ modo: "processo_unico", processo_id: PROCESSO_ID }),
    });
    const body = await res.json();
    assertEquals(res.status, 200, `Esperava 200, recebi ${res.status}: ${JSON.stringify(body)}`);
    assertEquals(body.ok, true);
  },
});
