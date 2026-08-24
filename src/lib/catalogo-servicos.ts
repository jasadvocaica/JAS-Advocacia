/**
 * Catálogo Mestre de Serviços — tipos, rótulos e regras puras.
 * ETAPA 1: cadastro/homologação. Não integra POP, produção jurídica ou financeiro.
 */

export type StatusHomologacao =
  | "a_confirmar"
  | "ativo"
  | "inativo"
  | "unificar"
  | "renomear"
  | "descartar";

export type PublicoServico = "pf" | "pj" | "ambos";

export type TipoPergunta =
  | "texto"
  | "texto_longo"
  | "opcao"
  | "multipla"
  | "booleano"
  | "numero"
  | "data";

export interface CatalogoServico {
  id: string;
  nome: string;
  area: string;
  subtipo: string | null;
  descricao: string | null;
  status_homologacao: StatusHomologacao;
  publico: PublicoServico;
  ativo_operacional: boolean;
  valor_referencia: number | null;
  observacao_comercial: string | null;
  comercial: Record<string, unknown>;
  template_id: string | null;
  responsavel_id: string | null;
  revisor_id: string | null;
  parceiro_id: string | null;
  sla_dias_uteis: number | null;
  sla_metadados: Record<string, unknown>;
  conteudo: Record<string, unknown>;
  origem_tabela: string | null;
  origem_id: string | null;
  origem_texto: string | null;
  possivel_duplicidade: boolean;
  duplicidade_grupo: string | null;
  duplicidade_justificativa: string | null;
  // ---- Fase de homologação: decisão x sugestão ----
  classificacao: Classificacao;
  classificacao_sugerida: Classificacao;
  classificacao_justificativa: string | null;
  servico_principal_id: string | null;
  servico_principal_sugerido_id: string | null;
  servico_principal_sugerido_nome: string | null;
  modalidade: string | null;
  modalidade_sugerida: string | null;
  area_sugerida: string | null;
  area_sugerida_justificativa: string | null;
  acao_recomendada: AcaoRecomendada;
  duplicidade_sugerida: boolean;
  duplicidade_sugerida_justificativa: string | null;
  sugestao_atualizada_em: string | null;
  metadados: Record<string, unknown>;
  criado_em: string;
  atualizado_em: string;
}

export type Classificacao =
  | "servico_juridico"
  | "pop_auxiliar"
  | "modelo_documento"
  | "legado_descartar"
  | "a_confirmar";

export type AcaoRecomendada =
  | "manter_servico"
  | "transformar_modalidade"
  | "transformar_pop_auxiliar"
  | "transformar_modelo"
  | "unificar"
  | "descartar_legado"
  | "precisa_decisao";

export const CLASSIFICACAO_LABEL: Record<Classificacao, string> = {
  servico_juridico: "Serviço Jurídico",
  pop_auxiliar: "POP Auxiliar",
  modelo_documento: "Modelo/Documento",
  legado_descartar: "Legado/Descartar",
  a_confirmar: "A Confirmar",
};

export const CLASSIFICACAO_COR: Record<Classificacao, string> = {
  servico_juridico: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  pop_auxiliar: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  modelo_documento: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
  legado_descartar: "bg-destructive/15 text-destructive",
  a_confirmar: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
};

export const ACAO_RECOMENDADA_LABEL: Record<AcaoRecomendada, string> = {
  manter_servico: "Manter como serviço",
  transformar_modalidade: "Transformar em modalidade",
  transformar_pop_auxiliar: "Transformar em POP auxiliar",
  transformar_modelo: "Transformar em modelo/documento",
  unificar: "Unificar",
  descartar_legado: "Descartar (legado)",
  precisa_decisao: "Precisa decisão",
};

/**
 * Homologação = decisão manual do gestor sobre classificação/área/modalidade
 * e serviço principal. NUNCA ativa o serviço nem toca em POP, responsável,
 * SLA ou qualquer integração operacional.
 */
export interface DecisaoHomologacao {
  classificacao?: Classificacao;
  area?: string;
  modalidade?: string | null;
  servico_principal_id?: string | null;
  possivel_duplicidade?: boolean;
  duplicidade_justificativa?: string | null;
}

