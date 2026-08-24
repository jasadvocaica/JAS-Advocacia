import { Database } from "@/integrations/supabase/types";

export type TipoItem = Database["public"]["Enums"]["tipo_item_controladoria"];
export type StatusItem = Database["public"]["Enums"]["status_item"];
export type Prioridade = Database["public"]["Enums"]["prioridade"];

export const TIPO_LABELS: Record<TipoItem, string> = {
  prazo_fatal: "Prazo fatal",
  prazo_processual: "Prazo processual",
  audiencia: "Audiência",
  pericia: "Perícia médica",
  conciliacao: "Conciliação",
  reuniao: "Reunião",
  diligencia: "Diligência",
  tarefa: "Tarefa",
  despacho: "Despacho",
  decisao: "Decisão",
  sentenca: "Sentença",
  recurso: "Recurso",
  peticao: "Petição",
  intimacao: "Intimação",
  protocolo: "Protocolo",
};

export const STATUS_LABELS: Record<StatusItem, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  aguardando: "Aguardando",
  aguardando_revisao: "Aguardando revisão",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

export const PRIORIDADE_LABELS: Record<Prioridade, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

export const PRIORIDADE_CLASS: Record<Prioridade, string> = {
  baixa: "bg-muted text-muted-foreground border-border",
  media: "bg-secondary text-secondary-foreground border-secondary",
  alta: "bg-warning/15 text-warning border-warning/30",
  urgente: "bg-destructive/15 text-destructive border-destructive/30",
};

export const STATUS_CLASS: Record<StatusItem, string> = {
  pendente: "bg-muted text-muted-foreground border-border",
  em_andamento: "bg-primary/10 text-primary border-primary/30",
  aguardando: "bg-warning/15 text-warning border-warning/30",
  aguardando_revisao: "bg-[#7c3aed]/10 text-[#7c3aed] dark:text-[#c4b5fd] border-[#7c3aed]/30",
  concluido: "bg-success/15 text-success border-success/30",
  cancelado: "bg-destructive/10 text-destructive border-destructive/30",
};

export const TIPO_CLASS: Record<TipoItem, string> = {
  prazo_fatal: "bg-destructive/15 text-destructive border-destructive/30",
  prazo_processual: "bg-primary/10 text-primary border-primary/30",
  audiencia: "bg-[#534AB7]/15 text-[#534AB7] dark:text-[#a8a3e8] border-[#534AB7]/30",
  pericia: "bg-[#1D9E75]/15 text-[#1D9E75] dark:text-[#7fd9b8] border-[#1D9E75]/30",
  conciliacao: "bg-[#185FA5]/15 text-[#185FA5] dark:text-[#7fb9e8] border-[#185FA5]/30",
  reuniao: "bg-[#854F0B]/15 text-[#854F0B] dark:text-[#e8b87f] border-[#854F0B]/30",
  diligencia: "bg-accent text-accent-foreground border-accent",
  tarefa: "bg-muted text-muted-foreground border-border",
  despacho: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
  decisao: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30",
  sentenca: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  recurso: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30",
  peticao: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30",
  intimacao: "bg-pink-500/10 text-pink-700 dark:text-pink-300 border-pink-500/30",
  protocolo: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30",
};

import type { LucideIcon } from "lucide-react";
import {
  AlarmClock, Clock, Gavel, Users, Briefcase, ListTodo,
  FileText, Scale, FileCheck, Undo2, FilePlus, Bell, Send,
  Stethoscope, Handshake,
} from "lucide-react";

export const TIPO_ICON: Record<TipoItem, LucideIcon> = {
  prazo_fatal: AlarmClock,
  prazo_processual: Clock,
  audiencia: Gavel,
  pericia: Stethoscope,
  conciliacao: Handshake,
  reuniao: Users,
  diligencia: Briefcase,
  tarefa: ListTodo,
  despacho: FileText,
  decisao: Scale,
  sentenca: FileCheck,
  recurso: Undo2,
  peticao: FilePlus,
  intimacao: Bell,
  protocolo: Send,
};

/** Tipos de evento agendado (com workflow de preparação e relatório pós-evento). */
export const TIPOS_EVENTO: TipoItem[] = ["audiencia", "pericia", "conciliacao", "reuniao"];

