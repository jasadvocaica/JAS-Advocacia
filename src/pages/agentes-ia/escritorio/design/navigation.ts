import {
  Bot,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  FileText,
  FolderOpen,
  HandCoins,
  LayoutDashboard,
  ListTodo,
  Megaphone,
  PlugZap,
  Settings2,
  ShieldCheck,
  Terminal,
  UsersRound,
  Workflow,
  MessageSquare,
} from "lucide-react";
import type { Modulo } from "@/contexts/AuthContext";
export interface OfficeNavItem {
  label: string;
  to: string;
  icon: typeof Bot;
  section?: string;
  modulo?: Modulo;
  hint?: string;
  children?: { label: string; to: string }[];
}
export const OFFICE_NAV: { label: string; items: OfficeNavItem[] }[] = [
  {
    label: "Operação inteligente",
    items: [
      {
        label: "Visão Geral",
        to: "/dashboard-gestor",
        icon: LayoutDashboard,
        hint: "Painel executivo existente",
      },
      {
        label: "Central de Comando",
        to: "/escritorio",
        section: "comando",
        icon: Terminal,
      },
      {
        label: "Escritório Virtual 3D",
        to: "/escritorio/planta",
        section: "planta",
        icon: Building2,
      },
      {
        label: "Agentes de IA",
        to: "/escritorio/equipe",
        section: "equipe",
        icon: Bot,
      },
      {
        label: "Tarefas e Execuções",
        to: "/escritorio/historico",
        section: "historico",
        icon: ListTodo,
      },
      {
        label: "Automações e Workflows",
        to: "/fluxos",
        icon: Workflow,
        modulo: "controladoria",
        hint: "Biblioteca de fluxos existente",
      },
    ],
  },
  {
    label: "Escritório jurídico",
    items: [
      {
        label: "Processos e Clientes",
        to: "/clientes",
        icon: UsersRound,
        modulo: "clientes",
        children: [
          { label: "Clientes", to: "/clientes" },
          { label: "Processos", to: "/processos" },
        ],
      },
      { label: "Agenda e Prazos", to: "/agenda", icon: CalendarDays },
      {
        label: "Publicações DJEN",
        to: "/ferramentas/publicacoes-pje",
        icon: FileText,
        modulo: "processos",
      },
      {
        label: "Documentos",
        to: "/documentos",
        icon: FolderOpen,
        modulo: "documentos",
      },
    ],
  },
  {
    label: "Gestão",
    items: [
      {
        label: "Financeiro",
        to: "/financeiro",
        icon: HandCoins,
        modulo: "financeiro",
      },
      {
        label: "Marketing",
        to: "/marketing",
        icon: Megaphone,
        modulo: "marketing",
      },
      {
        label: "Relatórios e Indicadores",
        to: "/escritorio/operacao",
        section: "operacao",
        icon: ChartNoAxesCombined,
        hint: "Indicadores operacionais e consumo de IA",
      },
    ],
  },
  {
    label: "Administração",
    items: [
      {
        label: "Skills e Integrações",
        to: "/configuracoes/integracoes",
        icon: PlugZap,
        hint: "Conectores existentes; gerenciador de skills previsto para próxima fase",
      },
      {
        label: "Equipe e Permissões",
        to: "/usuarios",
        icon: ShieldCheck,
        children: [
          { label: "Equipe do escritório", to: "/equipe" },
          { label: "Usuários e permissões", to: "/usuarios" },
        ],
      },
      {
        label: "Configurações",
        to: "/configuracoes/escritorio",
        icon: Settings2,
      },
    ],
  },
];
export const OFFICE_SECONDARY = [
  {
    label: "Conversas",
    to: "/escritorio/chat",
    section: "chat",
    icon: MessageSquare,
  },
  {
    label: "Entregas para revisão",
    to: "/escritorio/entregas",
    section: "entregas",
    icon: ShieldCheck,
  },
];
export const OFFICE_SECTIONS = {
  comando: "Central de Comando",
  planta: "Escritório Virtual 3D",
  chat: "Conversas",
  equipe: "Agentes de IA",
  entregas: "Entregas para revisão",
  historico: "Tarefas e Execuções",
  operacao: "Relatórios e Indicadores",
} as const;
export type SecaoOffice = keyof typeof OFFICE_SECTIONS;
export function secaoOffice(pathname: string): SecaoOffice {
  const id = pathname.split("/")[2] || "comando";
  return id in OFFICE_SECTIONS ? (id as SecaoOffice) : "comando";
}
export const normalizarMenu = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
