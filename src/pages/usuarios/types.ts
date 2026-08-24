export type AppRole = "gestor" | "advogado" | "controladoria" | "administrativo" | "estagiario";
export type Modulo = "clientes" | "processos" | "controladoria" | "financeiro" | "documentos" | "parceiros" | "equipe" | "dashboard" | "usuarios" | "relatorios";
export type Acao = "visualizar" | "criar" | "editar" | "excluir" | "exportar";

export interface UsuarioRow {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  oab: string | null;
  avatar_url: string | null;
  ativo: boolean;
  primeiro_acesso: boolean;
  roles: AppRole[];
  ultimo_acesso?: string | null;
}

export interface PermissaoRow {
  modulo: Modulo;
  acao: Acao;
  permitido: boolean;
}

export const PERFIS: { value: AppRole; label: string }[] = [
  { value: "gestor", label: "Gestor" },
  { value: "advogado", label: "Advogado(a)" },
  { value: "controladoria", label: "Controladoria" },
  { value: "administrativo", label: "Administrativo" },
  { value: "estagiario", label: "Estagiário(a)" },
];

export const MODULOS: { value: Modulo; label: string }[] = [
  { value: "dashboard", label: "Dashboard" },
  { value: "clientes", label: "Clientes" },
  { value: "processos", label: "Processos" },
  { value: "controladoria", label: "Controladoria" },
  { value: "financeiro", label: "Financeiro" },
  { value: "documentos", label: "Documentos" },
  { value: "parceiros", label: "Parceiros" },
  { value: "equipe", label: "Equipe" },
  { value: "usuarios", label: "Usuários" },
  { value: "relatorios", label: "Relatórios" },
];

export const ACOES: { value: Acao; label: string }[] = [
  { value: "visualizar", label: "Visualizar" },
  { value: "criar", label: "Criar" },
  { value: "editar", label: "Editar" },
  { value: "excluir", label: "Excluir" },
  { value: "exportar", label: "Exportar" },
];

export function perfilLabel(role: AppRole): string {
  return PERFIS.find((p) => p.value === role)?.label ?? role;
}

export function perfilBadgeColor(role: AppRole): string {
  switch (role) {
    case "gestor": return "bg-gold/20 text-gold border-gold/40";
    case "advogado": return "bg-primary/15 text-primary border-primary/30";
    case "controladoria": return "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30";
    case "administrativo": return "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30";
    case "estagiario": return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
    default: return "bg-muted text-muted-foreground";
  }
}
