// Constantes compartilhadas do módulo Clientes

export const ESTADOS_BR = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export const ESTADO_CIVIL_OPTS = [
  { v: "solteiro", l: "Solteiro(a)" },
  { v: "casado", l: "Casado(a)" },
  { v: "uniao_estavel", l: "União estável" },
  { v: "divorciado", l: "Divorciado(a)" },
  { v: "viuvo", l: "Viúvo(a)" },
  { v: "outro", l: "Outro" },
] as const;

export const ESCOLARIDADE_OPTS = [
  { v: "sem_instrucao", l: "Sem instrução" },
  { v: "fundamental_incompleto", l: "Fundamental incompleto" },
  { v: "fundamental_completo", l: "Fundamental completo" },
  { v: "medio_incompleto", l: "Médio incompleto" },
  { v: "medio_completo", l: "Médio completo" },
  { v: "superior_incompleto", l: "Superior incompleto" },
  { v: "superior_completo", l: "Superior completo" },
  { v: "pos_graduacao", l: "Pós-graduação" },
] as const;

export const ORIGEM_OPTS = [
  { v: "indicacao", l: "Indicação" },
  { v: "parceiro", l: "Parceiro" },
  { v: "organico", l: "Orgânico" },
  { v: "ads", l: "Anúncios" },
  { v: "site", l: "Site" },
  { v: "redes_sociais", l: "Redes sociais" },
  { v: "outro", l: "Outro" },
] as const;

export const STATUS_OPTS = [
  { v: "ativo", l: "Ativo" },
  { v: "prospecto", l: "Prospecto" },
  { v: "inativo", l: "Inativo" },
] as const;

export const STATUS_CLASS: Record<string, string> = {
  ativo: "bg-success/15 text-success border-success/30",
  prospecto: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  inativo: "bg-muted text-muted-foreground border-muted-foreground/30",
};

export const TIPO_BENEFICIO_OPTS = [
  "Aposentadoria por Idade",
  "Aposentadoria por Tempo de Contribuição",
  "Aposentadoria Especial",
  "Aposentadoria por Invalidez",
  "Auxílio-Doença",
  "Auxílio-Acidente",
  "BPC/LOAS",
  "Pensão por Morte",
  "Salário-Maternidade",
  "Outro",
] as const;

export const STATUS_BENEFICIO_OPTS = [
  { v: "ativo", l: "Ativo" },
  { v: "em_analise", l: "Em análise" },
  { v: "suspenso", l: "Suspenso" },
  { v: "cessado", l: "Cessado" },
] as const;

export const STATUS_BENEFICIO_CLASS: Record<string, string> = {
  ativo: "bg-success/15 text-success border-success/30",
  em_analise: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  suspenso: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  cessado: "bg-muted text-muted-foreground border-muted-foreground/30",
};

export interface BeneficioInss {
  id: string;
  cliente_id: string;
  nb: string;
  tipo_beneficio: string;
  der: string | null;
  dib: string | null;
  competencia_inicio: string | null;
  valor_mensal: number | null;
  status: string;
  observacao: string | null;
}

export const SALARIO_MINIMO_2025 = 1518;

export function calcularIdade(nascimento: string | null | undefined): number | null {
  if (!nascimento) return null;
  const n = new Date(nascimento);
  if (isNaN(n.getTime())) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - n.getFullYear();
  const m = hoje.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < n.getDate())) idade--;
  return idade;
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

export function whatsappLink(numero: string | null | undefined): string | null {
  if (!numero) return null;
  const d = numero.replace(/\D/g, "");
  if (d.length < 10) return null;
  const full = d.length === 10 || d.length === 11 ? `55${d}` : d;
  return `https://wa.me/${full}`;
}
