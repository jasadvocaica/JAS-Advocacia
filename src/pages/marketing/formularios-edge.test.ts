// Handler de produção com Supabase e rede simulados; nenhum segredo ou usuário real.
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { normalizarFormularios } from "../../../supabase/functions/_shared/marketing-formularios";
const fonte = readFileSync("supabase/functions/zernio/index.ts", "utf8").replace(/^import[\s\S]*?from ["'][^"']+["'];\s*/gm, "");
const js = ts.transpileModule(fonte, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
function preparar(admin = true, selecionada = true, reconectar = false) {
  let handler!: (r: Request) => Promise<Response>;
  const get = vi.fn().mockResolvedValue({ dados: { forms: [{ id: "f1", name: "Teste" }] } });
  const rpc = vi.fn(async (acao: string) => {
    if (acao === "is_gestor") return { data: admin };
    if (["is_interno_ativo", "has_permission"].includes(acao)) return { data: true };
    if (acao === "zernio_painel") return { data: { contas: [{ externo_id: "meta1", plataforma: "metaads", ativa: true, selecionada, precisa_reconectar: reconectar }] } };
    if (acao === "zernio_conexao") return { data: { chave_cifrada: "fixture" } };
    throw new Error("RPC inesperada");
  });
  new Function("Deno", "createClient", "criarCliente", "decifrar", "normalizarFormularios", "semSegredos", js)(
    { env: { get: () => "fixture" }, serve: (h: typeof handler) => { handler = h; } },
    () => ({ rpc, auth: { getUser: async () => ({ data: { user: { id: "usuario-ficticio" } } }) } }),
    () => ({ get }), async () => "fixture", normalizarFormularios, (v: string) => v,
  );
  return { get, rpc, chamar: (body: object) => handler(new Request("https://example.test/zernio", { method: "POST", headers: { Authorization: "Bearer fixture" }, body: JSON.stringify({ acao: "descobrir_formularios", ...body }) })) };
}
describe("descoberta autenticada de formulários", () => {
  it("consulta somente a conta escolhida e propaga cursor sem gravar", async () => {
    const h = preparar(); const r = await h.chamar({ conta_id: "meta1", cursor: "p2" });
    expect(r.status).toBe(200); expect(h.get).toHaveBeenCalledWith("/v1/ads/lead-forms", { accountId: "meta1", limit: 25, cursor: "p2" });
    expect(h.rpc.mock.calls.some(([a]) => a.includes("gravar") || a.includes("receber"))).toBe(false);
  });
  it.each([[false, true, false], [true, false, false], [true, true, true]])("bloqueia usuário/conta indisponível %s %s %s", async (admin, selecionada, reconectar) => {
    const h = preparar(admin, selecionada, reconectar); expect((await h.chamar({ conta_id: "meta1" })).status).toBe(403); expect(h.get).not.toHaveBeenCalled();
  });
  it("bloqueia conta arbitrária e cursor inválido antes da API", async () => {
    const h = preparar(); expect((await h.chamar({ conta_id: "outra" })).status).toBe(403);
    expect((await h.chamar({ conta_id: "meta1", cursor: {} })).status).toBe(400); expect(h.get).not.toHaveBeenCalled();
  });
});
