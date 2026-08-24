// Mascara o número CNJ para exibição no portal do cliente.
// Mantém apenas o ano e o tribunal (parte final), ocultando o sequencial.
// Ex.: "0001234-56.2024.8.13.0024" -> "•••••••-••.2024.8.13.0024"
export function maskCnj(numero?: string | null): string {
  if (!numero) return "Processo administrativo";
  const limpo = numero.trim();
  // CNJ formatado: NNNNNNN-DD.AAAA.J.TR.OOOO
  const m = limpo.match(/^\d{7}-\d{2}\.(\d{4})\.(\d)\.(\d{2})\.(\d{4})$/);
  if (m) {
    const [, ano, j, tr, oooo] = m;
    return `•••••••-••.${ano}.${j}.${tr}.${oooo}`;
  }
  // fallback: mostra só os últimos 4 dígitos
  const digits = limpo.replace(/\D/g, "");
  if (digits.length >= 4) return `••••• ${digits.slice(-4)}`;
  return "Processo";
}
