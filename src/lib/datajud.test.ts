import { describe, expect, it } from "vitest";

import { derivarTribunalDoCNJ, TRIBUNAIS, tribunalSuportado } from "@/lib/datajud";

/**
 * Helper: monta um CNJ de 20 dígitos onde os caracteres relevantes
 * para a derivação são apenas o segmento (pos 13) e o tribunal (pos 14-15).
 * Demais campos são preenchidos com zeros para manter o formato.
 *
 * Formato CNJ: NNNNNNN DD AAAA J TT OOOO  (índices 0-19)
 *              0123456 7-8 9012 13 14-15 16-19
 */
function montarCNJ(segmento: number, tribunal: number): string {
  const seg = String(segmento);
  const trib = String(tribunal).padStart(2, "0");
  // 13 zeros + segmento (1) + tribunal (2) + 4 zeros = 20
  return "0".repeat(13) + seg + trib + "0000";
}

// ============================================================
// Justiça Estadual (segmento = 8) — 27 unidades federativas
// Mapa oficial CNJ. Ordem alfabética por sigla do tribunal,
// mas o CÓDIGO segue a tabela do CNJ (não é alfabético).
// ============================================================
const ESTADUAIS: Array<[number, string, string]> = [
  [1, "TJAC", "Acre"],
  [2, "TJAL", "Alagoas"],
  [3, "TJAP", "Amapá"],
  [4, "TJAM", "Amazonas"],
  [5, "TJBA", "Bahia"],
  [6, "TJCE", "Ceará"],
  [7, "TJDFT", "Distrito Federal e Territórios"],
  [8, "TJES", "Espírito Santo"],
  [9, "TJGO", "Goiás"],
  [10, "TJMA", "Maranhão"],
  [11, "TJMT", "Mato Grosso"],
  [12, "TJMS", "Mato Grosso do Sul"],
  [13, "TJMG", "Minas Gerais"],
  [14, "TJPA", "Pará"],
  [15, "TJPB", "Paraíba"],
  [16, "TJPE", "Pernambuco"],
  [17, "TJPI", "Piauí"],
  [18, "TJPR", "Paraná"],
  [19, "TJRJ", "Rio de Janeiro"],
  [20, "TJRN", "Rio Grande do Norte"],
  [21, "TJRO", "Rondônia"],
  [22, "TJRR", "Roraima"],
  [23, "TJRS", "Rio Grande do Sul"],
  [24, "TJSC", "Santa Catarina"],
  [25, "TJSE", "Sergipe"],
  [26, "TJSP", "São Paulo"],
  [27, "TJTO", "Tocantins"],
];

describe("derivarTribunalDoCNJ — Justiça Estadual (todos os 27 TJs)", () => {
  it.each(ESTADUAIS)(
    "TR %s mapeia para %s (%s)",
    (codigo, sigla) => {
      const cnj = montarCNJ(8, codigo);
      expect(derivarTribunalDoCNJ(cnj)).toBe(sigla);
    },
  );

  it("garante que todos os 27 estados estão cobertos sem duplicação", () => {
    const siglas = new Set(ESTADUAIS.map(([, s]) => s));
    expect(siglas.size).toBe(27);
  });

  it("garante que todo TJ no mapa de testes existe no catálogo TRIBUNAIS", () => {
    for (const [, sigla] of ESTADUAIS) {
      expect(TRIBUNAIS[sigla], `TRIBUNAIS deve conter ${sigla}`).toBeDefined();
      expect(TRIBUNAIS[sigla].segmento).toBe("estadual");
    }
  });
});

// ============================================================
// Regressão específica do bug TJMT ↔ TJMG (códigos 11 e 13)
// ============================================================
describe("derivarTribunalDoCNJ — regressão TJMT/TJMG (não inverter)", () => {
  it("CNJ real Mato Grosso → TJMT (TR=11)", () => {
    expect(derivarTribunalDoCNJ("10017501820268110037")).toBe("TJMT");
  });

  it("CNJ real Minas Gerais → TJMG (TR=13)", () => {
    expect(derivarTribunalDoCNJ("00000000000008130000")).toBe("TJMG");
  });

  it("TR=12 (Mato Grosso do Sul) NÃO deve ser confundido com MT/MG", () => {
    expect(derivarTribunalDoCNJ(montarCNJ(8, 12))).toBe("TJMS");
  });
});

