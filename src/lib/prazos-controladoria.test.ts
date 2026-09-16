import { describe, expect, it } from "vitest";
import {
  limitarAntecedenciaInterna,
  prazoInternoNaoUltrapassaJudicial,
} from "./prazos-controladoria";

describe("prazos da Controladoria", () => {
  it("limita a antecedência entre zero e trinta dias", () => {
    expect(limitarAntecedenciaInterna(-2)).toBe(0);
    expect(limitarAntecedenciaInterna(7.9)).toBe(7);
    expect(limitarAntecedenciaInterna(50)).toBe(30);
    expect(limitarAntecedenciaInterna(Number.NaN)).toBe(0);
  });

  it("aceita prazo interno anterior ou igual ao judicial", () => {
    const judicial = new Date("2026-09-21T00:00:00");
    expect(prazoInternoNaoUltrapassaJudicial(judicial, new Date("2026-09-18T00:00:00"))).toBe(true);
    expect(prazoInternoNaoUltrapassaJudicial(judicial, new Date("2026-09-21T00:00:00"))).toBe(true);
  });

  it("rejeita prazo interno posterior ao judicial", () => {
    expect(
      prazoInternoNaoUltrapassaJudicial(
        new Date("2026-09-21T00:00:00"),
        new Date("2026-09-22T00:00:00"),
      ),
    ).toBe(false);
  });

  it("não bloqueia formulários que ainda estão incompletos", () => {
    expect(prazoInternoNaoUltrapassaJudicial(undefined, undefined)).toBe(true);
  });
});
