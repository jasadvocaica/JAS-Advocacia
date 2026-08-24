import { describe, it, expect } from "vitest";
import {
  avaliarConsistencias,
  type CalcInputs,
  type ConsistenciasParams,
  type Thresholds,
  type PerfilAtivo,
} from "./consistencias";

/* ──────────────────────────── Helpers ──────────────────────────── */

const PERFIL_PADRAO: PerfilAtivo = {
  nome: "Construção Civil (padrão)",
  base: "Lei 9.711/98 + IN RFB 2.110/22",
  matFaixaTipica: "30% a 80% (obras com fornecimento de materiais)",
};

const THRESHOLDS_PADRAO: Thresholds = {
  vbMin: 100,
  vbMax: 100_000_000,
  matMin: 5,
  matMax: 95,
};

/**
 * Constrói um `CalcInputs` consistente: a partir de vb, alq, matPct, dedDCTF
 * deriva os campos derivados (inssRetido, bcCorreta, inssCorreto, ...).
 * Use este helper para cenários "felizes" e modifique apenas o necessário.
 */
function buildCalc(opts: {
  vb: number;
  alq?: number;
  matPct?: number;
  dedDCTF?: number;
  mesesAtraso?: number;
  /** Permite forçar valores para simular inconsistência aritmética. */
  inssRetidoOverride?: number;
  bcCorretaOverride?: number;
  inssCorretoOverride?: number;
  inssIndevidoOverride?: number;
  creditoOriginalOverride?: number;
}): CalcInputs {
  const vb = opts.vb;
  const alq = opts.alq ?? 0.11;
  const matPct = opts.matPct ?? 0;
  const dedDCTF = opts.dedDCTF ?? 0;
  const mesesAtraso = opts.mesesAtraso ?? 6;

  const inssRetido = opts.inssRetidoOverride ?? vb * alq;
  const bcCorreta = opts.bcCorretaOverride ?? vb * (1 - matPct / 100);
  const inssCorreto = opts.inssCorretoOverride ?? bcCorreta * alq;
  const inssIndevido =
    opts.inssIndevidoOverride ?? Math.max(0, inssRetido - inssCorreto);
  const creditoOriginal =
    opts.creditoOriginalOverride ?? Math.max(0, inssRetido - dedDCTF);

  return {
    vb,
    alq,
    inssRetido,
    dedDCTF,
    matPct,
    bcCorreta,
    inssCorreto,
    inssIndevido,
    creditoOriginal,
    mesesAtraso,
  };
}

function buildParams(
  overrides: Partial<ConsistenciasParams> = {},
): ConsistenciasParams {
  return {
    calc: buildCalc({ vb: 10_000 }),
    tipoEmpreitada: "parcial",
    modoMaterial: "presuncao",
    materialPctRaw: "",
    thresholds: THRESHOLDS_PADRAO,
    perfilAtivo: PERFIL_PADRAO,
    overrides: {},
    hojeRef: new Date(2026, 3, 27), // 27/abril/2026 fixo p/ determinismo
    ...overrides,
  };
}

const ids = (lista: ReturnType<typeof avaliarConsistencias>) =>
  lista.map((c) => c.id);

const find = (
  lista: ReturnType<typeof avaliarConsistencias>,
  id: string,
) => lista.find((c) => c.id === id);

/* ──────────────────────────── Casos base ──────────────────────────── */

describe("avaliarConsistencias — casos base", () => {
  it("retorna lista vazia quando vb ≤ 0", () => {
    const r = avaliarConsistencias(
      buildParams({ calc: buildCalc({ vb: 0 }) }),
    );
    expect(r).toEqual([]);
  });

  it("retorna lista vazia para um cenário totalmente válido (parcial, presunção 35%)", () => {
    // vb=10000, matPct=35 (presunção), alq=11%
    const calc = buildCalc({ vb: 10_000, matPct: 35, alq: 0.11 });
    const r = avaliarConsistencias(buildParams({ calc }));
    expect(r).toEqual([]);
  });
});

