import { ETAPAS_ORDEM, etapaAtualDe, type EtapaWorkflow } from "@/pages/controladoria/workflow";

/**
 * Lógica pura do Painel da Juliana.
 *
 * Regras:
 * - Nenhum dado é inventado: tudo deriva de colunas reais de `controladoria_itens`,
 *   `processos`, `clientes`, `pje_publicacoes` e `producao_juridica_pendencias`.
 * - Nenhuma regra de transição de etapa é duplicada aqui — apenas leitura.
 */

export interface ItemPainel {
  id: string;
  titulo: string;
  tipo: string;
  status: string;
  prioridade: string | null;
  data_vencimento: string | null;
  criado_em: string | null;
  etapa_workflow: string | null;
  etapa_atualizada_em: string | null;
  exige_revisao: boolean | null;
  responsavel_id: string | null;
  executor_id: string | null;
  revisor_id: string | null;
  corretor_id: string | null;
  protocolador_id: string | null;
  sla_previsto_em: string | null;
  sla_status: string | null;
  cliente_nome?: string | null;
  processo_cnj?: string | null;
  responsavel_nome?: string | null;
}

export type Urgencia = "atrasado" | "hoje" | "amanha" | "semana" | "futuro" | "sem_prazo";
export type Saude = "normal" | "atencao" | "atrasado";

