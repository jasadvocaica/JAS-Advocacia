export interface ItemTabelaOAB {
  descricao: string;
  tipo: "fixo" | "percentual" | "percentual_ou_fixo";
  valor_min?: number | null;
  valor_max?: number | null;
  percentual_min?: number | null;
  percentual_max?: number | null;
  base_calculo?: string | null;
  unidade?: string | null;
  observacao?: string | null;
}

export interface CategoriaTabelaOAB {
  categoria: string;
  itens: ItemTabelaOAB[];
}

export interface TabelaOAB {
  id: string;
  estado: string;
  estado_nome: string;
  oab_seccional: string;
  ano_vigencia: number;
  arquivo_url: string | null;
  tabela_json: CategoriaTabelaOAB[];
  observacoes: string | null;
  ativo: boolean;
  carregado_por: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface FerramentaConfig {
  id: string;
  chave: string;
  valor: string | null;
  descricao: string | null;
  atualizado_em: string;
}

export type TipoHonorario = "fixo" | "exito" | "misto" | "mensalidade";

export const COMPLEXIDADE = [
  { label: "Simples", fator: 1.0 },
  { label: "Média", fator: 1.15 },
  { label: "Alta", fator: 1.3 },
  { label: "Urgente", fator: 1.5 },
] as const;

export const ESTADOS_BR: { sigla: string; nome: string }[] = [
  { sigla: "AC", nome: "Acre" },
  { sigla: "AL", nome: "Alagoas" },
  { sigla: "AP", nome: "Amapá" },
  { sigla: "AM", nome: "Amazonas" },
  { sigla: "BA", nome: "Bahia" },
  { sigla: "CE", nome: "Ceará" },
  { sigla: "DF", nome: "Distrito Federal" },
  { sigla: "ES", nome: "Espírito Santo" },
  { sigla: "GO", nome: "Goiás" },
  { sigla: "MA", nome: "Maranhão" },
  { sigla: "MT", nome: "Mato Grosso" },
  { sigla: "MS", nome: "Mato Grosso do Sul" },
  { sigla: "MG", nome: "Minas Gerais" },
  { sigla: "PA", nome: "Pará" },
  { sigla: "PB", nome: "Paraíba" },
  { sigla: "PR", nome: "Paraná" },
  { sigla: "PE", nome: "Pernambuco" },
  { sigla: "PI", nome: "Piauí" },
  { sigla: "RJ", nome: "Rio de Janeiro" },
  { sigla: "RN", nome: "Rio Grande do Norte" },
  { sigla: "RS", nome: "Rio Grande do Sul" },
  { sigla: "RO", nome: "Rondônia" },
  { sigla: "RR", nome: "Roraima" },
  { sigla: "SC", nome: "Santa Catarina" },
  { sigla: "SP", nome: "São Paulo" },
  { sigla: "SE", nome: "Sergipe" },
  { sigla: "TO", nome: "Tocantins" },
];

export function fmtMoeda(v: number | null | undefined): string {
  return (v ?? 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
