import { describe, expect, it } from "vitest";
import { PERSONA_TEMPLATES, templateConfig } from "./personaTemplates";
import { validarConfigAgente } from "../../../../../supabase/functions/_shared/agentes-config";
describe("Personas adaptadas sem ativação de capacidades futuras", () => {
  it.each(PERSONA_TEMPLATES.map((t) => t.id))(
    "%s respeita o contrato, a pausa e o escopo do executor instalado",
    (id) => {
      const c = templateConfig(id)!;
      expect(validarConfigAgente(c)).toEqual(c);
      expect(c.ativo).toBe(false);
      expect(c.intervalo_minutos).toBeNull();
      expect(c.prompt_base).toContain("não habilita escrita");
    },
  );
  it("não cria o executor de prazos nem inventa identificador ausente", () => {
    expect(templateConfig("vanessa")).toBeNull();
    expect(templateConfig("desconhecido")).toBeNull();
  });
  it("preserva pendências da voz e não promete conferência automática OAB instalada", () => {
    const c = templateConfig("camila")!;
    expect(c.documentos[1].texto).toContain("[PREENCHER]");
    expect(c.documentos[0].texto).toContain("ainda não estão instalados");
  });
});
