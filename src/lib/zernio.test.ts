// Testes automatizados com respostas simuladas da API. Eles NÃO comprovam conexão real com o Zernio.
import { describe, expect, it, vi } from "vitest";
import { chaveValida, cifrar, criarCliente, decifrar, ErroZernio, mapComentarios, mascarar, semSegredos } from "../../supabase/functions/_shared/zernio";
import { janela, sincronizar, type Armazem, type EstadoJob } from "../../supabase/functions/_shared/zernio-sync";
import { ferramentasParaIA, validarParametros } from "../../supabase/functions/_shared/motor";

const CHAVE = `sk_${"a1".repeat(32)}`;
const resposta = (status: number, corpo: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json", ...headers } });
const semEspera = async (_ms?: number) => {};

describe("credencial", () => {
  it("aceita só o formato documentado e mascara", () => {
    expect(chaveValida(CHAVE)).toBe(true);
    expect(chaveValida("sk_123")).toBe(false);
    expect(chaveValida("pk_" + "a".repeat(64))).toBe(false);
    expect(mascarar(CHAVE)).toBe("sk_a1a1…a1a1");
    expect(mascarar(CHAVE)).not.toContain(CHAVE.slice(7, 60));
  });

  it("cifra com AES-GCM e só decifra com o segredo do servidor", async () => {
    const c = await cifrar(CHAVE, "segredo-do-servidor-123");
    expect(c.startsWith("v1.")).toBe(true);
    expect(c).not.toContain(CHAVE);
    expect(await decifrar(c, "segredo-do-servidor-123")).toBe(CHAVE);
    await expect(decifrar(c, "outro-segredo-qualquer-456")).rejects.toThrow();
  });

  it("tira a chave de mensagens de log", () => {
    expect(semSegredos(`falhou com ${CHAVE} e Bearer ${CHAVE}`)).not.toContain("a1a1a1a1a1");
  });
});

describe("cliente da API", () => {
  it("envia Bearer e lê a resposta", async () => {
    const fetcher = vi.fn().mockResolvedValue(resposta(200, { accounts: [] }));
    const api = criarCliente({ chave: CHAVE, fetcher, esperar: semEspera });
    await api.get("/v1/accounts", { limit: 100, cursor: undefined });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://zernio.com/api/v1/accounts?limit=100");
    expect(init.headers.Authorization).toBe(`Bearer ${CHAVE}`);
  });

  it("chave inválida ou expirada vira erro de autenticação, sem repetir", async () => {
    const fetcher = vi.fn().mockResolvedValue(resposta(401, { error: "Invalid", code: "invalid_credentials" }));
    const api = criarCliente({ chave: CHAVE, fetcher, esperar: semEspera });
    await expect(api.get("/v1/accounts")).rejects.toMatchObject({ tipo: "autenticacao", status: 401 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("respeita Retry-After no 429 e tenta de novo", async () => {
    const esperar = vi.fn(semEspera);
    const fetcher = vi.fn()
      .mockResolvedValueOnce(resposta(429, { error: "Rate limit exceeded", details: { retryAfterSeconds: 12 } }, { "retry-after": "12" }))
      .mockResolvedValueOnce(resposta(200, { ok: true }));
    const api = criarCliente({ chave: CHAVE, fetcher, esperar });
    await api.get("/v1/analytics");
    expect(esperar).toHaveBeenCalledWith(12000);
  });

  it("limite longo não segura o worker: devolve erro para adiar o job", async () => {
    const fetcher = vi.fn().mockResolvedValue(resposta(429, { error: "Rate limit" }, { "retry-after": "120" }));
    const api = criarCliente({ chave: CHAVE, fetcher, esperar: semEspera });
    await expect(api.get("/v1/analytics")).rejects.toMatchObject({ tipo: "limite", esperarSegundos: 120 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("falha transitória: até 3 tentativas com espera crescente", async () => {
    const esperar = vi.fn(semEspera);
    const fetcher = vi.fn().mockImplementation(async () => resposta(503, { error: "unavailable" }));
    const api = criarCliente({ chave: CHAVE, fetcher, esperar });
    await expect(api.get("/v1/accounts")).rejects.toMatchObject({ tipo: "transitorio" });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(esperar.mock.calls.map((c) => c[0])).toEqual([1000, 2000]);
  });

  it("recurso fora do plano vira 'addon'", async () => {
    const fetcher = vi.fn().mockResolvedValue(resposta(403, { error: "Inbox addon required" }));
    const api = criarCliente({ chave: CHAVE, fetcher, esperar: semEspera });
    await expect(api.get("/v1/inbox/conversations")).rejects.toMatchObject({ tipo: "addon" });
  });

  it("POST leva Idempotency-Key", async () => {
    const fetcher = vi.fn().mockResolvedValue(resposta(200, { success: true, data: { commentId: "r1" } }));
    const api = criarCliente({ chave: CHAVE, fetcher, esperar: semEspera });
    await api.post("/v1/inbox/comments/p1", { accountId: "a1", message: "Olá", commentId: "c1" }, "aprovacao-1");
    expect(fetcher.mock.calls[0][1].headers["Idempotency-Key"]).toBe("aprovacao-1");
  });

  it("achata respostas aninhadas de comentários", () => {
    const linhas = mapComentarios("p1", "a1", [{ id: "c1", platform: "instagram", message: "Oi", from: { username: "ana" },
      replies: [{ id: "c2", platform: "instagram", message: "Olá!", from: { username: "jas", isOwner: true } }] }]);
    expect(linhas.map((l) => [l.externo_id, l.pai_externo_id, l.do_escritorio])).toEqual([["instagram:c1", null, false], ["instagram:c2", "c1", true]]);
  });
});

// ------------------------------------------------------------------ sincronização com API e banco simulados
function cenario(rotas: Record<string, (p: URLSearchParams) => Response | Promise<Response>>) {
  const chamadas: string[] = [];
  const fetcher = vi.fn(async (u: string) => {
    const url = new URL(u);
    chamadas.push(url.pathname + url.search);
    const rota = Object.keys(rotas).find((r) => url.pathname === `/api${r}`);
    return rota ? rotas[rota](url.searchParams) : resposta(404, { error: "not found" });
  });
  const gravado: Record<string, Record<string, unknown>[]> = {};
  const armazem: Armazem = {
    gravar: async (recurso, linhas) => { gravado[recurso] = [...(gravado[recurso] ?? []), ...linhas]; return linhas.length; },
    salvarProgresso: async () => {},
    log: async () => {},
    contasSelecionadas: async () => [{ externo_id: "ig1", plataforma: "instagram" }, { externo_id: "ads1", plataforma: "metaads" }],
    marcarAddon: async () => {},
  };
  return { api: criarCliente({ chave: CHAVE, fetcher, esperar: semEspera }), armazem, gravado, chamadas };
}
const novoJob = (): EstadoJob => ({ id: "j1", etapa_atual: null, cursores: {}, progresso: {} });
const vazio = () => resposta(200, {});
const basico = {
  "/v1/accounts": (p: URLSearchParams) => p.get("cursor") === "c2"
    ? resposta(200, { accounts: [{ _id: "ads1", platform: "metaads", isActive: true }], pagination: { nextCursor: null } })
    : resposta(200, { accounts: [{ _id: "ig1", platform: "instagram", isActive: true }], hasAnalyticsAccess: true, pagination: { nextCursor: "c2" } }),
  "/v1/analytics": () => resposta(200, { posts: [{ _id: "p1", content: "Post", analytics: { reach: 10 } }], pagination: { pages: 1 } }),
  "/v1/inbox/comments": () => resposta(200, { data: [], pagination: { hasMore: false } }),
  "/v1/inbox/conversations": () => resposta(200, { data: [], pagination: { hasMore: false } }),
  "/v1/ads/campaigns": () => resposta(200, { campaigns: [{ platformCampaignId: "cp1", campaignName: "BPC" }], pagination: { pages: 1 } }),
  "/v1/ads/ad-sets": () => resposta(200, { adSets: [], pagination: { pages: 1 } }),
  "/v1/ads": () => resposta(200, { ads: [], pagination: { pages: 1 } }),
  "/v1/ads/timeline": () => resposta(200, { rows: [{ date: "2026-11-01", currency: "BRL", spend: 20 }] }),
};

describe("sincronização", () => {
  it("percorre todas as páginas (cursor) e todas as etapas", async () => {
    const s = cenario(basico);
    const r = await sincronizar({ api: s.api, armazem: s.armazem, job: novoJob(), ultimoOk: null, prazoMs: 60000 });
    expect(r.estado).toBe("concluido");
    expect(s.gravado.contas.map((c) => c.externo_id)).toEqual(["ig1", "ads1"]);
    expect(s.gravado.campanhas[0].externo_id).toBe("cp1");
    expect(s.gravado.anuncios_diario[0]).toMatchObject({ referencia: "ads1", gasto: 20, moeda: "BRL" });
  });

  it("incremental: depois da primeira vez, busca só desde a última sincronização (com 7 dias de folga)", () => {
    const agora = new Date("2026-11-01T12:00:00Z");
    expect(janela(null, agora)).toEqual({ de: "2026-08-03", ate: "2026-11-01" });
    expect(janela("2026-10-30T12:00:00Z", agora)).toEqual({ de: "2026-10-23", ate: "2026-11-01" });
  });

  it("recupera depois de interrupção: retoma do cursor salvo, sem repetir páginas", async () => {
    const s = cenario(basico);
    const job = novoJob();
    let relogio = 0;
    const r1 = await sincronizar({ api: s.api, armazem: s.armazem, job, ultimoOk: null, prazoMs: 1, agora: () => (relogio += 1) });
    expect(r1.estado).toBe("continua");
    const feitas = s.chamadas.length;
    const r2 = await sincronizar({ api: s.api, armazem: s.armazem, job, ultimoOk: null, prazoMs: 60000 });
    expect(r2.estado).toBe("concluido");
    expect(s.chamadas.slice(feitas).filter((c) => c === "/v1/accounts?limit=100").length).toBe(0);
  });

  it("recurso fora do plano não derruba a sincronização", async () => {
    const s = cenario({ ...basico, "/v1/inbox/comments": () => resposta(403, { error: "Inbox addon required" }),
      "/v1/inbox/conversations": () => resposta(403, { error: "Inbox addon required" }) });
    const r = await sincronizar({ api: s.api, armazem: s.armazem, job: novoJob(), ultimoOk: null, prazoMs: 60000 });
    expect(r.estado).toBe("concluido");
    expect(r.indisponiveis).toEqual(["comentarios", "conversas"]);
  });

  it("falha parcial: uma etapa falha, as outras seguem", async () => {
    const s = cenario({ ...basico, "/v1/ads/campaigns": () => resposta(400, { error: "bad" }) });
    const r = await sincronizar({ api: s.api, armazem: s.armazem, job: novoJob(), ultimoOk: null, prazoMs: 60000 });
    expect(r.estado).toBe("parcial");
    expect(r.falhas).toEqual(["campanhas"]);
    expect(s.gravado.anuncios_diario).toHaveLength(1);
  });

  it("chave recusada no meio interrompe tudo", async () => {
    const s = cenario({ ...basico, "/v1/analytics": () => resposta(401, { error: "Invalid", code: "invalid_credentials" }) });
    await expect(sincronizar({ api: s.api, armazem: s.armazem, job: novoJob(), ultimoOk: null, prazoMs: 60000 }))
      .rejects.toBeInstanceOf(ErroZernio);
  });

  it("não chama endpoint fora da lista documentada", async () => {
    const s = cenario(basico);
    await sincronizar({ api: s.api, armazem: s.armazem, job: novoJob(), ultimoOk: null, prazoMs: 60000 });
    const caminhos = new Set(s.chamadas.map((c) => c.split("?")[0]));
    expect([...caminhos].every((c) => Object.keys(basico).some((r) => c === `/api${r}`) || c.startsWith("/api/v1/inbox/comments/"))).toBe(true);
    void vazio;
  });
});

describe("ferramentas dos agentes", () => {
  it("expõe as consultas do Zernio e valida o período", () => {
    expect(ferramentasParaIA(["zernio_indicadores", "zernio_saude"]).map((f) => f.name)).toEqual(["zernio_indicadores", "zernio_saude"]);
    expect(validarParametros("zernio_publicacoes", { dias: 9999 })).toEqual({ dias: 365 });
    expect(validarParametros("zernio_publicacoes", {})).toEqual({ dias: 30 });
  });
  it("resposta a comentário exige texto e id, e é ação sensível", () => {
    expect(() => validarParametros("zernio_responder_comentario", { comentario_id: "x", mensagem: "" })).toThrow();
    expect(validarParametros("zernio_responder_comentario", { comentario_id: "instagram:c1", mensagem: " Olá! " }))
      .toEqual({ comentario_id: "instagram:c1", mensagem: "Olá!" });
  });
});
