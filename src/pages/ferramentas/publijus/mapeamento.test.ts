import { describe, it, expect } from "vitest";
import { detectarListaPath, detectarMapeamento, aplicarPath, chavesDisponiveis } from "./mapeamento";

describe("publijus/mapeamento", () => {
  const exemplo = {
    page: 1,
    total: 2,
    data: [
      {
        id: "abc-1",
        numero_processo: "1234567-89.2024.8.26.0100",
        data_publicacao: "2026-05-04",
        texto: "Intimação para manifestar-se em 15 dias.",
        tribunal: "TJSP",
        tipo: "intimacao",
      },
      {
        id: "abc-2",
        numero_processo: "0009876-54.2023.8.26.0010",
        data_publicacao: "2026-05-03",
        texto: "Despacho saneador.",
        tribunal: "TJSP",
        tipo: "despacho",
      },
    ],
  };

  it("detecta lista_path", () => {
    expect(detectarListaPath(exemplo)).toBe("data");
  });

  it("mapeia campos por nome e valida CNJ", () => {
    const m = detectarMapeamento(exemplo);
    expect(m.lista_path).toBe("data");
    expect(m.map_cnj).toBe("numero_processo");
    expect(m.map_data).toBe("data_publicacao");
    expect(m.map_descricao).toBe("texto");
    expect(m.map_id).toBe("id");
    expect(m.map_orgao).toBe("tribunal");
    expect(m.map_tipo).toBe("tipo");
  });

  it("aplica path com índices", () => {
    expect(aplicarPath(exemplo, "data.0.numero_processo")).toBe("1234567-89.2024.8.26.0100");
  });

  it("lista chaves disponíveis", () => {
    const ks = chavesDisponiveis(exemplo, "data");
    expect(ks).toContain("numero_processo");
    expect(ks).toContain("texto");
  });

  it("encontra CNJ em chave com nome inesperado", () => {
    const x = { items: [{ foo: "1234567-89.2024.8.26.0100", quando: "2026-05-04", body: "x" }] };
    const m = detectarMapeamento(x);
    expect(m.lista_path).toBe("items");
    expect(m.map_cnj).toBe("foo");
  });

  it("retorna vazio quando não há lista", () => {
    expect(detectarMapeamento({ apenas: "objeto" })).toEqual({
      lista_path: "", map_cnj: "", map_data: "", map_descricao: "",
      map_id: "", map_orgao: "", map_tipo: "",
    });
  });
});
