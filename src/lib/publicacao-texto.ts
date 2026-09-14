/**
 * Mostra publicações do DJEN como texto legível, sem renderizar HTML recebido
 * de fonte externa. O conteúdo bruto permanece intacto no banco para auditoria.
 */
export function textoLegivelPublicacao(valor: string | null | undefined): string {
  if (!valor) return "";

  const decodificar = (texto: string): string => {
    const caixa = document.createElement("textarea");
    caixa.innerHTML = texto;
    return caixa.value;
  };

  // O PJe pode entregar tags e entidades HTML, às vezes codificadas duas vezes.
  const entrada = decodificar(decodificar(valor));
  const semElementosAtivos = entrada
    .replace(/<(script|style|noscript|iframe|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, " ");
  const comQuebras = semElementosAtivos
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|section|article|header|footer|tr|li|h[1-6])\s*>/gi, "\n")
    .replace(/<\/(?:td|th)\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  return comQuebras
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