/* ────────────────────────── 1. Alíquota ────────────────────────── */

describe("alíquota fora do padrão", () => {
  it("não dispara quando alíquota = 11%", () => {
    const r = avaliarConsistencias(
      buildParams({ calc: buildCalc({ vb: 10_000, alq: 0.11, matPct: 35 }) }),
    );
    expect(find(r, "aliquota_fora_padrao")).toBeUndefined();
  });

  it("dispara WARN quando alíquota está entre 3,5% e 11% (ex.: 7%)", () => {
    const calc = buildCalc({ vb: 10_000, alq: 0.07, matPct: 35 });
    const r = avaliarConsistencias(buildParams({ calc }));
    const c = find(r, "aliquota_fora_padrao");
    expect(c?.severidade).toBe("warn");
    expect(c?.titulo).toContain("7,00%");
  });

  it("dispara ERROR quando alíquota > 11%", () => {
    const calc = buildCalc({ vb: 10_000, alq: 0.15, matPct: 35 });
    const r = avaliarConsistencias(buildParams({ calc }));
    expect(find(r, "aliquota_fora_padrao")?.severidade).toBe("error");
  });

  it("dispara ERROR quando alíquota < 3,5%", () => {
    const calc = buildCalc({ vb: 10_000, alq: 0.02, matPct: 35 });
    const r = avaliarConsistencias(buildParams({ calc }));
    expect(find(r, "aliquota_fora_padrao")?.severidade).toBe("error");
  });

  it("trata 3,5% (limite) como WARN, não ERROR", () => {
    const calc = buildCalc({ vb: 10_000, alq: 0.035, matPct: 35 });
    const r = avaliarConsistencias(buildParams({ calc }));
    expect(find(r, "aliquota_fora_padrao")?.severidade).toBe("warn");
  });

  it("inclui ações set_aliquota_11 e set_aliquota_3_5", () => {
    const calc = buildCalc({ vb: 10_000, alq: 0.07, matPct: 35 });
    const r = avaliarConsistencias(buildParams({ calc }));
    const acoes = find(r, "aliquota_fora_padrao")?.acoes?.map((a) => a.id);
    expect(acoes).toEqual(["set_aliquota_11", "set_aliquota_3_5"]);
  });
});

/* ────────────────────────── 2. Faixa de vb ────────────────────────── */

describe("vb fora da faixa do perfil", () => {
  it("dispara vb_baixo quando vb < vbMin (50 < 100)", () => {
    const calc = buildCalc({ vb: 50, matPct: 35 });
    const r = avaliarConsistencias(buildParams({ calc }));
    const c = find(r, "vb_baixo");
    expect(c?.severidade).toBe("warn");
    expect(c?.motivo).toContain('Perfil "Construção Civil (padrão)"');
    expect(c?.motivo).not.toContain("(override manual)");
  });

  it("indica override manual no motivo quando overrides.vbMin = true", () => {
    const calc = buildCalc({ vb: 50, matPct: 35 });
    const r = avaliarConsistencias(
      buildParams({ calc, overrides: { vbMin: true } }),
    );
    expect(find(r, "vb_baixo")?.motivo).toContain("(override manual)");
  });

  it("não dispara vb_baixo quando vb = vbMin (limite inclusivo)", () => {
    const calc = buildCalc({ vb: 100, matPct: 35 });
    const r = avaliarConsistencias(buildParams({ calc }));
    expect(find(r, "vb_baixo")).toBeUndefined();
  });

  it("dispara vb_alto quando vb > vbMax", () => {
    const calc = buildCalc({ vb: 200_000_000, matPct: 35 });
    const r = avaliarConsistencias(buildParams({ calc }));
    const c = find(r, "vb_alto");
    expect(c?.severidade).toBe("warn");
    expect(c?.motivo).toContain("limite máximo");
  });

  it("não dispara vb_alto exatamente em vbMax", () => {
    const calc = buildCalc({ vb: 100_000_000, matPct: 35 });
    const r = avaliarConsistencias(buildParams({ calc }));
    expect(find(r, "vb_alto")).toBeUndefined();
  });

  it("respeita thresholds customizados (perfil 'limpeza': vbMax 20M)", () => {
    const calc = buildCalc({ vb: 25_000_000, matPct: 5 });
    const r = avaliarConsistencias(
      buildParams({
        calc,
        thresholds: { vbMin: 50, vbMax: 20_000_000, matMin: 0, matMax: 15 },
      }),
    );
    expect(find(r, "vb_alto")).toBeDefined();
  });
});

