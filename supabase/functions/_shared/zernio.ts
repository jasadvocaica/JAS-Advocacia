// Cliente da API do Zernio (https://docs.zernio.com), sem dependência de Deno: testável no vitest.
// Só usa endpoints conferidos na documentação oficial em 01/11/2026:
//   GET  /v1/accounts                         contas conectadas (cursor: limit + pagination.nextCursor)
//   GET  /v1/analytics                        publicações com métricas (page/limit, fromDate/toDate, máx. 366 dias)
//   GET  /v1/inbox/comments                   publicações com comentários (cursor; Inbox add-on)
//   GET  /v1/inbox/comments/{postId}          comentários de uma publicação (accountId; pagination.cursor)
//   POST /v1/inbox/comments/{postId}          responder comentário (Idempotency-Key) — só com aprovação
//   GET  /v1/inbox/conversations              conversas (cursor, limit ≤ 100; Inbox add-on)
//   GET  /v1/ads/campaigns                    campanhas com métricas (page/limit, fromDate/toDate)
//   GET  /v1/ads/ad-sets                      conjuntos de anúncios (page/limit)
//   GET  /v1/ads                              anúncios com métricas (page/limit)
//   GET  /v1/ads/timeline                     métricas diárias da conta de anúncios (accountId)
// Autenticação: Authorization: Bearer sk_… · Limites: X-RateLimit-* e Retry-After no 429.

export const ZERNIO_BASE = "https://zernio.com/api";
const FORMATO_CHAVE = /^sk_[0-9a-f]{64}$/i;

export type TipoErro = "autenticacao" | "addon" | "limite" | "transitorio" | "requisicao" | "conexao_anuncios";

export class ErroZernio extends Error {
  constructor(
    message: string,
    readonly tipo: TipoErro,
    readonly status: number,
    readonly codigo: string | null = null,
    readonly esperarSegundos: number | null = null,
  ) {
    super(message);
  }
}

export function chaveValida(chave: string): boolean {
  return FORMATO_CHAVE.test(chave.trim());
}

/** Mostra só o começo e o fim: sk_a1b2…9f0e. */
export function mascarar(chave: string): string {
  const c = chave.trim();
  return c.length < 12 ? "••••" : `${c.slice(0, 7)}…${c.slice(-4)}`;
}

/** Remove qualquer coisa parecida com a chave de mensagens que vão para log. */
export function semSegredos(texto: string): string {
  return texto.replace(/sk_[0-9a-z]{8,}/gi, "sk_•••").replace(/Bearer\s+\S+/gi, "Bearer •••").slice(0, 1000);
}

function classificar(status: number, corpo: Record<string, unknown> | null, retryAfter: number | null): ErroZernio {
  const codigo = typeof corpo?.code === "string" ? corpo.code : null;
  const msg = semSegredos(typeof corpo?.error === "string" ? corpo.error : `HTTP ${status}`);
  if (status === 401) return new ErroZernio("Chave de API inválida, revogada ou expirada.", "autenticacao", status, codigo);
  if (status === 402 || (status === 403 && /addon|add-on|access required/i.test(msg)))
    return new ErroZernio(msg, "addon", status, codigo);
  if (status === 409 && codigo === "ads_connection_required")
    return new ErroZernio("A conta de anúncios precisa ser reconectada no Zernio.", "conexao_anuncios", status, codigo);
  if (status === 429) return new ErroZernio(msg, "limite", status, codigo, retryAfter ?? 30);
  if (status === 502 || status === 503 || status === 504 || status === 500)
    return new ErroZernio(msg, "transitorio", status, codigo, retryAfter);
  return new ErroZernio(msg, "requisicao", status, codigo);
}

export interface OpcoesCliente {
  chave: string;
  fetcher?: typeof fetch;
  esperar?: (ms: number) => Promise<void>;
  tentativas?: number;
  aoChamar?: (info: { metodo: string; caminho: string; status: number; ms: number }) => void;
}