/** Cor sólida (header) para cada tipo de evento. */
export const EVENTO_COR_HEADER: Partial<Record<TipoItem, string>> = {
  audiencia: "#534AB7",
  pericia: "#1D9E75",
  conciliacao: "#185FA5",
  reuniao: "#854F0B",
};

/** Orientações padrão por tipo de evento (editáveis). */
export const ORIENTACOES_PADRAO: Partial<Record<TipoItem, string>> = {
  pericia: "Orientar o cliente a relatar os sintomas no pior dia. Não minimizar dores ou limitações. Mencionar necessidade de auxílio de terceiros para atividades básicas se aplicável.",
  audiencia: "Chegar 15 minutos antes. Não interferir no ato. Registrar o que aconteceu para repassar à Dra. Juliana.",
  conciliacao: "Não aceitar propostas sem consultar a Dra. Juliana. Registrar tudo que for proposto.",
  reuniao: "Confirmar a pauta com antecedência. Registrar os documentos entregues e recebidos.",
};

export const KANBAN_COLUMNS: { id: StatusItem; label: string }[] = [
  { id: "pendente", label: "Pendente" },
  { id: "em_andamento", label: "Em andamento" },
  { id: "aguardando", label: "Aguardando" },
  { id: "concluido", label: "Concluído" },
];

export type { EtapaWorkflow } from "./workflow";
export type EtapaKanban =
  | "criacao" | "execucao" | "revisao" | "correcao" | "protocolo" | "finalizado";

/** Colunas visuais do Kanban. Os `id` são os valores reais do banco —
 *  apenas os rótulos são adaptados para a linguagem operacional do escritório. */
export const ETAPA_KANBAN_COLUMNS: { id: EtapaKanban; label: string; accent: string; dot: string }[] = [
  { id: "criacao",    label: "A fazer",            accent: "bg-muted text-muted-foreground",                          dot: "bg-muted-foreground/40" },
  { id: "execucao",   label: "Em produção",        accent: "bg-primary/15 text-primary",                              dot: "bg-primary" },
  { id: "revisao",    label: "Revisão",            accent: "bg-[#7c3aed]/15 text-[#7c3aed] dark:text-[#c4b5fd]",      dot: "bg-[#7c3aed]" },
  { id: "correcao",   label: "Correção",           accent: "bg-warning/15 text-warning",                              dot: "bg-warning" },
  { id: "protocolo",  label: "Pronto p/ protocolo",accent: "bg-blue-500/15 text-blue-700 dark:text-blue-300",         dot: "bg-blue-500" },
  { id: "finalizado", label: "Protocolado",        accent: "bg-success/15 text-success",                              dot: "bg-success" },
];



export interface ControladoriaItem {
  id: string;
  titulo: string;
  descricao: string | null;
  tipo: TipoItem;
  status: StatusItem;
  prioridade: Prioridade;
  data_vencimento: string;
  data_inicio: string | null;
  data_intimacao: string | null;
  cliente_id: string | null;
  processo_id: string | null;
  tipo_prazo_id: string | null;
  vara: string | null;
  juiz: string | null;
  local: string | null;
  link_virtual: string | null;
  resultado: string | null;
  concluido_em: string | null;
  criado_em: string;
  coluna_kanban: string;
  etapa_workflow?: EtapaKanban | null;
  etapa_atualizada_em?: string | null;
  exige_revisao?: boolean | null;
  responsavel_id: string | null;
  executor_id?: string | null;
  corretor_id?: string | null;
  revisor_id?: string | null;
  protocolador_id?: string | null;

  // workflow de evento
  o_que_levar?: string | null;
  orientacoes?: string | null;
  cliente_confirmado?: boolean;
  proximo_passo?: string | null;
  documentos_entregues?: string | null;
  documentos_recebidos?: string | null;
  cancelado_motivo?: string | null;
  tarefa_origem_id?: string | null;
  criado_por?: string | null;
  // joins
  cliente?: { id: string; nome: string } | null;
  processo?: { id: string; numero_cnj: string | null; tipo_acao: string | null } | null;
  responsavel?: { id: string; nome: string; email: string | null } | null;
  google_evento?: { google_event_id: string; ultimo_sync: string; ultimo_erro: string | null } | null;
}