/* ──────────── 3. Coerência aritmética do INSS retido ──────────── */

describe("inss_aritmetica", () => {
  it("não dispara quando inssRetido = vb × alq", () => {
    const calc = buildCalc({ vb: 10_000, alq: 0.11, matPct: 35 });
    const r = avaliarConsistencias(buildParams({ calc }));
    expect(find(r, "inss_aritmetica")).toBeUndefined();
  });

  it("dispara ERROR quando há divergência > 0,01", () => {
    const calc = buildCalc({
      vb: 10_000,
      alq: 0.11,
      matPct: 35,
      inssRetidoOverride: 1234.56, // esperado seria 1100
    });
    const r = avaliarConsistencias(buildParams({ calc }));
    expect(find(r, "inss_aritmetica")?.severidade).toBe("error");
  });

  it("tolera diferenças até 0,01 sem disparar", () => {
    const calc = buildCalc({
      vb: 10_000,
      alq: 0.11,
      matPct: 35,
      inssRetidoOverride: 1100.005, // dentro da tolerância
    });
    const r = avaliarConsistencias(buildParams({ calc }));
    expect(find(r, "inss_aritmetica")).toBeUndefined();
  });
});

/* ─── 3b. Conciliação base × materiais × INSS retido ─── */

describe("base_materiais_nao_fecha", () => {
  it("não dispara quando base + materiais = vb (identidade)", () => {
    const calc = buildCalc({ vb: 10_000, matPct: 35 });
    const r = avaliarConsistencias(buildParams({ calc }));
    expect(find(r, "base_materiais_nao_fecha")).toBeUndefined();
  });

  it("dispara ERROR quando bcCorreta foi forjada (não fecha)", () => {
    const calc = buildCalc({
      vb: 10_000,
      matPct: 35,
      bcCorretaOverride: 5_000, // esperado: 6500
    });
    const r = avaliarConsistencias(buildParams({ calc }));
    const c = find(r, "base_materiais_nao_fecha");
    expect(c?.severidade).toBe("error");
    expect(c?.acoes?.[0].id).toBe("modo_presuncao");
  });
});

/* ─── 3c. Conciliação por modo de empreitada ─── */