// ============================================================
// Justiça Federal (segmento = 4) — TRFs 1 a 6
// ============================================================
describe("derivarTribunalDoCNJ — Justiça Federal (TRF1–TRF6)", () => {
  it.each([
    [1, "TRF1"],
    [2, "TRF2"],
    [3, "TRF3"],
    [4, "TRF4"],
    [5, "TRF5"],
    [6, "TRF6"],
  ])("TR %s mapeia para %s", (codigo, sigla) => {
    expect(derivarTribunalDoCNJ(montarCNJ(4, codigo as number))).toBe(sigla);
  });

  it("retorna null para código de TRF inexistente", () => {
    expect(derivarTribunalDoCNJ(montarCNJ(4, 9))).toBeNull();
  });
});

// ============================================================
// Justiça do Trabalho (segmento = 5) — TRT1 a TRT24
// ============================================================
describe("derivarTribunalDoCNJ — Justiça do Trabalho (TRT1–TRT24)", () => {
  it.each(Array.from({ length: 24 }, (_, i) => i + 1))(
    "TR %s mapeia para TRT%s",
    (codigo) => {
      const sigla = `TRT${codigo}`;
      expect(derivarTribunalDoCNJ(montarCNJ(5, codigo))).toBe(sigla);
      expect(TRIBUNAIS[sigla]).toBeDefined();
    },
  );
});

// ============================================================
// Tribunais Superiores
// ============================================================
describe("derivarTribunalDoCNJ — Tribunais Superiores", () => {
  it("segmento 2 → TST (independente do código de tribunal)", () => {
    expect(derivarTribunalDoCNJ(montarCNJ(2, 0))).toBe("TST");
    expect(derivarTribunalDoCNJ(montarCNJ(2, 5))).toBe("TST");
  });

  it("segmento 3 + TR=4 → STJ", () => {
    expect(derivarTribunalDoCNJ(montarCNJ(3, 4))).toBe("STJ");
  });

  it("segmento 3 + TR=1 → STM", () => {
    expect(derivarTribunalDoCNJ(montarCNJ(3, 1))).toBe("STM");
  });

  it("segmento 6 → TSE", () => {
    expect(derivarTribunalDoCNJ(montarCNJ(6, 0))).toBe("TSE");
    expect(derivarTribunalDoCNJ(montarCNJ(6, 7))).toBe("TSE");
  });
});

// ============================================================
// Aceita CNJ formatado (com pontuação) e ignora não-dígitos
// ============================================================
describe("derivarTribunalDoCNJ — normalização de entrada", () => {
  it("aceita CNJ formatado com hífens e pontos (TJSP)", () => {
    expect(derivarTribunalDoCNJ("0000000-00.0000.8.26.0000")).toBe("TJSP");
  });

  it("aceita CNJ formatado (TJMT)", () => {
    expect(derivarTribunalDoCNJ("1001750-18.2026.8.11.0037")).toBe("TJMT");
  });

  it("ignora espaços em branco", () => {
    expect(derivarTribunalDoCNJ("  00000000000008130000  ")).toBe("TJMG");
  });
});

// ============================================================
// Casos inválidos
// ============================================================
describe("derivarTribunalDoCNJ — casos inválidos", () => {
  it("retorna null para string vazia", () => {
    expect(derivarTribunalDoCNJ("")).toBeNull();
  });

  it("retorna null para CNJ com menos de 20 dígitos", () => {
    expect(derivarTribunalDoCNJ("12345")).toBeNull();
  });

  it("retorna null para CNJ com mais de 20 dígitos", () => {
    expect(derivarTribunalDoCNJ("0".repeat(25))).toBeNull();
  });

  it("retorna null para segmento estadual com TR fora de 1–27", () => {
    expect(derivarTribunalDoCNJ(montarCNJ(8, 0))).toBeNull();
    expect(derivarTribunalDoCNJ(montarCNJ(8, 28))).toBeNull();
    expect(derivarTribunalDoCNJ(montarCNJ(8, 99))).toBeNull();
  });

  it("retorna null para segmento desconhecido", () => {
    expect(derivarTribunalDoCNJ(montarCNJ(7, 1))).toBeNull();
    expect(derivarTribunalDoCNJ(montarCNJ(9, 1))).toBeNull();
  });
});

