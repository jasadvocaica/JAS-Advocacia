// Motor de sincronização do Zernio. Cada etapa grava o cursor depois de cada página:
// se o worker cair, a próxima execução continua de onde parou (a gravação é upsert, sem duplicar).
import {
  ErroZernio,
  mapAnuncio,
  mapCampanha,
  mapComentarios,
  mapConjunto,
  mapConta,
  mapConversa,
  mapDiaAnuncios,
  mapPublicacao,
  type ClienteZernio,
} from "./zernio.ts";

export const ETAPAS = ["contas", "publicacoes", "comentarios", "conversas", "campanhas", "conjuntos", "anuncios", "anuncios_diario"] as const;
export type Etapa = (typeof ETAPAS)[number];
type J = Record<string, unknown>;

export interface EstadoJob {
  id: string;
  etapa_atual: Etapa | null;
  cursores: Record<string, J>;
  progresso: Record<string, number>;
}

export interface Armazem {
  gravar(recurso: string, linhas: J[]): Promise<number>;
  salvarProgresso(job: EstadoJob): Promise<void>;
  log(nivel: "info" | "aviso" | "erro", recurso: string, mensagem: string, http?: number | null): Promise<void>;
  contasSelecionadas(): Promise<{ externo_id: string; plataforma: string }[]>;
  marcarAddon(recurso: "analytics" | "inbox" | "ads", disponivel: boolean): Promise<void>;
}

export interface ResultadoSync {
  estado: "concluido" | "parcial" | "continua";
  falhas: string[];
  indisponiveis: string[];
}

const dia = (d: Date) => d.toISOString().slice(0, 10);
const diasAtras = (n: number, base = new Date()) => dia(new Date(base.getTime() - n * 864e5));

/** Janela incremental: desde a última sincronização bem-sucedida, com 7 dias de folga para atualizar métricas. Primeira vez: 90 dias. */
export function janela(ultimoOk: string | null, agora = new Date()): { de: string; ate: string } {
  if (!ultimoOk) return { de: diasAtras(90, agora), ate: dia(agora) };
  const de = new Date(Math.max(Date.parse(ultimoOk) - 7 * 864e5, agora.getTime() - 365 * 864e5));
  return { de: dia(de), ate: dia(agora) };
}

const SOCIAIS = new Set(["instagram"]);
const ANUNCIOS = new Set(["metaads"]);

