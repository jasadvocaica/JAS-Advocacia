/**
 * Lógica pura do Painel Comercial (Valeska) — V1.
 *
 * Regras de escopo desta fase:
 *  - NENHUMA fonte de WhatsApp/mensageria é lida, inferida ou exibida.
 *  - Somente registros internos: fichas de atendimento, leads/negociações
 *    cadastrados, tarefas da Controladoria e pendências de comunicação.
 *  - O SLA da comunicação (1 dia útil preferencial / 3 dias úteis máximo) é
 *    operacional e NÃO se confunde com `data_vencimento` (prazo judicial).
 */

export type UrgenciaComunicacao = "atrasada" | "hoje" | "no_prazo";

export interface ComunicacaoPendente {
  id: string;
  item_id: string;
  cliente_id: string | null;
  processo_id: string | null;
  status: string;
  responsavel_id: string | null;
  sla_preferencial_em: string | null;
  sla_limite_em: string | null;
  comunicado_em: string | null;
  comunicado_por: string | null;
  criado_em: string;
  cliente_nome?: string | null;
  processo_cnj?: string | null;
  item_titulo?: string | null;
}

export interface FichaAtendimento {
  id: string;
  titulo: string | null;
  status: string | null;
  area: string | null;
  subtipo: string | null;
  cliente_id: string | null;
  cliente_nome?: string | null;
  criado_em: string;
  convertido_em: string | null;
}

export interface LeadRegistrado {
  id: string;
  nome: string | null;
  status: string | null;
  area_direito: string | null;
  cliente_id: string | null;
  valor_contrato: number | null;
  criado_em: string;
}

export interface TarefaPainel {
  id: string;
  titulo: string;
  status: string;
  prioridade: string | null;
  data_vencimento: string;
  etapa_workflow: string | null;
  responsavel_id: string | null;
  executor_id: string | null;
  revisor_id: string | null;
  corretor_id: string | null;
  protocolador_id: string | null;
  cliente_nome?: string | null;
}

export interface PendenciaGerencial {
  id: string;
  codigo: string;
  status: string;
  criado_em: string;
}

const soData = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);

function hojeISO(agora: Date): string {
  const y = agora.getFullYear();
  const m = String(agora.getMonth() + 1).padStart(2, "0");
  const d = String(agora.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Comunicação ainda em aberto (não concluída/cancelada). */
export function comunicacaoPendente(c: ComunicacaoPendente): boolean {
  return c.status === "pendente";
}

/**
 * Urgência da comunicação com base no SLA OPERACIONAL da própria comunicação.
 * Nunca usa prazo judicial.
 */
export function urgenciaComunicacao(c: ComunicacaoPendente, agora: Date): UrgenciaComunicacao {
  const hoje = hojeISO(agora);
  const limite = soData(c.sla_limite_em);
  const pref = soData(c.sla_preferencial_em);
  if (limite && limite < hoje) return "atrasada";
  if ((pref && pref <= hoje) || (limite && limite === hoje)) return "hoje";
  return "no_prazo";
}

/** Comunicações pendentes ordenadas por urgência e antiguidade. */
export function comunicacoesDoPainel(
  lista: ComunicacaoPendente[],
  agora: Date,
): ComunicacaoPendente[] {
  const peso: Record<UrgenciaComunicacao, number> = { atrasada: 0, hoje: 1, no_prazo: 2 };
  return lista
    .filter(comunicacaoPendente)
    .sort((a, b) => {
      const d = peso[urgenciaComunicacao(a, agora)] - peso[urgenciaComunicacao(b, agora)];
      if (d !== 0) return d;
      return a.criado_em.localeCompare(b.criado_em);
    });
}

/** Comunicações sem responsável configurado — viram alerta gerencial, sem fallback. */
export function comunicacoesSemResponsavel(lista: ComunicacaoPendente[]): ComunicacaoPendente[] {
  return lista.filter((c) => comunicacaoPendente(c) && !c.responsavel_id);
}

/** Tarefa ativa da Controladoria. */
export function tarefaAtiva(t: TarefaPainel): boolean {
  return t.status !== "concluido" && t.status !== "cancelado";
}

/** Tarefas realmente atribuídas ao usuário (responsável atual ou de alguma etapa). */
export function tarefasDoUsuario(lista: TarefaPainel[], userId: string): TarefaPainel[] {
  if (!userId) return [];
  return lista
    .filter(tarefaAtiva)
    .filter((t) =>
      [t.responsavel_id, t.executor_id, t.revisor_id, t.corretor_id, t.protocolador_id].includes(userId),
    )
    .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));
}

/** Tarefas vencidas ou vencendo hoje (usa o prazo judicial já existente, sem cálculo paralelo). */
export function tarefasCriticas(lista: TarefaPainel[], agora: Date): TarefaPainel[] {
  const hoje = hojeISO(agora);
  return lista.filter((t) => soData(t.data_vencimento)! <= hoje);
}

/**
 * Contratação iniciada e não concluída: ficha cadastrada que ainda não foi
 * convertida. Estado real da tabela `cliente_atendimentos`.
 */
export function contratacoesEmAberto(fichas: FichaAtendimento[]): FichaAtendimento[] {
  return fichas
    .filter((f) => !f.convertido_em && (f.status ?? "rascunho") !== "convertido")
    .sort((a, b) => b.criado_em.localeCompare(a.criado_em));
}

/** Funil por estado real das fichas cadastradas. */
export function funilFichas(fichas: FichaAtendimento[]): { chave: string; total: number }[] {
  return agrupar(fichas, (f) => f.status ?? "rascunho");
}

/** Funil por estado real das negociações/leads já registrados no sistema. */
export function funilLeads(leads: LeadRegistrado[]): { chave: string; total: number }[] {
  return agrupar(leads, (l) => l.status ?? "sem_status");
}

export function agrupar<T>(lista: T[], chave: (i: T) => string | null | undefined) {
  const mapa = new Map<string, number>();
  for (const i of lista) {
    const k = chave(i) || "nao_informado";
    mapa.set(k, (mapa.get(k) ?? 0) + 1);
  }
  return [...mapa.entries()]
    .map(([chave, total]) => ({ chave, total }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Autorização do painel: a usuária comercial configurada, ou gestor
 * (supervisão, padrão já existente no sistema). Nome NUNCA é regra.
 */
export function podeVerPainelComercial(params: {
  userId: string | null | undefined;
  responsavelConfigurado: string | null | undefined;
  isGestor: boolean;
}): boolean {
  const { userId, responsavelConfigurado, isGestor } = params;
  if (!userId) return false;
  if (isGestor) return true;
  return !!responsavelConfigurado && responsavelConfigurado === userId;
}

/** Total de itens que exigem ação imediata da usuária. */
export function precisaDeMimAgora(params: {
  comunicacoes: ComunicacaoPendente[];
  tarefas: TarefaPainel[];
  contratacoes: FichaAtendimento[];
  pendencias: PendenciaGerencial[];
}): number {
  return (
    params.comunicacoes.length + params.tarefas.length + params.contratacoes.length + params.pendencias.length
  );
}