/** Faz a chamada com retentativa (429, 5xx e falha de rede) e respeita Retry-After e X-RateLimit-*. */
export function criarCliente(o: OpcoesCliente) {
  const fetcher = o.fetcher ?? fetch;
  const esperar = o.esperar ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const maxTentativas = o.tentativas ?? 3;

  async function chamar<T>(metodo: "GET" | "POST", caminho: string, params: Record<string, unknown> = {},
    corpo?: unknown, extras: Record<string, string> = {}): Promise<{ status: number; dados: T }> {
    const url = new URL(ZERNIO_BASE + caminho);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    let ultimo: ErroZernio | null = null;
    for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
      const inicio = Date.now();
      let resp: Response;
      try {
        resp = await fetcher(url.toString(), {
          method: metodo,
          redirect: "error",
          headers: { Authorization: `Bearer ${o.chave.trim()}`, Accept: "application/json",
            ...(corpo ? { "Content-Type": "application/json" } : {}), ...extras },
          body: corpo ? JSON.stringify(corpo) : undefined,
        });
      } catch {
        ultimo = new ErroZernio("Sem resposta do Zernio (rede).", "transitorio", 0);
        if (tentativa < maxTentativas) await esperar(1000 * 2 ** (tentativa - 1));
        continue;
      }
      o.aoChamar?.({ metodo, caminho, status: resp.status, ms: Date.now() - inicio });
      const retryAfter = Number(resp.headers.get("retry-after")) || null;
      const texto = await resp.text();
      let json: Record<string, unknown> | null = null;
      try { json = texto ? JSON.parse(texto) : null; } catch { json = null; }
      if (resp.ok) {
        // Janela quase cheia: espera a próxima vaga antes de continuar (no máximo 10 s).
        const restante = Number(resp.headers.get("x-ratelimit-remaining"));
        const reset = Number(resp.headers.get("x-ratelimit-reset"));
        if (Number.isFinite(restante) && restante <= 2 && Number.isFinite(reset) && reset > 0)
          await esperar(Math.min(10000, Math.max(0, reset * 1000 - Date.now())));
        return { status: resp.status, dados: json as T };
      }
      ultimo = classificar(resp.status, json, retryAfter);
      const repetir = ultimo.tipo === "transitorio" || (ultimo.tipo === "limite" && (ultimo.esperarSegundos ?? 0) <= 20);
      if (!repetir || tentativa === maxTentativas) throw ultimo;
      await esperar(Math.max(1000 * 2 ** (tentativa - 1), (ultimo.esperarSegundos ?? 0) * 1000));
    }
    throw ultimo ?? new ErroZernio("Falha desconhecida", "transitorio", 0);
  }

  return {
    get: <T>(caminho: string, params?: Record<string, unknown>) => chamar<T>("GET", caminho, params),
    post: <T>(caminho: string, corpo: unknown, idempotencia: string) =>
      chamar<T>("POST", caminho, {}, corpo, { "Idempotency-Key": idempotencia }),
  };
}
export type ClienteZernio = ReturnType<typeof criarCliente>;

// ------------------------------------------------------------------ criptografia da chave
// AES-256-GCM com a chave estrutural do servidor (COFRE_ENCRYPTION_KEY, a mesma do cofre),
// derivada com um rótulo próprio para que a cifra do Zernio não sirva em outro lugar.

async function chaveAes(segredo: string): Promise<CryptoKey> {
  if (!segredo || segredo.length < 16) throw new Error("Chave de criptografia do servidor ausente.");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`jas-zernio:${segredo}`));
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const deB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function cifrar(texto: string, segredo: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await chaveAes(segredo), new TextEncoder().encode(texto)));
  return `v1.${b64(iv)}.${b64(ct)}`;
}

export async function decifrar(cifra: string, segredo: string): Promise<string> {
  const [versao, iv, ct] = cifra.split(".");
  if (versao !== "v1" || !iv || !ct) throw new Error("Credencial em formato desconhecido.");
  const plano = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(iv) }, await chaveAes(segredo), deB64(ct));
  return new TextDecoder().decode(plano);
}

