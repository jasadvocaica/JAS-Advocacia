export const GATILHO_LABELS: Record<string, string> = {
  manual: "Manual (sem gatilho automático)",
  bpc_negado: "BPC/LOAS negado",
  bpc_deferido: "BPC/LOAS deferido",
  auxilio_negado: "Auxílio por incapacidade negado",
  auxilio_deferido: "Auxílio por incapacidade deferido",
  cliente_novo: "Cliente novo cadastrado",
  audiencia_marcada: "Audiência marcada",
  sentenca_recebida: "Sentença recebida",
  prazo_recurso_aberto: "Prazo de recurso aberto",
  peca_simples: "Peça simples",
};

export const GATILHO_OPTIONS = Object.entries(GATILHO_LABELS).map(([value, label]) => ({ value, label }));

export const AREA_OPTIONS = [
  { value: "previdenciario", label: "Previdenciário" },
  { value: "familia", label: "Família" },
  { value: "civil", label: "Cível" },
  { value: "trabalhista", label: "Trabalhista" },
  { value: "geral", label: "Geral" },
];

export const TIPO_ETAPA_OPTIONS = [
  { value: "prazo_fatal", label: "Prazo fatal" },
  { value: "prazo_processual", label: "Prazo processual" },
  { value: "tarefa", label: "Tarefa" },
  { value: "checklist", label: "Checklist" },
  { value: "comunicacao", label: "Comunicação" },
];

export const RESPONSAVEL_PADRAO_OPTIONS = [
  { value: "advogado_caso", label: "Advogado do caso" },
  { value: "gestor", label: "Gestor" },
  { value: "estagiario", label: "Estagiário" },
  { value: "_none", label: "Definir ao disparar" },
];

export const PRAZO_TIPO_OPTIONS = [
  { value: "uteis", label: "Dias úteis" },
  { value: "corridos", label: "Dias corridos" },
];

export const STATUS_INSTANCIA_LABELS: Record<string, string> = {
  em_andamento: "Em andamento",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

export interface FluxoTemplate {
  id: string;
  nome: string;
  descricao: string | null;
  gatilho: string;
  area: string | null;
  ativo: boolean;
  criado_em: string;
}

export interface EtapaTemplate {
  id: string;
  template_id: string;
  ordem: number;
  titulo: string;
  descricao: string | null;
  tipo: string;
  prazo_dias: number;
  prazo_tipo: string;
  prazo_referencia: string;
  responsavel_padrao: string | null;
  checklist_itens: string[];
  template_texto: string | null;
  obrigatorio: boolean;
  prioridade: string;
}

export interface FluxoInstancia {
  id: string;
  template_id: string;
  processo_id: string | null;
  cliente_id: string | null;
  data_gatilho: string;
  status: string;
  responsavel_id: string | null;
  observacoes: string | null;
  criado_em: string;
  template?: { nome: string; gatilho: string } | null;
  cliente?: { id: string; nome: string } | null;
  processo?: { id: string; numero_cnj: string | null } | null;
}

export interface InstanciaEtapa {
  id: string;
  instancia_id: string;
  ordem: number;
  titulo: string;
  descricao: string | null;
  tipo: string;
  data_vencimento: string | null;
  status: string;
  responsavel_id: string | null;
  checklist_itens: { item: string; concluido: boolean }[];
  template_texto: string | null;
  texto_preenchido: string | null;
  obrigatorio: boolean;
  concluido_em: string | null;
  item_controladoria_id: string | null;
}
