import { describe, expect, it } from "vitest";
import { normalizarFormularios } from "../../../supabase/functions/_shared/marketing-formularios";
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
