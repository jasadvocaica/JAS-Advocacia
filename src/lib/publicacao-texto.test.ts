// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { textoLegivelPublicacao } from "./publicacao-texto";

describe("textoLegivelPublicacao", () => {
  it("remove marcação e decodifica acentos sem alterar a publicação original", () => {
    const original = "<html><head><style>body{display:none}</style></head><body><section><p>DESPACHO/DECIS&Atilde;O</p><p>Trata-se de a&ccedil;&atilde;o previdenci&aacute;ria.</p></section></body></html>";
    expect(textoLegivelPublicacao(original)).toBe(
      "DESPACHO/DECISÃO\nTrata-se de ação previdenciária.",
    );
    expect(original).toContain("<section>");
  });

  it("não renderiza scripts nem tags codificadas duas vezes", () => {
    const original = "&lt;section&gt;Prazo de 15 dias&lt;/section&gt;<script>alert(1)</script>";
    expect(textoLegivelPublicacao(original)).toBe("Prazo de 15 dias");
  });

  it("preserva texto comum e não inventa prazo", () => {
    expect(textoLegivelPublicacao("Intimação recebida. Prazo a conferir.")).toBe(
      "Intimação recebida. Prazo a conferir.",
    );
  });
});