export async function sincronizar(args: {
  api: ClienteZernio;
  armazem: Armazem;
  job: EstadoJob;
  ultimoOk: string | null;
  prazoMs: number;
  agora?: () => number;
}): Promise<ResultadoSync> {
  const { api, armazem, job } = args;
  const agora = args.agora ?? Date.now;
  const fim = agora() + args.prazoMs;
  const { de, ate } = janela(args.ultimoOk);
  const falhas: string[] = [];
  const indisponiveis: string[] = [];
  const contar = (etapa: string, n: number) => { job.progresso[etapa] = (job.progresso[etapa] ?? 0) + n; };
  const cur = (e: Etapa) => (job.cursores[e] ??= {});

  const inicio = job.etapa_atual ? ETAPAS.indexOf(job.etapa_atual) : 0;
  for (let i = Math.max(0, inicio); i < ETAPAS.length; i++) {
    const etapa = ETAPAS[i];
    job.etapa_atual = etapa;
    if (cur(etapa).feito) continue;
    try {
      // Cada passo processa uma página e devolve true quando a etapa terminou.
      let terminou = false;
      while (!terminou) {
        if (agora() > fim) {
          await armazem.salvarProgresso(job);
          return { estado: "continua", falhas, indisponiveis };
        }
        terminou = await passo(etapa);
        await armazem.salvarProgresso(job);
      }
      cur(etapa).feito = true;
      await armazem.salvarProgresso(job);
    } catch (e) {
      if (!(e instanceof ErroZernio)) throw e;
      if (e.tipo === "autenticacao") throw e;
      if (e.tipo === "limite") throw e; // o job é adiado pelo chamador e retoma do cursor
      if (e.tipo === "addon") {
        indisponiveis.push(etapa);
        await armazem.marcarAddon(etapa === "publicacoes" ? "analytics" : etapa === "comentarios" || etapa === "conversas" ? "inbox" : "ads", false);
        await armazem.log("aviso", etapa, `Recurso não liberado no plano do Zernio: ${e.message}`, e.status);
      } else {
        falhas.push(etapa);
        await armazem.log("erro", etapa, e.message, e.status);
      }
      cur(etapa).feito = true;
      await armazem.salvarProgresso(job);
    }
  }
  job.etapa_atual = null;
  return { estado: falhas.length ? "parcial" : "concluido", falhas, indisponiveis };

  async function passo(etapa: Etapa): Promise<boolean> {
    const c = cur(etapa);
    switch (etapa) {
      case "contas": {
        const r = await api.get<{ accounts: J[]; hasAnalyticsAccess?: boolean; pagination?: { nextCursor?: string | null } }>(
          "/v1/accounts", { limit: 100, cursor: c.cursor as string | undefined });
        contar(etapa, await armazem.gravar("contas", (r.dados.accounts ?? []).map(mapConta)));
        if (typeof r.dados.hasAnalyticsAccess === "boolean") await armazem.marcarAddon("analytics", r.dados.hasAnalyticsAccess);
        c.cursor = r.dados.pagination?.nextCursor ?? null;
        return !c.cursor;
      }
      case "publicacoes": {
        const pagina = Number(c.pagina ?? 1);
        const r = await api.get<{ posts?: J[]; pagination?: J }>("/v1/analytics",
          { platform: "instagram", source: "all", fromDate: de, toDate: ate, limit: 50, page: pagina });
        const itens = (r.dados.posts ?? []).map(mapPublicacao).filter((x): x is NonNullable<typeof x> => !!x);
        contar(etapa, await armazem.gravar("publicacoes", itens.map((x) => ({ ...x.post, metricas: x.metricas, data: ate }))));
        await armazem.marcarAddon("analytics", true);
        const paginas = Number((r.dados.pagination ?? {}).pages ?? (r.dados.pagination ?? {}).totalPages ?? 0);
        c.pagina = pagina + 1;
        return itens.length < 50 || (paginas > 0 && pagina >= paginas);
      }
      case "comentarios": {
        // 1) lista as publicações com comentários (GET /v1/inbox/comments, cursor); 2) lê os comentários de cada uma.
        const fila = (c.fila as { id: string; conta: string }[]) ?? [];
        if (!c.listado) {
          const contas = new Set((await armazem.contasSelecionadas()).filter((x) => SOCIAIS.has(x.plataforma)).map((x) => x.externo_id));
          const r = await api.get<{ data?: J[]; pagination?: { hasMore?: boolean; nextCursor?: string | null } }>(
            "/v1/inbox/comments", { platform: "instagram", since: de, limit: 50, cursor: c.cursor as string | undefined });
          const vistos = new Set(fila.map((x) => x.id));
          for (const p of r.dados.data ?? []) {
            const id = String(p.id), conta = String(p.accountId ?? "");
            if (!vistos.has(id) && Number(p.commentCount ?? 0) > 0 && (!contas.size || contas.has(conta))) {
              fila.push({ id, conta });
              vistos.add(id);
            }
          }
          c.fila = fila;
          c.cursor = r.dados.pagination?.hasMore ? r.dados.pagination?.nextCursor ?? null : null;
          // limite por rodada: até 25 publicações; o restante entra na próxima sincronização incremental
          if (!c.cursor || fila.length >= 25) c.listado = true;
          return false;
        }
        const feito = Number(c.feito_ate ?? 0);
        if (feito >= Math.min(fila.length, 25)) { await armazem.marcarAddon("inbox", true); return true; }
        const p = fila[feito];
        const r = await api.get<{ comments?: J[] }>(`/v1/inbox/comments/${encodeURIComponent(p.id)}`, { accountId: p.conta, limit: 50 });
        contar(etapa, await armazem.gravar("comentarios", mapComentarios(p.id, p.conta, r.dados.comments ?? [])));
        c.feito_ate = feito + 1;
        return false;
      }
      case "conversas": {
        const contas = (await armazem.contasSelecionadas()).filter((x) => SOCIAIS.has(x.plataforma));
        if (!contas.length) return true;
        const r = await api.get<{ data?: J[]; pagination?: { hasMore?: boolean; nextCursor?: string | null } }>(
          "/v1/inbox/conversations", { platform: "instagram", limit: 100, cursor: c.cursor as string | undefined });
        const permitidas = new Set(contas.map((x) => x.externo_id));
        const linhas = (r.dados.data ?? []).map(mapConversa).filter((x) => !x.conta_externa_id || permitidas.has(x.conta_externa_id));
        contar(etapa, await armazem.gravar("conversas", linhas));
        c.cursor = r.dados.pagination?.hasMore ? r.dados.pagination?.nextCursor ?? null : null;
        return !c.cursor;
      }
      case "campanhas":
      case "conjuntos":
      case "anuncios": {
        const contas = (await armazem.contasSelecionadas()).filter((x) => ANUNCIOS.has(x.plataforma));
        const idx = Number(c.conta ?? 0);
        if (idx >= contas.length) return true;
        const conta = contas[idx].externo_id;
        const pagina = Number(c.pagina ?? 1);
        const caminho = etapa === "campanhas" ? "/v1/ads/campaigns" : etapa === "conjuntos" ? "/v1/ads/ad-sets" : "/v1/ads";
        const params: J = { accountId: conta, page: pagina, limit: 100 };
        if (etapa !== "conjuntos") Object.assign(params, { fromDate: de, toDate: ate });
        const r = await api.get<{ campaigns?: J[]; adSets?: J[]; ads?: J[]; pagination?: { pages?: number } }>(caminho, params);
        const linhas = etapa === "campanhas" ? (r.dados.campaigns ?? []).map((x) => mapCampanha(x, de, ate))
          : etapa === "conjuntos" ? (r.dados.adSets ?? []).map(mapConjunto)
            : (r.dados.ads ?? []).map((x) => mapAnuncio(x, de, ate));
        contar(etapa, await armazem.gravar(etapa, linhas));
        if (r.status === 202) await armazem.log("aviso", etapa, "Meta ainda importando histórico (backfill). Dados parciais nesta rodada.", 202);
        const paginas = Number(r.dados.pagination?.pages ?? 0);
        if (linhas.length && pagina < paginas) c.pagina = pagina + 1;
        else { c.conta = idx + 1; c.pagina = 1; }
        return Number(c.conta ?? 0) >= contas.length;
      }
      case "anuncios_diario": {
        const contas = (await armazem.contasSelecionadas()).filter((x) => ANUNCIOS.has(x.plataforma));
        const idx = Number(c.conta ?? 0);
        if (idx >= contas.length) return true;
        const conta = contas[idx].externo_id;
        const r = await api.get<{ rows?: J[] }>("/v1/ads/timeline", { accountId: conta, fromDate: de, toDate: ate });
        contar(etapa, await armazem.gravar("anuncios_diario", (r.dados.rows ?? []).map((x) => mapDiaAnuncios(conta, x))));
        c.conta = idx + 1;
        return idx + 1 >= contas.length;
      }
    }
  }
}
