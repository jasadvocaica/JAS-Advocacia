export type DocCategoria =
  | "peticao_inicial"
  | "recurso"
  | "manifestacao"
  | "contrato"
  | "procuracao"
  | "administrativo_inss"
  | "quesitos"
  | "notificacao"
  | "outro";

export type DocAreaDireito =
  | "previdenciario"
  | "familia"
  | "civil"
  | "trabalhista"
  | "tributario"
  | "consumidor"
  | "geral";

export type DocPecaStatus =
  | "rascunho"
  | "em_revisao"
  | "revisado"
  | "finalizado"
  | "protocolado";

export type DocVariavelFonte =
  | "fixo"
  | "processo"
  | "cliente"
  | "advogado"
  | "manual";

export interface DocModelo {
  id: string;
  titulo: string;
  descricao: string | null;
  categoria: DocCategoria;
  area_direito: DocAreaDireito | null;
  conteudo_html: string;
  variaveis_usadas: string[];
  fonte: string | null;
  tamanho_fonte: number | null;
  margem_superior: number | null;
  margem_inferior: number | null;
  margem_esquerda: number | null;
  margem_direita: number | null;
  espacamento_entre_linhas: number | null;
  ativo: boolean;
  uso_count: number;
  criado_por: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface DocPeca {
  id: string;
  titulo: string;
  categoria: DocCategoria;
  processo_id: string;
  cliente_id: string;
  modelo_id: string | null;
  conteudo_html: string;
  status: DocPecaStatus;
  versao_atual: number;
  fonte: string | null;
  tamanho_fonte: number | null;
  margem_superior: number | null;
  margem_inferior: number | null;
  margem_esquerda: number | null;
  margem_direita: number | null;
  espacamento_entre_linhas: number | null;
  url_docx: string | null;
  url_pdf: string | null;
  elaborado_por: string | null;
  revisado_por: string | null;
  finalizado_por: string | null;
  finalizado_em: string | null;
  protocolado_em: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface DocPecaVersao {
  id: string;
  peca_id: string;
  numero_versao: number;
  nome_versao: string | null;
  conteudo_html: string;
  salvo_por: string | null;
  salvo_em: string;
}

export interface DocComentario {
  id: string;
  peca_id: string;
  trecho_texto: string | null;
  comentario: string;
  resolvido: boolean;
  autor_id: string | null;
  criado_em: string;
  resolvido_em: string | null;
  resolvido_por: string | null;
}

export interface DocVariavelCustomizada {
  id: string;
  chave: string;
  nome_legivel: string;
  valor_padrao: string | null;
  fonte: DocVariavelFonte;
  campo_fonte: string | null;
  ativo: boolean;
  criado_em: string;
}

export const CATEGORIAS_LABEL: Record<DocCategoria, string> = {
  peticao_inicial: "Petição inicial",
  recurso: "Recurso",
  manifestacao: "Manifestação",
  contrato: "Contrato",
  procuracao: "Procuração",
  administrativo_inss: "Administrativo INSS",
  quesitos: "Quesitos",
  notificacao: "Notificação",
  outro: "Outro",
};

export const AREAS_LABEL: Record<DocAreaDireito, string> = {
  previdenciario: "Previdenciário",
  familia: "Família",
  civil: "Civil",
  trabalhista: "Trabalhista",
  tributario: "Tributário",
  consumidor: "Consumidor",
  geral: "Geral",
};

export const STATUS_LABEL: Record<DocPecaStatus, string> = {
  rascunho: "Rascunho",
  em_revisao: "Em revisão",
  revisado: "Revisado",
  finalizado: "Finalizado",
  protocolado: "Protocolado",
};

export const STATUS_COR: Record<DocPecaStatus, string> = {
  rascunho: "bg-muted text-muted-foreground",
  em_revisao: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  revisado: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  finalizado: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  protocolado: "bg-primary/15 text-primary",
};

export const PROXIMO_STATUS: Record<DocPecaStatus, DocPecaStatus | null> = {
  rascunho: "em_revisao",
  em_revisao: "revisado",
  revisado: "finalizado",
  finalizado: "protocolado",
  protocolado: null,
};
