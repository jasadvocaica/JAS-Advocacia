// Executa o handler real em sandbox de teste, com cliente Supabase simulado. Nenhuma rede.
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, it, expect, vi } from "vitest";
import {
  assinaturaValida,
  normalizarLead,
} from "../../../supabase/functions/_shared/marketing-leads";
const fonte = readFileSync(
  "supabase/functions/marketing-leads/index.ts",
  "utf8",
).replace(/^import[\s\S]*?from ["'][^"']+["'];\s*/gm, "");
const js = ts.transpileModule(fonte, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.None,
  },
}).outputText;
async function assinatura(raw: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("segredo-de-teste"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return [
    ...new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
function handler(habilitado = true) {
  let callback!: (r: Request) => Promise<Response>;
  const rpc = vi.fn().mockResolvedValue({ data: "lead-simulado", error: null });
  const env: Record<string, string> = {
    MARKETING_LEADS_HABILITADO: habilitado ? "true" : "false",
    ZERNIO_WEBHOOK_SECRET: "segredo-de-teste",
    MARKETING_LEADS_SOMENTE_TESTE: "true",
    SUPABASE_URL: "https://example.test",
    SUPABASE_SERVICE_ROLE_KEY: "ficticio",
  };
  new Function(
    "Deno",
    "createClient",
    "assinaturaValida",
    "normalizarLead",
    js,
  )(
    {
      env: { get: (k: string) => env[k] },
      serve: (f: typeof callback) => (callback = f),
    },
    () => ({ rpc }),
    assinaturaValida,
    normalizarLead,
  );
  return { callback, rpc };
}
const evento = {
  id: "evt-sim",
  event: "lead.received",
  account: { accountId: "conta-sim" },
  lead: {
    leadgenId: "meta-sim",
    formId: "form-sim",
    fields: {
      full_name: "Pessoa fictícia",
      email: "contato@example.test",
      laudo: "Nunca persistir",
    },
    createdAt: "2026-11-07T12:00:00Z",
  },
};
async function req(body: unknown = evento) {
  const raw = JSON.stringify(body);
  return new Request("https://example.test", {
    method: "POST",
    body: raw,
    headers: {
      "X-Zernio-Signature": await assinatura(raw),
      "X-Zernio-Event-Id": evento.id,
    },
  });
}
describe("Receptor real com dependências simuladas", () => {
  it("nasce desativado e não grava", async () => {
    const h = handler(false);
    expect((await h.callback(await req())).status).toBe(503);
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("assinatura inválida não chega ao banco", async () => {
    const h = handler();
    const r = new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify(evento),
      headers: { "X-Zernio-Signature": "0".repeat(64) },
    });
    expect((await h.callback(r)).status).toBe(401);
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("entrega assinada passa contato mínimo à função atômica", async () => {
    const h = handler();
    expect((await h.callback(await req())).status).toBe(200);
    expect(h.rpc).toHaveBeenCalledWith("mkt_receber_lead", {
      _dados: expect.objectContaining({
        externo_id: "meta-sim",
        conta_id: "conta-sim",
        teste: true,
      }),
    });
    expect(JSON.stringify(h.rpc.mock.calls)).not.toContain("laudo");
  });
  it("nega conta não homologada e falha transitória permanece falha", async () => {
    const h = handler();
    h.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    expect((await h.callback(await req())).status).toBe(403);
    h.rpc.mockResolvedValue({ data: null, error: { code: "503" } });
    expect((await h.callback(await req())).status).toBe(503);
  });
  it("recusa payload inválido e limite de tamanho", async () => {
    const h = handler();
    expect((await h.callback(await req({ ...evento, lead: {} }))).status).toBe(
      400,
    );
    expect(
      (
        await h.callback(
          new Request("https://example.test", {
            method: "POST",
            body: "x".repeat(64001),
          }),
        )
      ).status,
    ).toBe(413);
    expect(h.rpc).not.toHaveBeenCalled();
  });
});
