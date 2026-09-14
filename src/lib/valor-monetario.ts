/**
 * Interpreta entrada monetária brasileira sem converter "1.234,56" em 1.234.
 * Retorna null para campo vazio ou formato ambíguo/inválido.
 */
export function parseValorMonetarioBR(valor: string): number | null {
  const entrada = valor.trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (!entrada) return null;

  const formatoBR = /^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/;
  const formatoSimples = /^\d+(?:[.,]\d{1,2})?$/;
  if (!formatoBR.test(entrada) && !formatoSimples.test(entrada)) return null;

  const normalizado = entrada.includes(",")
    ? entrada.replace(/\./g, "").replace(",", ".")
    : formatoBR.test(entrada)
      ? entrada.replace(/\./g, "")
      : entrada;
  const numero = Number(normalizado);
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
}