describe("tipo de empreitada — conciliação", () => {
  it("dispara WARN quando tipoEmpreitada = 'indefinido'", () => {
    const r = avaliarConsistencias(
      buildParams({ tipoEmpreitada: "indefinido" }),
    );
    const c = find(r, "tipo_empreitada_indefinido");
    expect(c?.severidade).toBe("warn");
  });

  describe("tipoEmpreitada = 'total'", () => {
    it("não dispara total_base_nao_zero quando inssCorreto ≈ 0 (matPct=100)", () => {
      // Em "total" o usuário esperaria base=0; aqui matPct=100 garante isso
      const calc = buildCalc({ vb: 10_000, matPct: 100, alq: 0.11 });
      const r = avaliarConsistencias(
        buildParams({ tipoEmpreitada: "total", calc }),
      );
      expect(find(r, "total_base_nao_zero")).toBeUndefined();
    });

    it("dispara ERROR quando inssCorreto > 0 (configuração inconsistente)", () => {
      const calc = buildCalc({ vb: 10_000, matPct: 35, alq: 0.11 });
      const r = avaliarConsistencias(
        buildParams({ tipoEmpreitada: "total", calc }),
      );
      const c = find(r, "total_base_nao_zero");
      expect(c?.severidade).toBe("error");
      expect(c?.acoes?.[0].id).toBe("resetar_materiais");
    });
  });

  describe("tipoEmpreitada = 'parcial'", () => {
    it("não dispara nenhuma divergência quando tudo está coerente", () => {
      const calc = buildCalc({ vb: 10_000, matPct: 35, alq: 0.11 });
      const r = avaliarConsistencias(buildParams({ calc }));
      expect(ids(r)).not.toContain("parcial_base_divergente");
      expect(ids(r)).not.toContain("parcial_inss_correto_divergente");
      expect(ids(r)).not.toContain("parcial_indevido_correto_nao_fecha");
    });

    it("dispara parcial_base_divergente quando bcCorreta foge da fórmula", () => {
      const calc = buildCalc({
        vb: 10_000,
        matPct: 35,
        alq: 0.11,
        bcCorretaOverride: 7_000, // esperado: 6500
        // mantemos inssCorreto/Indevido coerentes p/ isolar o teste
        inssCorretoOverride: 7_000 * 0.11,
        inssIndevidoOverride: 10_000 * 0.11 - 7_000 * 0.11,
      });
      const r = avaliarConsistencias(buildParams({ calc }));
      expect(find(r, "parcial_base_divergente")?.severidade).toBe("error");
    });

    it("dispara parcial_inss_correto_divergente quando inssCorreto foge de bcEsperada × alq", () => {
      const calc = buildCalc({
        vb: 10_000,
        matPct: 35,
        alq: 0.11,
        // bcCorreta = 6500 (correto), mas inssCorreto forjado
        inssCorretoOverride: 999, // esperado ~715
      });
      const r = avaliarConsistencias(buildParams({ calc }));
      expect(find(r, "parcial_inss_correto_divergente")?.severidade).toBe(
        "error",
      );
    });

    it("dispara parcial_indevido_correto_nao_fecha quando indevido + correto ≠ retido", () => {
      const calc = buildCalc({
        vb: 10_000,
        matPct: 35,
        alq: 0.11,
        inssIndevidoOverride: 100, // soma com inssCorreto não bate com retido (1100)
      });
      const r = avaliarConsistencias(buildParams({ calc }));
      expect(
        find(r, "parcial_indevido_correto_nao_fecha")?.severidade,
      ).toBe("error");
    });
  });
});

/* ─── 4. Empreitada parcial sem materiais ─── */

describe("sem_materiais_parcial", () => {
  it("dispara WARN quando parcial e matPct = 0", () => {
    const calc = buildCalc({ vb: 10_000, matPct: 0, alq: 0.11 });
    const r = avaliarConsistencias(
      buildParams({ tipoEmpreitada: "parcial", calc }),
    );
    const c = find(r, "sem_materiais_parcial");
    expect(c?.severidade).toBe("warn");
    expect(c?.acoes?.map((a) => a.id)).toEqual([
      "modo_presuncao",
      "modo_discriminado",
      "tipo_total",
    ]);
  });

  it("não dispara em empreitada total mesmo com matPct = 0", () => {
    const calc = buildCalc({ vb: 10_000, matPct: 0, alq: 0.11 });
    const r = avaliarConsistencias(
      buildParams({ tipoEmpreitada: "total", calc }),
    );
    expect(find(r, "sem_materiais_parcial")).toBeUndefined();
  });
});

/* ─── 5. Faixa de materiais discriminados ─── */

