import { describe, expect, it } from "vitest";
import {
  cepBrasileiroOpcionalValido,
  erroResponsavelLegal,
  telefoneBrasileiroOpcionalValido,
} from "./validacoes-cadastro-cliente";

describe("validações do cadastro de clientes", () => {
  it("aceita telefone vazio ou brasileiro com 10/11 dígitos", () => {
    expect(telefoneBrasileiroOpcionalValido("")).toBe(true);
    expect(telefoneBrasileiroOpcionalValido("(65) 3333-4444")).toBe(true);
    expect(telefoneBrasileiroOpcionalValido("(65) 99999-4444")).toBe(true);
    expect(telefoneBrasileiroOpcionalValido("123")).toBe(false);
  });

  it("aceita CEP vazio ou com oito dígitos", () => {
    expect(cepBrasileiroOpcionalValido("")).toBe(true);
    expect(cepBrasileiroOpcionalValido("78000-000")).toBe(true);
    expect(cepBrasileiroOpcionalValido("7800")).toBe(false);
  });

  it("não exige responsável legal para adulto", () => {
    expect(erroResponsavelLegal(18, "", "")).toBeNull();
    expect(erroResponsavelLegal(null, "", "")).toBeNull();
  });

  it("exige nome e CPF válido para menor de idade", () => {
    expect(erroResponsavelLegal(16, "", "")).toBe("Informe o nome do responsável legal");
    expect(erroResponsavelLegal(16, "Maria", "123")).toBe("Informe um CPF válido para o responsável legal");
    expect(erroResponsavelLegal(16, "Maria", "529.982.247-25")).toBeNull();
  });
});
