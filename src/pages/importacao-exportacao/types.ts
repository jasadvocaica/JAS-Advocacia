export type IeJobStatus =
  | "aguardando"
  | "processando"
  | "concluido"
  | "concluido_parcial"
  | "erro"
  | "expirado";

export interface IeJob {
  id: string;
  tipo: "importacao" | "exportacao";
  modulo: string;
  subtipo: string | null;
  status: IeJobStatus;
  total_registros: number;
  registros_ok: number;
  registros_erro: number;
  erros_json: ErroLinha[];
  arquivo_entrada_url: string | null;
  arquivo_entrada_nome: string | null;
  arquivo_saida_url: string | null;
  arquivo_saida_nome: string | null;
  arquivo_tamanho_bytes: number | null;
  filtros: Record<string, unknown>;
  iniciado_por: string | null;
  iniciado_em: string;
  concluido_em: string | null;
  expira_em: string | null;
  mensagem: string | null;
}

export interface ErroLinha {
  linha: number;
  campo: string;
  erro: string;
  valor?: string;
}

export type ImportModulo = "processos" | "clientes" | "documentos";
export type ExportModulo =
  | "financeiro"
  | "processos"
  | "clientes"
  | "backup"
  | "personalizado";
