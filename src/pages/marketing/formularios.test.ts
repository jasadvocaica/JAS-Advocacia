import { describe, expect, it } from "vitest";
import { normalizarFormularios, consultarMetaSelecionada } from "../../../supabase/functions/_shared/marketing-formularios";
describe("descoberta de formulários Meta", () => {
  it("retorna somente metadados permitidos e cursor", () => {
    expect(normalizarFormularios({ forms: [{ id: "f1", name: "Contato", page: { id: "p1" }, status: "ACTIVE", access_token: "ficticio", leads: [{ email: "pessoal@example.test" }] }], pagination: { hasMore: true, cursor: "pagina2" } })).toEqual({ formularios: [{ id: "f1", nome: "Contato", pagina_id: "p1", status: "ACTIVE" }], hasMore: true, cursor: "pagina2" });
  });
  it("não inventa a Página quando o provedor não a informa", () => {
    expect(normalizarFormularios({ forms: [{ id: "f2" }] }).formularios[0].pagina_id).toBeNull();
  });
  it("diferencia lista vazia de resposta inválida", () => {
    expect(normalizarFormularios({ forms: [] }).formularios).toEqual([]);
    expect(() => normalizarFormularios({ error: "sem acesso" })).toThrow();
  });
  it("bloqueia paginação truncada e formulário sem ID", () => {
    expect(() => normalizarFormularios({ forms: [], pagination: { hasMore: true } })).toThrow();
    expect(() => normalizarFormularios({ forms: [{ name: "sem ID" }] })).toThrow();
  });
});

describe("consulta Meta de nomes e IDs", () => {
  it("lista somente a conexão selecionada, Página e contas no escopo, sem campos extras", async () => {
    const chamadas: string[] = [];
    const resultado = await consultarMetaSelecionada([{ externo_id: "m1", plataforma: "metaads" }], async path => {
      chamadas.push(path);
      if (path === "/v1/accounts") return { accounts: [{ _id: "outra", displayName: "Outra" }, { _id: "m1", displayName: "Conexão", isActive: true, metadata: { selectedPageId: "p1", availablePages: [{ id: "p1", name: "Página escolhida", access_token: "ficticio" }], tokenType: "não retornar" } }] };
      if (path === "/v1/ads/accounts") return { accounts: [{ id: "act1", name: "Conta de teste", selected: true, balance: 999 }, { id: "fora", selected: false }] };
      return { forms: [{ id: "f1", name: "Contato", leads: [{ email: "pessoal@example.test" }] }] };
    });
    expect(resultado.contas[0]).toEqual({ id: "m1", nome: "Conexão", pagina: { id: "p1", nome: "Página escolhida" }, anuncios: [{ id: "act1", nome: "Conta de teste" }], formularios: [{ id: "f1", nome: "Contato" }], consulta_parcial: false });
    expect(chamadas).toEqual(["/v1/accounts", "/v1/ads/accounts", "/v1/ads/lead-forms"]);
    expect(JSON.stringify(resultado)).not.toMatch(/ficticio|pessoal@|balance|tokenType/);
  });
  it("não amplia para outra conta quando a conexão selecionada não está disponível", async () => {
    await expect(consultarMetaSelecionada([{ externo_id: "ausente", plataforma: "metaads" }], async () => ({ accounts: [] }))).rejects.toThrow("consulta_meta_invalida");
  });
  it("marca consulta parcial e limita a paginação", async () => {
    let paginas = 0;
    const r = await consultarMetaSelecionada([{ externo_id: "m1", plataforma: "metaads" }], async path => {
      if (path === "/v1/accounts") return { accounts: [{ _id: "m1", isActive: true }] };
      if (path === "/v1/ads/accounts") return { accounts: [] };
      paginas++; return { forms: [], pagination: { hasMore: true, cursor: "cursor" + paginas } };
    });
    expect(paginas).toBe(4); expect(r.contas[0].consulta_parcial).toBe(true);
    expect(r.contas[0].pagina).toBeNull();
  });
});