// ============================================================
// tribunalSuportado — sanidade
// ============================================================
describe("tribunalSuportado", () => {
  it("retorna true para todos os 27 TJs estaduais", () => {
    for (const [, sigla] of ESTADUAIS) {
      expect(tribunalSuportado(sigla)).toBe(true);
    }
  });

  it("retorna false para sigla inexistente ou null", () => {
    expect(tribunalSuportado(null)).toBe(false);
    expect(tribunalSuportado("TJXX")).toBe(false);
    expect(tribunalSuportado("")).toBe(false);
  });
});

// ============================================================
// normalizarCNJ — formato canônico com pontuação
// ============================================================
import { normalizarCNJ, validarCNJDigitoVerificador } from "@/lib/datajud";

describe("normalizarCNJ", () => {
  it("converte 20 dígitos puros em formato canônico", () => {
    expect(normalizarCNJ("10017501820268110037")).toBe(
      "1001750-18.2026.8.11.0037",
    );
  });

  it("mantém entrada já formatada", () => {
    expect(normalizarCNJ("1001750-18.2026.8.11.0037")).toBe(
      "1001750-18.2026.8.11.0037",
    );
  });

  it("aceita entrada com espaços e caracteres aleatórios", () => {
    expect(normalizarCNJ("  1001750/18/2026/8/11/0037  ")).toBe(
      "1001750-18.2026.8.11.0037",
    );
  });

  it("retorna null para entradas com menos de 20 dígitos", () => {
    expect(normalizarCNJ("12345")).toBeNull();
    expect(normalizarCNJ("")).toBeNull();
  });

  it("retorna null para entradas com mais de 20 dígitos", () => {
    expect(normalizarCNJ("1".repeat(21))).toBeNull();
  });
});

// ============================================================
// validarCNJDigitoVerificador — módulo 97 base 10 (Res. CNJ 65/2008)
// ============================================================
describe("validarCNJDigitoVerificador", () => {
  it("aceita CNJ válido (TJSP — DV calculado)", () => {
    // 0001327-28.2018.8.26.0073 → DV correto pelo algoritmo módulo 97
    expect(validarCNJDigitoVerificador("0001327-28.2018.8.26.0073")).toBe(true);
  });

  it("aceita CNJ válido (TJMT — caso real do bug TJMT/TJMG)", () => {
    expect(validarCNJDigitoVerificador("1001750-18.2026.8.11.0037")).toBe(true);
  });

  it("aceita CNJ válido (TJMG — DV calculado)", () => {
    expect(validarCNJDigitoVerificador("0000001-47.2020.8.13.0001")).toBe(true);
  });

  it("rejeita CNJ com DV alterado", () => {
    expect(validarCNJDigitoVerificador("0001327-99.2018.8.26.0073")).toBe(false);
    expect(validarCNJDigitoVerificador("1001750-99.2026.8.11.0037")).toBe(false);
  });

  it("rejeita entradas inválidas em comprimento", () => {
    expect(validarCNJDigitoVerificador("")).toBe(false);
    expect(validarCNJDigitoVerificador("123")).toBe(false);
    expect(validarCNJDigitoVerificador("1".repeat(21))).toBe(false);
  });

  it("ignora pontuação na validação (mesmo CNJ com/sem máscara)", () => {
    expect(validarCNJDigitoVerificador("00013272820188260073")).toBe(true);
    expect(validarCNJDigitoVerificador("0001327-28.2018.8.26.0073")).toBe(true);
  });
});
