import { describe, expect, it } from "vitest";
import { parseValorMonetarioBR } from "./valor-monetario";

describe("parseValorMonetarioBR", () => {
  it("interpreta a moeda brasileira sem perder os milhares", () => {
    expect(parseValorMonetarioBR("1.234,56")).toBe(1234.56);
    expect(parseValorMonetarioBR("R$ 12.345,67")).toBe(12345.67);
    expect(parseValorMonetarioBR("1.234")).toBe(1234);
  });

  it("aceita valores simples e distingue vazio de zero", () => {
    expect(parseValorMonetarioBR("1234,56")).toBe(1234.56);
    expect(parseValorMonetarioBR("1234.56")).toBe(1234.56);
    expect(parseValorMonetarioBR("0,00")).toBe(0);
    expect(parseValorMonetarioBR("")).toBeNull();
  });

  it("rejeita renda malformada ou negativa", () => {
    expect(parseValorMonetarioBR("1.23,456")).toBeNull();
    expect(parseValorMonetarioBR("-100")).toBeNull();
    expect(parseValorMonetarioBR("abc")).toBeNull();
  });
});
