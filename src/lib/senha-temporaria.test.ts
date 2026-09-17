import { describe, expect, it } from "vitest";
import { gerarSenhaTemporaria } from "../../supabase/functions/_shared/senha-temporaria";

describe("gerarSenhaTemporaria", () => {
  it("gera senha forte com todas as classes obrigatórias", () => {
    const senha = gerarSenhaTemporaria();
    expect(senha).toHaveLength(20);
    expect(senha).toMatch(/[A-Z]/);
    expect(senha).toMatch(/[a-z]/);
    expect(senha).toMatch(/[0-9]/);
    expect(senha).toMatch(/[!@#$%*_-]/);
  });

  it("não reutiliza uma credencial previsível", () => {
    const senhas = new Set(Array.from({ length: 32 }, () => gerarSenhaTemporaria()));
    expect(senhas.size).toBe(32);
    expect([...senhas].some((senha) => senha === "cliente123#")).toBe(false);
  });

  it("rejeita tamanho inseguro", () => {
    expect(() => gerarSenhaTemporaria(8)).toThrow();
  });
});