describe("materiais discriminados fora da faixa", () => {
  it("não dispara quando modoMaterial = 'presuncao' (mesmo com pctRaw bizarro)", () => {
    const calc = buildCalc({ vb: 10_000, matPct: 35, alq: 0.11 });
    const r = avaliarConsistencias(
      buildParams({
        modoMaterial: "presuncao",
        materialPctRaw: "1",
        calc,
      }),
    );
    expect(find(r, "materiais_baixos")).toBeUndefined();
    expect(find(r, "materiais_altos")).toBeUndefined();
  });

  it("dispara materiais_baixos quando 0 < n < matMin (perfil padrão: 5%)", () => {
    const calc = buildCalc({ vb: 10_000, matPct: 3, alq: 0.11 });
    const r = avaliarConsistencias(
      buildParams({
        modoMaterial: "discriminado",
        materialPctRaw: "3",
        calc,
      }),
    );
    expect(find(r, "materiais_baixos")?.severidade).toBe("warn");
  });

  it("não dispara materiais_baixos quando n = 0 (campo zerado é tratado em outra checagem)", () => {
    const calc = buildCalc({ vb: 10_000, matPct: 0, alq: 0.11 });
    const r = avaliarConsistencias(
      buildParams({
        modoMaterial: "discriminado",
        materialPctRaw: "0",
        calc,
      }),
    );
    expect(find(r, "materiais_baixos")).toBeUndefined();
  });

  it("não dispara materiais_baixos exatamente em matMin (5%)", () => {
    const calc = buildCalc({ vb: 10_000, matPct: 5, alq: 0.11 });
    const r = avaliarConsistencias(
      buildParams({
        modoMaterial: "discriminado",
        materialPctRaw: "5",
        calc,
      }),
    );
    expect(find(r, "materiais_baixos")).toBeUndefined();
  });

  it("dispara materiais_altos quando n > matMax (perfil padrão: 95%)", () => {
    const calc = buildCalc({ vb: 10_000, matPct: 97, alq: 0.11 });
    const r = avaliarConsistencias(
      buildParams({
        modoMaterial: "discriminado",
        materialPctRaw: "97",
        calc,
      }),
    );
    const c = find(r, "materiais_altos");
    expect(c?.severidade).toBe("warn");
    expect(c?.motivo).toContain("Construção Civil (padrão)");
  });

  it("ignora materialPctRaw inválido (NaN) sem disparar", () => {
    const calc = buildCalc({ vb: 10_000, matPct: 0, alq: 0.11 });
    const r = avaliarConsistencias(
      buildParams({
        modoMaterial: "discriminado",
        materialPctRaw: "abc",
        calc,
      }),
    );
    expect(find(r, "materiais_baixos")).toBeUndefined();
    expect(find(r, "materiais_altos")).toBeUndefined();
  });

  it("respeita override de matMin/matMax (perfil 'limpeza' aceita 0–15%)", () => {
    const calc = buildCalc({ vb: 10_000, matPct: 10, alq: 0.11 });
    const r = avaliarConsistencias(
      buildParams({
        modoMaterial: "discriminado",
        materialPctRaw: "10",
        thresholds: { vbMin: 50, vbMax: 20_000_000, matMin: 0, matMax: 15 },
        overrides: { matMax: true },
        calc,
      }),
    );
    // 10% está dentro de 0–15 — sem alerta
    expect(find(r, "materiais_baixos")).toBeUndefined();
    expect(find(r, "materiais_altos")).toBeUndefined();
  });

  it("indica override manual no motivo quando overrides.matMax = true", () => {
    const calc = buildCalc({ vb: 10_000, matPct: 50, alq: 0.11 });
    const r = avaliarConsistencias(
      buildParams({
        modoMaterial: "discriminado",
        materialPctRaw: "50",
        thresholds: { ...THRESHOLDS_PADRAO, matMax: 30 },
        overrides: { matMax: true },
        calc,
      }),
    );
    expect(find(r, "materiais_altos")?.motivo).toContain("(override manual)");
  });
});

/* ─── 6. Base zero fora de empreitada total ─── */

