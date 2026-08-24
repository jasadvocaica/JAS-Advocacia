export type ParceiroTipo = "correspondente" | "indicador" | "escritorio";
export type ParceiroStatus = "ativo" | "inativo" | "suspenso";
export type PixTipo = "cpf" | "cnpj" | "email" | "telefone" | "aleatoria";
export type BancoTipo = "corrente" | "poupanca";

export interface Parceiro {
  id: string;
  nome: string;
  nome_social: string | null;
  tipo: ParceiroTipo;
  status: ParceiroStatus;
  cpf: string | null;
  cnpj: string | null;
  oab: string | null;
  oab_numero: string | null;
  oab_seccional: string | null;
  oab_completo: string | null;
  email: string | null;
  whatsapp: string | null;
  telefone: string | null;
  cidade: string | null;
  estado: string | null;
  especialidades: string[] | null;
  pix_chave: string | null;
  pix_tipo: PixTipo | null;
  banco_nome: string | null;
  banco_agencia: string | null;
  banco_conta: string | null;
  banco_tipo: BancoTipo | null;
  percentual_padrao: number | null;
  observacoes: string | null;
  observacoes_internas: string | null;
  ativo: boolean;
  portal_ativo: boolean;
  portal_ultimo_acesso: string | null;
  portal_token_convite: string | null;
  portal_convite_expira_em: string | null;
  escritorio_parceiro_id: string | null;
  criado_em: string;
  atualizado_em: string;
}

export type TipoParticipacao =
  | "correspondente"
  | "substabelecido"
  | "indicador"
  | "correspondente_e_indicador";

export type BaseRateio = "total_recebido" | "apenas_exito" | "fixo_por_processo";
export type BaseComissao = "honorario_fixo" | "apenas_exito" | "total_honorarios";

export interface ProcessoParceiro {
  id: string;
  processo_id: string;
  parceiro_id: string;
  cliente_id: string;
  tipo_participacao: TipoParticipacao;
  substabelecimento_com_reserva: boolean | null;
  tem_rateio_atuacao: boolean;
  percentual_atuacao: number | null;
  base_rateio: BaseRateio | null;
  valor_fixo_atuacao: number | null;
  tem_comissao_indicacao: boolean;
  percentual_indicacao: number | null;
  base_comissao: BaseComissao | null;
  observacao: string | null;
  ativo: boolean;
  criado_em: string;
}

export const TIPO_LABEL: Record<ParceiroTipo, string> = {
  correspondente: "Correspondente",
  indicador: "Indicador",
  escritorio: "Escritório",
};

export const STATUS_LABEL: Record<ParceiroStatus, string> = {
  ativo: "Ativo",
  inativo: "Inativo",
  suspenso: "Suspenso",
};

export const TIPO_CLASS: Record<ParceiroTipo, string> = {
  correspondente: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  indicador: "bg-violet-500/15 text-violet-600 border-violet-500/30",
  escritorio: "bg-gold/15 text-gold-dark border-gold/30",
};

export const STATUS_CLASS: Record<ParceiroStatus, string> = {
  ativo: "bg-success/15 text-success border-success/30",
  inativo: "bg-muted text-muted-foreground border-muted-foreground/30",
  suspenso: "bg-amber-500/15 text-amber-600 border-amber-500/30",
};

export const PARTICIPACAO_LABEL: Record<TipoParticipacao, string> = {
  correspondente: "Correspondente",
  substabelecido: "Substabelecido",
  indicador: "Indicador",
  correspondente_e_indicador: "Correspondente + Indicador",
};

export const ESPECIALIDADES_SUGESTOES = [
  "previdenciario", "trabalhista", "civil", "familia", "tributario",
  "criminal", "consumidor", "empresarial", "imobiliario", "administrativo",
];

export const UFS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

/** Iniciais para avatar (ex: "Maria Silva" → "MS") */
export function iniciais(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/** Mascara conta bancária mostrando só últimos 4 */
export function mascararConta(conta: string | null): string {
  if (!conta) return "—";
  const limpo = conta.replace(/\s/g, "");
  if (limpo.length <= 4) return limpo;
  return "••••" + limpo.slice(-4);
}