const PRIORIDADE_PESO: Record<string, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 };
const URGENCIA_PESO: Record<Urgencia, number> = {
  atrasado: 0, hoje: 1, amanha: 2, semana: 3, futuro: 4, sem_prazo: 5,
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Item ainda demanda trabalho (não concluído, não cancelado, não finalizado). */
export function itemAtivo(it: ItemPainel): boolean {
  if (it.status === "concluido" || it.status === "cancelado") return false;
  return etapaAtualDe(it) !== "finalizado";
}

export function classificarUrgencia(it: ItemPainel, agora = new Date()): Urgencia {
  if (!it.data_vencimento) return "sem_prazo";
  const hoje = startOfDay(agora);
  const venc = startOfDay(new Date(it.data_vencimento));
  const dias = Math.round((venc.getTime() - hoje.getTime()) / 86_400_000);
  if (dias < 0) return "atrasado";
  if (dias === 0) return "hoje";
  if (dias === 1) return "amanha";
  // Restante da semana corrente (segunda a domingo).
  const diaSemana = (hoje.getDay() + 6) % 7; // 0 = segunda
  const diasAteFimSemana = 6 - diaSemana;
  if (dias <= diasAteFimSemana) return "semana";
  return "futuro";
}

/** Responsável da etapa atual, caindo no responsável geral quando a etapa não tem campo próprio. */
export function responsavelDaEtapa(it: ItemPainel): string | null {
  const etapa = etapaAtualDe(it);
  const porEtapa: Record<EtapaWorkflow, string | null> = {
    criacao: null,
    execucao: it.executor_id,
    revisao: it.revisor_id,
    correcao: it.corretor_id,
    protocolo: it.protocolador_id,
    finalizado: null,
  };
  return porEtapa[etapa] ?? it.responsavel_id ?? null;
}

/** Existe vínculo real do usuário com o item (etapa atual ou titularidade). */
export function dependeDe(it: ItemPainel, userId: string): boolean {
  return responsavelDaEtapa(it) === userId || it.responsavel_id === userId;
}

export function ordenarPorUrgencia(itens: ItemPainel[], agora = new Date()): ItemPainel[] {
  return [...itens].sort((a, b) => {
    const ua = URGENCIA_PESO[classificarUrgencia(a, agora)];
    const ub = URGENCIA_PESO[classificarUrgencia(b, agora)];
    if (ua !== ub) return ua - ub;
    const pa = PRIORIDADE_PESO[a.prioridade ?? "media"] ?? 2;
    const pb = PRIORIDADE_PESO[b.prioridade ?? "media"] ?? 2;
    if (pa !== pb) return pa - pb;
    const ta = new Date(a.etapa_atualizada_em ?? a.criado_em ?? 0).getTime();
    const tb = new Date(b.etapa_atualizada_em ?? b.criado_em ?? 0).getTime();
    return ta - tb; // mais antigo primeiro
  });
}

/** Fila de revisão: somente etapa `revisao` com dependência real do usuário. */
export function filaRevisao(itens: ItemPainel[], userId: string, agora = new Date()): ItemPainel[] {
  const fila = itens.filter(
    (it) => itemAtivo(it) && etapaAtualDe(it) === "revisao" && dependeDe(it, userId),
  );
  return ordenarPorUrgencia(fila, agora);
}

/** Tudo que depende do usuário para andar. */
export function dependenciasDe(itens: ItemPainel[], userId: string, agora = new Date()): ItemPainel[] {
  return ordenarPorUrgencia(itens.filter((it) => itemAtivo(it) && dependeDe(it, userId)), agora);
}

export interface GruposPrazo {
  atrasado: ItemPainel[];
  hoje: ItemPainel[];
  amanha: ItemPainel[];
  semana: ItemPainel[];
}

export function prazosDaSemana(itens: ItemPainel[], agora = new Date()): GruposPrazo {
  const g: GruposPrazo = { atrasado: [], hoje: [], amanha: [], semana: [] };
  for (const it of itens) {
    if (!itemAtivo(it)) continue;
    const u = classificarUrgencia(it, agora);
    if (u === "atrasado" || u === "hoje" || u === "amanha" || u === "semana") g[u].push(it);
  }
  return g;
}

/** Contagem real por etapa do workflow (somente itens ativos). */
export function contagemPorEtapa(itens: ItemPainel[]): Record<EtapaWorkflow, number> {
  const base = Object.fromEntries(ETAPAS_ORDEM.map((e) => [e, 0])) as Record<EtapaWorkflow, number>;
  for (const it of itens) {
    if (!itemAtivo(it)) continue;
    base[etapaAtualDe(it)] += 1;
  }
  return base;
}

export interface SlaOperacional {
  /** Falso quando nenhum item possui SLA operacional configurado (indicador preparado, sem fonte). */
  disponivel: boolean;
  estourados: ItemPainel[];
}

/** SLA operacional — nunca confundido com data_vencimento (prazo judicial). */
export function slaOperacional(itens: ItemPainel[], agora = new Date()): SlaOperacional {
  const comSla = itens.filter((it) => itemAtivo(it) && !!it.sla_previsto_em);
  const estourados = comSla.filter(
    (it) => it.sla_status === "estourado" || new Date(it.sla_previsto_em as string) < agora,
  );
  return { disponivel: comSla.length > 0, estourados: ordenarPorUrgencia(estourados, agora) };
}

export function saudeDe(params: { atrasados: number; hoje: number; filaRevisao: number }): Saude {
  if (params.atrasados > 0) return "atrasado";
  if (params.hoje > 0 || params.filaRevisao > 0) return "atencao";
  return "normal";
}

const STATUS_PROCESSO_INATIVO = ["encerrado", "arquivado", "cancelado"];

export function processoAtivo(status: string | null | undefined): boolean {
  if (!status) return true;
  const s = status.trim().toLowerCase();
  return !STATUS_PROCESSO_INATIVO.some((x) => s.startsWith(x));
}

export function agrupar<T>(rows: T[], chave: (r: T) => string | null): { label: string; total: number }[] {
  const mapa = new Map<string, number>();
  for (const r of rows) {
    const k = (chave(r) ?? "").trim();
    if (!k) continue;
    mapa.set(k, (mapa.get(k) ?? 0) + 1);
  }
  return Array.from(mapa.entries())
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total);
}

/** Tempo aguardando na etapa atual, em horas cheias. */
export function horasAguardando(it: ItemPainel, agora = new Date()): number | null {
  const ref = it.etapa_atualizada_em ?? it.criado_em;
  if (!ref) return null;
  return Math.max(0, Math.floor((agora.getTime() - new Date(ref).getTime()) / 3_600_000));
}