describe("bc_zero", () => {
  it("dispara ERROR quando bcCorreta = 0 e tipo ≠ total", () => {
    const calc = buildCalc({ vb: 10_000, matPct: 100, alq: 0.11 });
    const r = avaliarConsistencias(
      buildParams({ tipoEmpreitada: "parcial", calc }),
    );
    expect(find(r, "bc_zero")?.severidade).toBe("error");
  });

  it("NÃO dispara em empreitada total (lá base zero é correto)", () => {
    const calc = buildCalc({ vb: 10_000, matPct: 100, alq: 0.11 });
    const r = avaliarConsistencias(
      buildParams({ tipoEmpreitada: "total", calc }),
    );
    expect(find(r, "bc_zero")).toBeUndefined();
  });
});

/* ─── 7. Dedução DCTFWeb maior que retido ─── */

describe("deducao_excede", () => {
  it("dispara ERROR quando dedDCTF > inssRetido", () => {
    // vb=10000, alq=11% → retido=1100; dedDCTF=2000
    const calc = buildCalc({
      vb: 10_000,
      matPct: 35,
      alq: 0.11,
      dedDCTF: 2_000,
    });
    const r = avaliarConsistencias(buildParams({ calc }));
    const c = find(r, "deducao_excede");
    expect(c?.severidade).toBe("error");
    expect(c?.acoes?.map((a) => a.id)).toContain("zerar_dctf");
    expect(c?.acoes?.map((a) => a.id)).toContain("limitar_dctf_ao_retido");
  });

  it("não dispara quando dedDCTF = inssRetido (limite)", () => {
    const calc = buildCalc({
      vb: 10_000,
      matPct: 35,
      alq: 0.11,
      dedDCTF: 1_100,
    });
    const r = avaliarConsistencias(buildParams({ calc }));
    expect(find(r, "deducao_excede")).toBeUndefined();
  });
});

/* ─── 8. Crédito zero ─── */

describe("credito_zero", () => {
  it("dispara WARN quando creditoOriginal ≈ 0 mas há retenção", () => {
    // dedução = retenção → crédito = 0
    const calc = buildCalc({
      vb: 10_000,
      matPct: 35,
      alq: 0.11,
      dedDCTF: 1_100,
    });
    const r = avaliarConsistencias(buildParams({ calc }));
    expect(find(r, "credito_zero")?.severidade).toBe("warn");
  });

  it("não dispara quando há crédito > 0,01", () => {
    const calc = buildCalc({
      vb: 10_000,
      matPct: 35,
      alq: 0.11,
      dedDCTF: 0,
    });
    const r = avaliarConsistencias(buildParams({ calc }));
    expect(find(r, "credito_zero")).toBeUndefined();
  });
});

/* ─── 9. Crédito > retido ─── */

describe("credito_maior_retido", () => {
  it("dispara ERROR quando creditoOriginal > inssRetido", () => {
    const calc = buildCalc({
      vb: 10_000,
      matPct: 35,
      alq: 0.11,
      creditoOriginalOverride: 5_000, // > 1100
    });
    const r = avaliarConsistencias(buildParams({ calc }));
    expect(find(r, "credito_maior_retido")?.severidade).toBe("error");
  });
});

/* ─── 10. Prescrição (5 anos) ─── */

