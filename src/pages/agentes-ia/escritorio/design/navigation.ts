import { Bot, Building2, CalendarClock, Crown, KanbanSquare, MessageSquare, Server, Terminal } from "lucide-react";

/**
 * Navegação do Escritório Virtual: só o que é do escritório.
 * Processos, agenda, publicações, financeiro e demais módulos continuam no menu do JAS.
 */
export interface OfficeTab {
  label: string;
  to: string;
  section: SecaoOffice;
  icon: typeof Bot;
}

export const OFFICE_SECTIONS = {
  escritorio: "Escritório Virtual",
  agentes: "Central de Agentes",
  configurar: "Personalizar agente",
  missoes: "Missões",
  automacoes: "Automações",
  gestora: "Aprovações",
  chat: "Conversas",
  comando: "Central de Comando",
  operacao: "Operação de IA",
  historico: "Execuções",
  entregas: "Entregas para revisão",
} as const;
export type SecaoOffice = keyof typeof OFFICE_SECTIONS;

export const OFFICE_TABS: OfficeTab[] = [
  { label: "Escritório", to: "/escritorio", section: "escritorio", icon: Building2 },
  { label: "Agentes", to: "/escritorio/agentes", section: "agentes", icon: Bot },
  { label: "Missões", to: "/escritorio/missoes", section: "missoes", icon: KanbanSquare },
  { label: "Automações", to: "/escritorio/automacoes", section: "automacoes", icon: CalendarClock },
  { label: "Aprovações", to: "/escritorio/gestora", section: "gestora", icon: Crown },
  { label: "Conversas", to: "/escritorio/chat", section: "chat", icon: MessageSquare },
  { label: "Comando", to: "/escritorio/comando", section: "comando", icon: Terminal },
  { label: "Operação", to: "/escritorio/operacao", section: "operacao", icon: Server },
];

// Endereços antigos continuam abrindo a tela certa (favoritos e links já enviados).
const ALIAS: Record<string, SecaoOffice> = {
  planta: "escritorio",
  isometrico: "escritorio",
  equipe: "agentes",
};

export function secaoOffice(pathname: string): SecaoOffice {
  const id = pathname.split("/")[2] || "escritorio";
  if (id in ALIAS) return ALIAS[id];
  return id in OFFICE_SECTIONS ? (id as SecaoOffice) : "escritorio";
}

/** Aba ativa na barra: subtelas ficam marcadas na aba de origem. */
export function abaAtiva(secao: SecaoOffice): SecaoOffice {
  if (secao === "configurar") return "agentes";
  if (secao === "historico") return "operacao";
  if (secao === "entregas") return "gestora";
  return secao;
}
