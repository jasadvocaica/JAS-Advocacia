import { describe, it, expect } from "vitest";
import {
  chaveResultados,
  indicadores,
  situacaoFonte,
  somarAds,
  numero,
} from "./resultados";
import {
  normalizarLead,
  assinaturaValida,
  reconciliarPagina,
} from "../../../supabase/functions/_shared/marketing-leads";
const linha = {
  nivel: "conta",
  referencia: "a1",
  data: "2026-11-01",
  moeda: "BRL",
  gasto: 10,
  impressoes: 20,
  cliques: 0,
  conversoes: null,
};
describe("Indicadores e cache", () => {
  it("separa moeda e ignora anúncios duplicando conta", () => {
    expect(
      somarAds([
        linha,
        { ...linha, nivel: "anuncio" },
        { ...linha, moeda: "USD", gasto: 2 },
      ]),
    ).toEqual([
      { moeda: "BRL", gasto: 10, impressoes: 20, cliques: 0, resultados: null },
      { moeda: "USD", gasto: 2, impressoes: 20, cliques: 0, resultados: null },
    ]);
  });
  it("não soma NULL como zero nem mistura conta", () => {
    expect(
      somarAds([linha, { ...linha, gasto: null }], "a1")[0].gasto,
    ).toBeNull();
    expect(somarAds([linha], "a2")).toEqual([]);
    expect(numero(0)).toBe("0 (confirmado)");
    expect(numero(null)).toBe("Indisponível");
  });
  it("chave inclui conta, período, campanha, canal, ambiente e usuário", () => {
    const f = {
      de: "2026-11-01",
      ate: "2026-11-07",
      conta: "a1",
      campanha: "c1",
      canal: "meta_ads",
      teste: false,
    };
    for (const patch of [
      { conta: "a2" },
      { de: "2026-10-01" },
      { ate: "2026-11-06" },
      { campanha: "c2" },
      { canal: "outro" },
      { teste: true },
    ])
      expect(chaveResultados("u", { ...f, ...patch })).not.toEqual(
        chaveResultados("u", f),
      );
    expect(chaveResultados("x", f)).not.toEqual(chaveResultados("u", f));
  });
  it("só calcula custos com atribuição compatível", () => {
    expect(indicadores(100, 10, 2, false)).toEqual({
      cpl: null,
      cpa: null,
      conversao: 0.2,
    });
    expect(indicadores(100, 10, 2, true)).toEqual({
      cpl: 10,
      cpa: 50,
      conversao: 0.2,
    });
    expect(indicadores(0, 0, 0, true)).toEqual({
      cpl: null,
      cpa: null,
      conversao: null,
    });
  });
  it("distingue estados da fonte", () => {
    const c = {
      estado: "conectado",
      ultima_sync_ok_em: "2026-11-01",
      addon_ads: true,
    };
    expect(situacaoFonte(c, false, 0)).toContain("Nenhum registro");
    expect(situacaoFonte(c, true, 0)).toContain("andamento");
    expect(situacaoFonte({ ...c, estado: "revogada" }, false, 1)).toContain(
      "desconectada",
    );
    expect(situacaoFonte({ ...c, addon_ads: false }, false, 0)).toContain(
      "Sem permissão",
    );
    expect(
      situacaoFonte({ ...c, ultima_sync_ok_em: null }, false, 0),
    ).toContain("indisponível");
  });
});
const evento = {
  id: "e1",
  event: "lead.received",
  account: { accountId: "a1" },
  lead: {
    leadgenId: "l1",
    formId: "f1",
    fields: {
      full_name: "Pessoa fictícia",
      email: "teste@example.test",
      diagnostico: "não armazenar",
    },
    createdAt: "2026-11-01T12:00:00Z",
  },
};
describe("Ingestão Meta simulada", () => {
  it("normaliza só contato mínimo e proveniência", () => {
    const n = normalizarLead(evento, "e1", true);
    expect(n).toMatchObject({
      evento_id: "e1",
      externo_id: "l1",
      nome: "Pessoa fictícia",
      teste: true,
    });
    expect(JSON.stringify(n)).not.toContain("diagnostico");
  });
  it("recusa evento, identidade e data inválidos", () => {
    expect(() =>
      normalizarLead({ ...evento, event: "comment.received" }),
    ).toThrow();
    expect(() => normalizarLead(evento, "outro")).toThrow();
    expect(() =>
      normalizarLead({
        ...evento,
        lead: { ...evento.lead, createdAt: "inválida" },
      }),
    ).toThrow();
  });
  it("valida HMAC do corpo bruto e recusa adulteração", async () => {
    const raw = JSON.stringify(evento);
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode("segredo-ficticio"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = [
      ...new Uint8Array(
        await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)),
      ),
    ]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    expect(await assinaturaValida(raw, sig, "segredo-ficticio")).toBe(true);
    expect(await assinaturaValida(raw + " ", sig, "segredo-ficticio")).toBe(
      false,
    );
    expect(await assinaturaValida(raw, null, "segredo-ficticio")).toBe(false);
  });
});

describe("Reconciliação paginada simulada", () => {
  it("grava antes de devolver o cursor e permite repetir a página", async () => {
    const gravados: string[] = [];
    const pagina = {
      leads: [evento.lead],
      pagination: { hasMore: true, cursor: "proxima" },
    };
    const r = await reconciliarPagina(
      "a1",
      "f1",
      true,
      undefined,
      async (params) => {
        expect(params.limit).toBe(50);
        return pagina;
      },
      async (n) => {
        gravados.push(n.externo_id);
      },
    );
    expect(r).toEqual({ processados: 1, cursor: "proxima", hasMore: true });
    expect(gravados).toEqual(["l1"]);
  });
  it("normaliza o contrato real id/createdTime da leitura de formulário", async () => {
    const gravados: Record<string, unknown>[] = [];
    await reconciliarPagina("a1", "f1", true, undefined,
      async () => ({ leads: [{ id: "lead-meta-real", formId: "f1", createdTime: "2026-11-07T12:00:00Z", fields: { full_name: "Contato fictício", phone_number: "+12025550199", laudo: "não persistir" }, campaignId: "campanha-x", adsetId: "conjunto-x", adId: "anuncio-x" }] }),
      async dados => { gravados.push(dados); });
    expect(gravados[0]).toMatchObject({ externo_id: "lead-meta-real", evento_id: "reconciliacao:a1:lead-meta-real", adquirido_em: "2026-11-07T12:00:00.000Z", formulario_id: "f1", teste: true, campanha_externa_id: "campanha-x", conjunto_externo_id: "conjunto-x", anuncio_externo_id: "anuncio-x" });
    expect(JSON.stringify(gravados)).not.toContain("não persistir");
  });
  it("recusa lead de outro formulário sem gravar", async () => {
    let gravacoes = 0;
    await expect(reconciliarPagina("a1", "f1", true, undefined,
      async () => ({ leads: [{ ...evento.lead, formId: "outro" }] }), async () => { gravacoes++; })).rejects.toThrow("Formulário divergente");
    expect(gravacoes).toBe(0);
  });
  it("não inventa cursor nem aceita resposta malformada", async () => {
    await expect(
      reconciliarPagina(
        "a1",
        "f1",
        true,
        undefined,
        async () => ({}),
        async () => {},
      ),
    ).rejects.toThrow("Resposta de leads inválida");
    await expect(
      reconciliarPagina(
        "a1",
        "f1",
        true,
        undefined,
        async () => ({ leads: [], pagination: { hasMore: true } }),
        async () => {},
      ),
    ).rejects.toThrow("sem cursor");
  });
});