// ------------------------------------------------------------------ conversão para as tabelas do JAS
type J = Record<string, unknown>;
const txt = (v: unknown) => (typeof v === "string" && v ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const bool = (v: unknown) => (typeof v === "boolean" ? v : null);
const obj = (v: unknown): J => (v && typeof v === "object" && !Array.isArray(v) ? (v as J) : {});

export function mapConta(a: J) {
  return {
    externo_id: String(a._id),
    plataforma: String(a.platform ?? "desconhecida"),
    perfil_id: txt(a.profileId),
    usuario: txt(a.username),
    nome: txt(a.displayName),
    foto_url: txt(a.profilePicture),
    url_perfil: txt(a.profileUrl),
    plataforma_usuario_id: txt(a.platformUserId),
    ativa: bool(a.isActive) ?? false,
    precisa_reconectar: bool(a.needsReconnection) ?? false,
    seguidores: num(a.followersCount),
    seguidores_em: txt(a.followersLastUpdated),
    conta_pai_externa: txt(a.parentAccountId),
  };
}

/** Publicação vinda de GET /v1/analytics. A documentação não detalha o item: lemos os nomes usuais com cautela. */
export function mapPublicacao(p: J) {
  const externo = txt(p._id) ?? txt(p.postId) ?? txt(p.id);
  if (!externo) return null;
  const an = obj(p.analytics);
  return {
    post: {
      externo_id: externo,
      conta_externa_id: txt(p.accountId),
      plataforma: txt(p.platform) ?? "instagram",
      origem: p.isExternal === true || p.source === "external" ? "externo" : "zernio",
      conteudo: txt(p.content),
      url: txt(p.platformPostUrl) ?? txt(p.permalink) ?? txt(p.url),
      tipo_midia: txt(p.mediaType),
      thumbnail: txt(p.thumbnailUrl),
      publicado_em: txt(p.publishedAt),
      estado: txt(p.status),
    },
    metricas: {
      impressoes: num(an.impressions), alcance: num(an.reach), curtidas: num(an.likes), comentarios: num(an.comments),
      compartilhamentos: num(an.shares), salvamentos: num(an.saves), cliques: num(an.clicks), visualizacoes: num(an.views),
      taxa_engajamento: num(an.engagementRate), atualizado_plataforma: txt(an.lastUpdated),
    },
  };
}

export function mapComentarios(postId: string, contaId: string, lista: J[]) {
  const linhas: J[] = [];
  const visitar = (c: J, pai: string | null) => {
    const de = obj(c.from);
    linhas.push({
      externo_id: `${c.platform ?? "x"}:${c.id}`,
      post_externo_id: postId,
      conta_externa_id: contaId,
      plataforma: txt(c.platform) ?? "instagram",
      autor_nome: txt(de.name),
      autor_usuario: txt(de.username),
      autor_id: txt(de.id),
      do_escritorio: bool(de.isOwner) ?? false,
      texto: txt(c.message),
      criado_em_plataforma: txt(c.createdTime),
      curtidas: num(c.likeCount),
      respostas: num(c.replyCount),
      pai_externo_id: pai ?? txt(c.parentId),
      oculto: bool(c.isHidden) ?? false,
      pode_responder: bool(c.canReply) ?? false,
      comentario_id: String(c.id),
    });
    for (const r of Array.isArray(c.replies) ? (c.replies as J[]) : []) visitar(r, String(c.id));
  };
  for (const c of lista) visitar(c, null);
  return linhas;
}

export function mapConversa(c: J) {
  return {
    externo_id: String(c.id),
    conta_externa_id: txt(c.accountId),
    plataforma: txt(c.platform) ?? "instagram",
    participante_nome: txt(c.participantName),
    participante_id: txt(c.participantId),
    ultima_mensagem: txt(c.lastMessage)?.slice(0, 500) ?? null,
    atualizado_plataforma: txt(c.updatedTime),
    estado: txt(c.status),
    nao_lidas: num(c.unreadCount),
  };
}

export function mapCampanha(c: J, de: string, ate: string) {
  return {
    externo_id: String(c.platformCampaignId),
    conta_externa_id: txt(c.accountId),
    conta_anuncio_id: txt(c.platformAdAccountId),
    nome: txt(c.campaignName),
    estado: txt(c.status),
    objetivo: txt(c.platformObjective),
    orcamento: c.budget ?? null,
    moeda: txt(c.currency),
    metricas: c.metrics ?? null,
    periodo_de: de,
    periodo_ate: ate,
  };
}

export function mapConjunto(s: J) {
  return {
    externo_id: String(s.platformAdSetId),
    campanha_externa_id: txt(s.platformCampaignId),
    nome: txt(s.adSetName),
    estado: txt(s.status),
    orcamento: s.budget ?? null,
    otimizacao: txt(s.optimizationGoal),
    moeda: txt(s.currency),
  };
}

export function mapAnuncio(a: J, de: string, ate: string) {
  return {
    externo_id: txt(a.platformAdId) ?? String(a._id),
    zernio_id: txt(a._id),
    campanha_externa_id: txt(a.platformCampaignId),
    conjunto_externo_id: txt(a.platformAdSetId),
    nome: txt(a.name),
    estado: txt(a.status),
    tipo: txt(a.adType),
    criativo: a.creative ?? null,
    moeda: null,
    metricas: a.metrics ?? null,
    periodo_de: de,
    periodo_ate: ate,
  };
}

export function mapDiaAnuncios(contaId: string, r: J) {
  return {
    nivel: "conta",
    referencia: contaId,
    data: String(r.date),
    moeda: txt(r.currency) ?? "",
    gasto: num(r.spend), impressoes: num(r.impressions), alcance: num(r.reach), cliques: num(r.clicks),
    ctr: num(r.ctr), cpc: num(r.cpc), cpm: num(r.cpm), conversoes: num(r.conversions),
    extras: { engagement: num(r.engagement), costPerConversion: num(r.costPerConversion), roas: num(r.roas) },
  };
}
