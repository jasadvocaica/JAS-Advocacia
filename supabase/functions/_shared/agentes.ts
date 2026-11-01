export function agenteNativo(slug: string): boolean {
  return slug === "monitor-djen" || slug === "monitor-prazos";
}

export function permissaoAgente(acao: unknown): "criar" | "editar" | null {
  if (acao === "disparar") return "criar";
  if (acao === "decidir" || acao === "cancelar") return "editar";
  return null;
}

export function destinoN8n(webhook: string, base: string): string {
  if (!base) throw new Error("Configure N8N_BASE_URL para este agente externo.");
  const origem = new URL(base);
  const url = new URL(webhook, origem);
  if (origem.protocol !== "https:" || url.origin !== origem.origin || url.username || url.password) {
    throw new Error("Webhook deve usar HTTPS e pertencer ao servidor n8n configurado.");
  }
  return url.href;
}
