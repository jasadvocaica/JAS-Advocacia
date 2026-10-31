// Regras da Vanessa (agente de prazos). Funções puras: sem Deno, sem banco,
// para serem testadas com o Vitest (src/pages/agentes/regras.test.ts).

export type TipoItem =
  | "prazo_fatal"
  | "prazo_processual"
  | "audiencia"
  | "pericia"
  | "diligencia"
  | "reuniao"
  | "tarefa";

export const TIPOS_EVENTO: TipoItem[] = ["audiencia", "pericia", "reuniao"];

export interface Extracao {
  exige_providencia: boolean;
  tipo_item: TipoItem;
  providencia: string;
  prazo_dias: number | null;
  prazo_tipo: "dias_uteis" | "dias_corridos" | null;
  base_legal: string | null;
  data_evento: string | null;
  hora_evento: string | null;
  confianca: number;
  justificativa: string;
}

export type Decisao =
  | { acao: "lancar"; modo: "prazo" | "evento" }
  | { acao: "triagem"; motivo: string };

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Lança só o que está claro; o resto continua na triagem humana. */
export function decidir(e: Partial<Extracao> | null, confiancaMinima: number, hojeISO: string): Decisao {
  if (!e || typeof e !== "object" || typeof e.confianca !== "number" || !e.tipo_item) {
    return { acao: "triagem", motivo: "Resposta da IA incompleta" };
  }
  if (!e.exige_providencia) {
    return { acao: "triagem", motivo: "Nenhuma providência identificada (confirme se é só ciência)" };
  }
  if (e.confianca < confiancaMinima) {
    return { acao: "triagem", motivo: `Confiança baixa (${Math.round(e.confianca * 100)}%)` };
  }
  if (TIPOS_EVENTO.includes(e.tipo_item)) {
    if (e.data_evento && DATA.test(e.data_evento) && e.data_evento >= hojeISO) return { acao: "lancar", modo: "evento" };
    return { acao: "triagem", motivo: "Data do ato designado não identificada com segurança" };
  }
  const dias = e.prazo_dias;
  if (typeof dias === "number" && Number.isInteger(dias) && dias >= 1 && dias <= 120 && e.prazo_tipo) {
    return { acao: "lancar", modo: "prazo" };
  }
  return { acao: "triagem", motivo: "Prazo não identificado com segurança" };
}

export interface MembroCarga {
  user_id: string;
  nome: string;
  cargo: string;
  status: string;
  abertos: number;
}

/** Quem cuida de cada tipo hoje (mesma regra da Controladoria). */
const PREFERENCIA: Partial<Record<TipoItem, string>> = {
  prazo_fatal: "lana",
  prazo_processual: "lana",
  tarefa: "esther",
  audiencia: "valeska",
  pericia: "valeska",
  diligencia: "valeska",
  reuniao: "valeska",
};

const CARGOS_OPERACIONAIS = ["estagiario", "advogado", "administrativo", "outro"];

/**
 * Por tipo + carga: vai para a pessoa preferida do tipo; se ela estiver
 * afastada ou com itens abertos demais, vai para quem tem menos itens.
 */
export function escolherResponsavel(
  tipo: TipoItem,
  equipe: MembroCarga[],
  limite: number,
  responsavelProcesso: string | null,
): { user_id: string | null; motivo: string } {
  const elegiveis = equipe.filter((m) => m.status === "ativo" && CARGOS_OPERACIONAIS.includes(m.cargo));
  const chave = PREFERENCIA[tipo];
  const preferida = chave ? elegiveis.find((m) => m.nome.toLowerCase().includes(chave)) : undefined;
  if (preferida && preferida.abertos < limite) return { user_id: preferida.user_id, motivo: "responsável pelo tipo" };

  const livres = elegiveis
    .filter((m) => m.abertos < limite)
    .sort((a, b) => a.abertos - b.abertos || a.nome.localeCompare(b.nome, "pt-BR"));
  if (livres.length) {
    return {
      user_id: livres[0].user_id,
      motivo: preferida ? `${preferida.nome} com ${preferida.abertos} itens abertos; menor carga` : "menor carga",
    };
  }
  if (preferida) return { user_id: preferida.user_id, motivo: "todos acima do limite; responsável pelo tipo" };
  return { user_id: responsavelProcesso, motivo: "responsável pelo processo" };
}

/** Diferença em dias corridos entre duas datas ISO (yyyy-MM-dd). */
export function diasEntre(deISO: string, ateISO: string): number {
  const ms = Date.parse(`${ateISO}T00:00:00Z`) - Date.parse(`${deISO}T00:00:00Z`);
  return Math.round(ms / 86400000);
}

export function prioridadePara(dataJudicialISO: string, hojeISO: string): "urgente" | "alta" | "media" {
  const faltam = diasEntre(hojeISO, dataJudicialISO);
  if (faltam <= 2) return "urgente";
  if (faltam <= 6) return "alta";
  return "media";
}

/** Meta interna: antecedência antes do prazo, nunca no passado nem depois do judicial. */
export function ajustarInterno(internoISO: string, judicialISO: string, hojeISO: string): string {
  if (internoISO >= hojeISO) return internoISO;
  return judicialISO < hojeISO ? judicialISO : hojeISO;
}

export function somarDias(dataISO: string, dias: number): string {
  const d = new Date(`${dataISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function dataBR(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

const ROTULOS: Record<TipoItem, string> = {
  prazo_fatal: "Prazo fatal",
  prazo_processual: "Prazo processual",
  audiencia: "Audiência",
  pericia: "Perícia",
  diligencia: "Diligência",
  reuniao: "Reunião",
  tarefa: "Tarefa",
};

export function tituloItem(e: Extracao, processo: string): string {
  const base = (e.providencia ?? "").trim() || ROTULOS[e.tipo_item] || "Providência";
  return `${base} — ${processo}`.slice(0, 200);
}