const CAMPOS_HOMOLOGAVEIS = [
  "classificacao",
  "area",
  "modalidade",
  "servico_principal_id",
  "possivel_duplicidade",
  "duplicidade_justificativa",
] as const;

/**
 * Monta o patch de homologação, garantindo que apenas os campos de decisão
 * sejam gravados (nunca ativo_operacional, template_id, responsáveis, SLA…).
 */
export function montarPatchHomologacao(
  decisao: DecisaoHomologacao & Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const campo of CAMPOS_HOMOLOGAVEIS) {
    if (campo in decisao) patch[campo] = decisao[campo];
  }
  return patch;
}

/** Um item só pode ser ativado operacionalmente após sair de "a confirmar". */
export function podeAtivarOperacional(
  s: Pick<CatalogoServico, "status_homologacao" | "classificacao">,
): boolean {
  return s.status_homologacao !== "a_confirmar" && s.classificacao !== "a_confirmar";
}

/** Self-FK: serviço não pode ser principal de si mesmo nem criar ciclo direto. */
export function validarServicoPrincipal(
  id: string,
  principalId: string | null,
  principaisPorId: Record<string, string | null> = {},
): ErroValidacao | null {
  if (!principalId) return null;
  if (principalId === id) {
    return { campo: "servico_principal_id", mensagem: "Um serviço não pode ser principal de si mesmo." };
  }
  if (principaisPorId[principalId] === id) {
    return { campo: "servico_principal_id", mensagem: "Referência circular entre serviço e serviço principal." };
  }
  return null;
}

export type FiltroClassificacao = Classificacao | "todas";

/** Filtra por classificação homologada ou sugerida. */
export function filtrarPorClassificacao<
  T extends { classificacao: Classificacao; classificacao_sugerida: Classificacao },
>(itens: T[], filtro: FiltroClassificacao, base: "homologada" | "sugerida"): T[] {
  if (filtro === "todas") return itens;
  return itens.filter((i) =>
    base === "homologada" ? i.classificacao === filtro : i.classificacao_sugerida === filtro,
  );
}


export interface CatalogoPergunta {
  id: string;
  servico_id: string;
  ordem: number;
  pergunta: string;
  tipo: TipoPergunta;
  opcoes: string[];
  obrigatoria: boolean;
}

export interface CatalogoDocumento {
  id: string;
  servico_id: string;
  ordem: number;
  nome: string;
  obrigatorio: boolean;
  observacao: string | null;
}

export const STATUS_HOMOLOGACAO_LABEL: Record<StatusHomologacao, string> = {
  a_confirmar: "A confirmar",
  ativo: "Ativo",
  inativo: "Inativo",
  unificar: "Unificar",
  renomear: "Renomear",
  descartar: "Descartar",
};

export const STATUS_HOMOLOGACAO_COR: Record<StatusHomologacao, string> = {
  a_confirmar: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  ativo: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  inativo: "bg-muted text-muted-foreground",
  unificar: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  renomear: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
  descartar: "bg-destructive/15 text-destructive",
};

export const PUBLICO_LABEL: Record<PublicoServico, string> = {
  pf: "PF",
  pj: "PJ",
  ambos: "PF e PJ",
};

export const TIPO_PERGUNTA_LABEL: Record<TipoPergunta, string> = {
  texto: "Texto curto",
  texto_longo: "Texto longo",
  opcao: "Escolha única",
  multipla: "Escolha múltipla",
  booleano: "Sim / Não",
  numero: "Número",
  data: "Data",
};

export const AREA_LABEL: Record<string, string> = {
  previdenciario: "Previdenciário",
  familia: "Família",
  civil: "Cível",
  civel: "Cível",
  trabalhista: "Trabalhista",
  tributario: "Tributário",
  consumidor: "Consumidor",
  criminal: "Criminal",
  administrativo: "Administrativo",
  saude: "Saúde",
  geral: "Geral",
  outro: "Outro / a classificar",
};

