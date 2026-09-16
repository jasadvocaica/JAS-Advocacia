import { isValidCpfCnpj } from "@/lib/cpf";
import { onlyDigits } from "@/lib/format";

export function telefoneBrasileiroOpcionalValido(valor: string): boolean {
  const digitos = onlyDigits(valor);
  return digitos.length === 0 || digitos.length === 10 || digitos.length === 11;
}

export function cepBrasileiroOpcionalValido(valor: string): boolean {
  const digitos = onlyDigits(valor);
  return digitos.length === 0 || digitos.length === 8;
}

export function erroResponsavelLegal(
  idade: number | null,
  nome: string,
  cpf: string,
): string | null {
  if (idade === null || idade >= 18) return null;
  if (!nome.trim()) return "Informe o nome do responsável legal";
  const documento = onlyDigits(cpf);
  if (documento.length !== 11 || !isValidCpfCnpj(documento)) {
    return "Informe um CPF válido para o responsável legal";
  }
  return null;
}
