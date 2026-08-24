export type CargoEquipe = "gestor" | "advogado" | "estagiario" | "administrativo" | "socio" | "outro";
export type TipoVinculoEquipe = "clt" | "autonomo" | "estagio" | "socio" | "prestador";
export type StatusMembro = "ativo" | "inativo" | "afastado";
export type TipoRemuneracao = "fixo" | "comissao" | "misto" | "producao";
export type StatusFolha = "pendente" | "revisado" | "pago";

export interface MembroEquipe {
  id: string;
  user_id: string;
  nome: string;
  cpf: string | null;
  rg: string | null;
  data_nascimento: string | null;
  telefone: string | null;
  email_pessoal: string | null;
  cargo: CargoEquipe;
  oab_numero: string | null;
  oab_seccional: string | null;
  tipo_vinculo: TipoVinculoEquipe;
  data_admissao: string;
  data_desligamento: string | null;
  pix_chave: string | null;
  pix_tipo: string | null;
  banco_nome: string | null;
  banco_agencia: string | null;
  banco_conta: string | null;
  status: StatusMembro;
  observacoes_internas: string | null;
  estado_civil: string | null;
  escolaridade: string | null;
  dependentes: number;
  endereco_cep: string | null;
  endereco_logradouro: string | null;
  endereco_numero: string | null;
  endereco_complemento: string | null;
  endereco_bairro: string | null;
  endereco_cidade: string | null;
  endereco_estado: string | null;
  contato_emergencia_nome: string | null;
  contato_emergencia_telefone: string | null;
  contato_emergencia_parentesco: string | null;
  criado_em: string;
}

export type BeneficioTipo = "vr" | "vt" | "saude" | "odontologico" | "auxilio_creche" | "outro";
export type BeneficioNatureza = "credito" | "debito";

export interface BeneficioEquipe {
  id: string;
  membro_id: string;
  tipo: BeneficioTipo;
  descricao: string | null;
  valor_mensal: number;
  natureza: BeneficioNatureza;
  data_inicio: string;
  data_fim: string | null;
  observacao: string | null;
}

export type LancamentoNatureza = "bonus" | "desconto";

export interface LancamentoFolha {
  id: string;
  membro_id: string;
  mes: number;
  ano: number;
  natureza: LancamentoNatureza;
  motivo: string;
  valor: number;
  observacao: string | null;
  aplicado_folha: boolean;
  folha_id: string | null;
}

export type DocumentoCategoria = "rg" | "cnh" | "contrato" | "aso" | "comprovante" | "outro";

export interface DocumentoEquipe {
  id: string;
  membro_id: string;
  categoria: DocumentoCategoria;
  nome: string;
  storage_path: string;
  mime_type: string | null;
  tamanho_bytes: number | null;
  observacao: string | null;
  criado_em: string;
}

export const LABEL_BENEFICIO: Record<BeneficioTipo, string> = {
  vr: "Vale-refeição",
  vt: "Vale-transporte",
  saude: "Plano de saúde",
  odontologico: "Plano odontológico",
  auxilio_creche: "Auxílio-creche",
  outro: "Outro",
};

export const LABEL_DOC_CATEGORIA: Record<DocumentoCategoria, string> = {
  rg: "RG",
  cnh: "CNH",
  contrato: "Contrato",
  aso: "ASO / Atestado",
  comprovante: "Comprovante",
  outro: "Outro",
};

export interface Remuneracao {
  id: string;
  membro_id: string;
  tipo: TipoRemuneracao;
  valor_fixo: number | null;
  dia_pagamento: number | null;
  percentual_exito: number | null;
  valor_por_tarefa: number | null;
  valor_por_processo: number | null;
  data_inicio: string;
  data_fim: string | null;
  observacao: string | null;
  criado_em: string;
}

export interface Meta {
  id: string;
  membro_id: string;
  mes: number;
  ano: number;
  meta_tarefas_concluidas: number | null;
  meta_tarefas_no_prazo_pct: number | null;
  meta_prazos_perdidos: number | null;
  meta_atendimentos: number | null;
  meta_processos_abertos: number | null;
  meta_processos_fechados: number | null;
  meta_pecas_elaboradas: number | null;
  meta_receita_gerada: number | null;
  meta_nota_minima: number | null;
  observacao: string | null;
}

export interface Desempenho {
  id: string;
  membro_id: string;
  meta_id: string | null;
  mes: number;
  ano: number;
  tarefas_concluidas: number;
  tarefas_no_prazo: number;
  tarefas_fora_prazo: number;
  tarefas_no_prazo_pct: number | null;
  prazos_cumpridos: number;
  prazos_perdidos: number;
  processos_abertos: number;
  processos_fechados: number;
  pecas_elaboradas: number;
  receita_gerada: number;
  atingimento_geral_pct: number | null;
  nota_avaliacao: number | null;
  pontos_fortes: string | null;
  pontos_melhorar: string | null;
  metas_proximo_mes: string | null;
  avaliado_por: string | null;
  avaliado_em: string | null;
  gerado_em: string;
}

export interface Folha {
  id: string;
  membro_id: string;
  mes: number;
  ano: number;
  valor_fixo: number;
  valor_comissao_exito: number;
  valor_comissao_producao: number;
  bonus_manual: number;
  desconto_manual: number;
  observacao_ajuste: string | null;
  valor_total: number;
  status: StatusFolha;
  data_pagamento: string | null;
  forma_pagamento: string | null;
  comprovante_url: string | null;
  pago_em: string | null;
}

export interface ComissaoExito {
  id: string;
  membro_id: string;
  processo_id: string;
  pagamento_id: string | null;
  valor_honorario: number;
  percentual_comissao: number;
  valor_comissao: number;
  mes_referencia: number;
  ano_referencia: number;
  incluida_folha: boolean;
  folha_id: string | null;
  criado_em: string;
}

export const LABEL_CARGO: Record<CargoEquipe, string> = {
  gestor: "Gestor", advogado: "Advogado", estagiario: "Estagiário",
  administrativo: "Administrativo", socio: "Sócio", outro: "Outro",
};
export const LABEL_VINCULO: Record<TipoVinculoEquipe, string> = {
  clt: "CLT", autonomo: "Autônomo", estagio: "Estágio", socio: "Sócio", prestador: "Prestador",
};
export const LABEL_TIPO_REM: Record<TipoRemuneracao, string> = {
  fixo: "Fixo", comissao: "Só comissão", misto: "Fixo + comissão", producao: "Por produção",
};
export const LABEL_STATUS_FOLHA: Record<StatusFolha, string> = {
  pendente: "Pendente", revisado: "Revisada", pago: "Paga",
};
export const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
