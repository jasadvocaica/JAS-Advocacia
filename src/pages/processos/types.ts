export type TipoProcesso = "judicial" | "administrativo";
export type Instancia = "1grau" | "2grau" | "superior" | "turma_recursal";
export type FonteAndamento = "manual" | "datajud";
export type AcaoDataJud = "nenhuma" | "notificar" | "criar_tarefa" | "criar_prazo" | "disparar_fluxo";

export interface ProcessoStatus {
  id: string;
  nome: string;
  cor: string;
  ordem: number;
  tipo_processo: "judicial" | "administrativo" | "ambos";
  ativo: boolean;
}

export interface ProcessoListItem {
  id: string;
  numero_cnj: string | null;
  numero_cnj_limpo: string | null;
  nb_inss: string | null;
  tipo: TipoProcesso;
  area_direito: string | null;
  tipo_acao: string | null;
  status: string;
  tribunal_sigla: string | null;
  vara: string | null;
  comarca: string | null;
  cliente_id: string;
  responsavel_id: string | null;
  valor_causa: number | null;
  data_distribuicao: string | null;
  datajud_ultima_consulta: string | null;
  datajud_ativo: boolean;
  criado_em: string;
  clientes?: { nome: string } | null;
  partes?: { tipo: "autor" | "reu" | "interessado" | "terceiro"; nome: string }[];
}

export interface ProcessoParte {
  id: string;
  processo_id: string;
  tipo: "autor" | "reu" | "interessado" | "terceiro";
  nome: string;
  cpf_cnpj: string | null;
  advogado_nome: string | null;
  advogado_oab: string | null;
  origem: "manual" | "datajud";
}

export interface DataJudRegra {
  id: string;
  codigo_movimento: number;
  nome_movimento: string;
  acao: AcaoDataJud;
  prazo_dias: number | null;
  prazo_tipo: "uteis" | "corridos";
  fluxo_template_id: string | null;
  titulo_tarefa: string | null;
  prioridade: "baixa" | "media" | "alta" | "urgente";
  ativo: boolean;
}

export interface DataJudLog {
  id: string;
  iniciado_em: string;
  finalizado_em: string | null;
  modo: "agendado" | "manual" | "processo_unico";
  total_consultados: number;
  total_andamentos_novos: number;
  total_acoes_geradas: number;
  total_erros: number;
  duracao_ms: number | null;
  detalhes: any;
}