describe("prescrição quinquenal", () => {
  it("dispara prescrito (ERROR) quando mesesAtraso > 60", () => {
    const calc = buildCalc({ vb: 10_000, matPct: 35, mesesAtraso: 70 });
    const r = avaliarConsistencias(buildParams({ calc }));
    const c = find(r, "prescrito");
    expect(c?.severidade).toBe("error");
    expect(c?.descricao).toContain("70 meses");
  });

  it("não dispara prescrito quando mesesAtraso = 60 (limite exato)", () => {
    const calc = buildCalc({ vb: 10_000, matPct: 35, mesesAtraso: 60 });
    const r = avaliarConsistencias(buildParams({ calc }));
    expect(find(r, "prescrito")).toBeUndefined();
  });

  it("dispara prescricao_proxima (WARN) entre 55 e 60 meses", () => {
    const calc = buildCalc({ vb: 10_000, matPct: 35, mesesAtraso: 56 });
    const r = avaliarConsistencias(buildParams({ calc }));
    const c = find(r, "prescricao_proxima");
    expect(c?.severidade).toBe("warn");
    expect(c?.descricao).toContain("4 meses"); // 60-56
  });

  it("não dispara prescricao_proxima quando mesesAtraso = 54 (limite)", () => {
    const calc = buildCalc({ vb: 10_000, matPct: 35, mesesAtraso: 54 });
    const r = avaliarConsistencias(buildParams({ calc }));
    expect(find(r, "prescricao_proxima")).toBeUndefined();
  });

  it("nunca dispara prescrito + prescricao_proxima ao mesmo tempo", () => {
    for (const m of [55, 60, 61, 80]) {
      const calc = buildCalc({ vb: 10_000, matPct: 35, mesesAtraso: m });
      const r = avaliarConsistencias(buildParams({ calc }));
      const has = ids(r).filter(
        (id) => id === "prescrito" || id === "prescricao_proxima",
      );
      expect(has.length).toBeLessThanOrEqual(1);
    }
  });
});

/* ─── 11. Competência futura ─── */

describe("comp_futura", () => {
  it("dispara ERROR quando mesesAtraso < 0", () => {
    const calc = buildCalc({ vb: 10_000, matPct: 35, mesesAtraso: -2 });
    const r = avaliarConsistencias(buildParams({ calc }));
    const c = find(r, "comp_futura");
    expect(c?.severidade).toBe("error");
    expect(c?.acoes?.map((a) => a.id)).toContain(
      "ajustar_competencia_mes_anterior",
    );
  });

  it("usa hojeRef para computar a sugestão de mês anterior", () => {
    const calc = buildCalc({ vb: 10_000, matPct: 35, mesesAtraso: -1 });
    const r = avaliarConsistencias(
      buildParams({ calc, hojeRef: new Date(2026, 2, 15) }), // março/2026 → sugere 02/2026
    );
    const acao = find(r, "comp_futura")?.acoes?.find(
      (a) => a.id === "ajustar_competencia_mes_anterior",
    );
    expect(acao?.label).toContain("02/2026");
  });
});

/* ───────────── Combinações (smoke tests integrativos) ───────────── */

describe("combinações de inputs", () => {
  it("acumula vários alertas: vb_baixo + alíquota fora + sem_materiais_parcial + bc_zero+materiais_altos", () => {
    // vb baixo (50), alq 7% (warn), parcial com matPct=100 (bc_zero), discriminado=100 (>matMax)
    const calc = buildCalc({
      vb: 50,
      matPct: 100,
      alq: 0.07,
    });
    const r = avaliarConsistencias(
      buildParams({
        tipoEmpreitada: "parcial",
        modoMaterial: "discriminado",
        materialPctRaw: "100",
        calc,
      }),
    );
    const got = ids(r);
    expect(got).toContain("vb_baixo");
    expect(got).toContain("aliquota_fora_padrao");
    expect(got).toContain("materiais_altos");
    expect(got).toContain("bc_zero");
  });

  it("cenário ideal (parcial, presunção, alíquota 11%, vb na faixa) → 0 alertas", () => {
    const calc = buildCalc({ vb: 50_000, matPct: 35, alq: 0.11, dedDCTF: 0 });
    const r = avaliarConsistencias(buildParams({ calc }));
    expect(r).toEqual([]);
  });

  it("cenário ideal de empreitada total (matPct=100, alq=11%) → 0 alertas", () => {
    const calc = buildCalc({ vb: 50_000, matPct: 100, alq: 0.11 });
    const r = avaliarConsistencias(
      buildParams({ tipoEmpreitada: "total", calc }),
    );
    expect(r).toEqual([]);
  });
});
