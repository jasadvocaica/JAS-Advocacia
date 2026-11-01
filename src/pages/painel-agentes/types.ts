import type { CargoEquipe } from "@/pages/equipe/types";

export type StatusAgente = "sobrecarregado" | "ativo" | "tranquilo" | "ocioso" | "ausente";

export interface ItemAgente {
  id: string;
  titulo: string;
  tipo: string;
  prioridade: string;
  status: string;
  data_vencimento: string;
  cliente: { id: string; nome: string } | null;
  processo: { id: string; numero_cnj: string | null } | null;
}

export interface AgentePainel {
  userId: string;
  nome: string;
  email: string | null;
  cargo: CargoEquipe | null;
  avatarUrl: string | null;
  statusMembro: "ativo" | "inativo" | "afastado" | null;
  itens: ItemAgente[];
  totalItens: number;
  atrasados: number;
  hoje: number;
  proximos7: number;
  altaPrioridade: number;
  carga: number;
  status: StatusAgente;
  ultimoVencimento: string | null;
}

export const LABEL_STATUS_AGENTE: Record<StatusAgente, string> = {
  sobrecarregado: "Sobrecarregado",
  ativo: "Ativo",
  tranquilo: "Tranquilo",
  ocioso: "Sem demandas",
  ausente: "Ausente",
};

export const LABEL_CARGO_AGENTE: Record<CargoEquipe, string> = {
  gestor: "Gestão",
  advogado: "Advogado(a)",
  estagiario: "Estagiário(a)",
  administrativo: "Administrativo",
  socio: "Sócio(a)",
  outro: "Outro",
};
