/** Somente URLs configuradas pela gestora; nada do CRM vira consulta de busca. */
export function prepararFontesPublicas(raw: unknown) {
  if (!Array.isArray(raw) || raw.length > 8) throw new Error("Use até oito fontes públicas");
  const urls = [...new Set(raw.map(v => {
    if (typeof v !== "string" || v.length > 300) throw new Error("Fonte inválida");
    const u = new URL(v);
    if (u.protocol !== "https:" || u.username || u.password || u.port || u.search || u.hash ||
      !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(u.hostname) || /(^localhost$|\.(local|internal|invalid|test)$)/i.test(u.hostname))
      throw new Error("Use URLs HTTPS públicas sem parâmetros ou credenciais");
    return u.toString();
  }))];
  return { urls, dominios: [...new Set(urls.map(u => new URL(u).hostname.replace(/^www\./, "")))] };
}