export function rotuloArea(area: string | null | undefined): string {
  if (!area) return "Sem área";
  const chave = normalizarChave(area);
  return AREA_LABEL[chave] ?? area;
}

/** Normalização equivalente à função catalogo_norm do banco. */
export function normalizarChave(texto: string | null | undefined): string {
  if (!texto) return "";
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type IndicadorCodigo =
  | "sem_pop"
  | "sem_responsavel"
  | "sem_triagem"
  | "sem_documentos"
  | "incompleto"
  | "configurado";

export interface Indicador {
  codigo: IndicadorCodigo;
  label: string;
  tom: "ok" | "alerta" | "neutro";
}

/**
 * Indicadores de completude do serviço no catálogo.
 * "CONFIGURADO" só quando há POP, responsável, triagem e documentos.
 */
export function indicadoresServico(
  servico: Pick<CatalogoServico, "template_id" | "responsavel_id">,
  totalPerguntas: number,
  totalDocumentos: number,
): Indicador[] {
  const faltas: Indicador[] = [];
  if (!servico.template_id) faltas.push({ codigo: "sem_pop", label: "SEM POP", tom: "alerta" });
  if (!servico.responsavel_id)
    faltas.push({ codigo: "sem_responsavel", label: "SEM RESPONSÁVEL", tom: "alerta" });
  if (totalPerguntas === 0)
    faltas.push({ codigo: "sem_triagem", label: "SEM TRIAGEM", tom: "neutro" });
  if (totalDocumentos === 0)
    faltas.push({ codigo: "sem_documentos", label: "SEM DOCUMENTOS", tom: "neutro" });

  if (faltas.length === 0) {
    return [{ codigo: "configurado", label: "CONFIGURADO", tom: "ok" }];
  }
  return [{ codigo: "incompleto", label: "INCOMPLETO", tom: "alerta" }, ...faltas];
}

export interface ErroValidacao {
  campo: string;
  mensagem: string;
}

/** Validação do formulário do serviço (Geral). */
export function validarServico(dados: {
  nome?: string | null;
  area?: string | null;
  status_homologacao?: string | null;
  publico?: string | null;
  ativo_operacional?: boolean;
  sla_dias_uteis?: number | null;
}): ErroValidacao[] {
  const erros: ErroValidacao[] = [];
  if (!normalizarChave(dados.nome)) erros.push({ campo: "nome", mensagem: "Informe o nome do serviço." });
  if (!normalizarChave(dados.area)) erros.push({ campo: "area", mensagem: "Informe a área do direito." });
  if (dados.status_homologacao && !(dados.status_homologacao in STATUS_HOMOLOGACAO_LABEL)) {
    erros.push({ campo: "status_homologacao", mensagem: "Status de homologação inválido." });
  }
  if (dados.publico && !(dados.publico in PUBLICO_LABEL)) {
    erros.push({ campo: "publico", mensagem: "Público inválido." });
  }
  if (dados.ativo_operacional && dados.status_homologacao === "a_confirmar") {
    erros.push({
      campo: "ativo_operacional",
      mensagem: "Um serviço 'A confirmar' não pode ser ativado operacionalmente.",
    });
  }
  if (dados.sla_dias_uteis != null && (dados.sla_dias_uteis < 0 || !Number.isInteger(dados.sla_dias_uteis))) {
    erros.push({ campo: "sla_dias_uteis", mensagem: "SLA deve ser um número inteiro de dias úteis." });
  }
  return erros;
}

/** Agrupa serviços por área do direito, ordenado por rótulo da área e nome. */
export function agruparPorArea<T extends { area: string; nome: string }>(
  servicos: T[],
): { area: string; rotulo: string; itens: T[] }[] {
  const mapa = new Map<string, T[]>();
  for (const s of servicos) {
    const chave = normalizarChave(s.area) || "sem_area";
    const lista = mapa.get(chave) ?? [];
    lista.push(s);
    mapa.set(chave, lista);
  }
  return Array.from(mapa.entries())
    .map(([area, itens]) => ({
      area,
      rotulo: rotuloArea(area),
      itens: [...itens].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}
