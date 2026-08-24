export interface Parcela {
  descricao: string;
  vencimento: string; // DD/MM/AAAA
  valorOriginal: number;
  valorAtualizado: number;
  juros: number;
  total: number;
}

export interface NotificacaoData {
  id?: string;
  criado_em?: string;
  notificante_nome: string;
  notificante_cnpj: string;
  notificante_endereco: string;
  notificado_nome: string;
  notificado_cpf: string;
  notificado_rg: string;
  notificado_endereco: string;
  referencia: string;
  descricao_fato: string;
  texto_notificacao: string;
  multa_percentual: number;
  multa_valor: number;
  honorarios_percentual: number;
  honorarios_valor: number;
  total_geral: number;
  banco_nome: string;
  banco_codigo: string;
  banco_agencia: string;
  banco_conta: string;
  banco_favorecido: string;
  banco_pix: string;
  parcelas: Parcela[];
  cliente_id?: string;
  processo_id?: string;
}

export interface ModeloNotificacao {
  id: string;
  criado_em: string;
  nome: string;
  conteudo: string;
  file_name?: string | null;
  file_data?: string | null;
  file_mime?: string | null;
}

export const MORA_MES = 0.042; // 4,2% padrão
export const MULTA_PCT_DEFAULT = 2;
export const HONORARIOS_PCT_DEFAULT = 20;

export function notificacaoVazia(): NotificacaoData {
  return {
    notificante_nome: "",
    notificante_cnpj: "",
    notificante_endereco: "",
    notificado_nome: "",
    notificado_cpf: "",
    notificado_rg: "",
    notificado_endereco: "",
    referencia: "",
    descricao_fato: "",
    texto_notificacao: "",
    multa_percentual: MULTA_PCT_DEFAULT,
    multa_valor: 0,
    honorarios_percentual: HONORARIOS_PCT_DEFAULT,
    honorarios_valor: 0,
    total_geral: 0,
    banco_nome: "",
    banco_codigo: "",
    banco_agencia: "",
    banco_conta: "",
    banco_favorecido: "",
    banco_pix: "",
    parcelas: [],
  };
}

export function recalcularTotais(
  parcelas: Parcela[],
  multaPct: number,
  honPct: number,
) {
  const subtotal = parcelas.reduce((acc, p) => acc + (p.total || 0), 0);
  const multa_valor = subtotal * (multaPct / 100);
  const honorarios_valor = subtotal * (honPct / 100);
  return {
    multa_valor,
    honorarios_valor,
    total_geral: subtotal + multa_valor + honorarios_valor,
  };
}

export function aplicarMora(valorOriginal: number): Parcela {
  const juros = valorOriginal * MORA_MES;
  return {
    descricao: "",
    vencimento: "",
    valorOriginal,
    valorAtualizado: valorOriginal,
    juros,
    total: valorOriginal + juros,
  };
}
