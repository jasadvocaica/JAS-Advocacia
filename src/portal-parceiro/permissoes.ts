/**
 * MATRIZ DE PERMISSÕES — PORTAL DO PARCEIRO
 * =========================================
 * Fonte única de verdade para o que o parceiro pode VER e FAZER em cada
 * página do portal. Usada pelo layout (esconder itens de menu) e pelas
 * páginas (esconder botões/seções).
 *
 * Princípio: tudo é negado por padrão. Só liberamos o que está aqui
 * explicitamente. Conteúdo interno do escritório (modelos, teses,
 * petições-padrão, base de clientes, financeiro global, tarefas de
 * outros) NUNCA é exposto, mesmo que a RLS deixe passar.
 *
 * As regras de banco (RLS + flags `compartilhar_com_parceiro` /
 * `visivel_parceiro`) são a 1ª camada. Este arquivo é a 2ª camada (UI).
 */

export type PaginaParceiro =
  | "dashboard"
  | "processos"
  | "processo_detalhe"
  | "clientes"
  | "indicacoes"
  | "tarefas"
  | "prazos"
  | "documentos"
  | "repasses"
  | "perfil";

export interface PermissoesPagina {
  /** Página aparece no menu lateral */
  visivelNoMenu: boolean;
  /** Pode acessar a rota (mesmo que não esteja no menu, ex.: detalhe) */
  podeAcessar: boolean;
  /** Ações específicas habilitadas nessa página */
  acoes: {
    visualizarLista?: boolean;
    visualizarDetalhe?: boolean;
    enviarMensagemNoChat?: boolean;
    uploadDocumento?: boolean;
    downloadDocumento?: boolean;
    concluirTarefaPropria?: boolean;
    editarPerfilProprio?: boolean;
  };
  /** O que o parceiro NÃO pode ver dentro dessa página */
  ocultar: string[];
}

export const PERMISSOES_PARCEIRO: Record<PaginaParceiro, PermissoesPagina> = {
  dashboard: {
    visivelNoMenu: true,
    podeAcessar: true,
    acoes: { visualizarLista: true },
    ocultar: [
      "Faturamento global do escritório",
      "Métricas de outros parceiros",
      "Lista de clientes do escritório",
      "Tarefas internas da equipe",
    ],
  },

  processos: {
    visivelNoMenu: true,
    podeAcessar: true,
    acoes: { visualizarLista: true },
    ocultar: [
      "Processos onde o parceiro não está vinculado",
      "Estratégia interna / observações privadas do escritório",
      "Honorários totais (só vê o repasse dele)",
    ],
  },

  processo_detalhe: {
    visivelNoMenu: false,
    podeAcessar: true,
    acoes: {
      visualizarDetalhe: true,
      enviarMensagemNoChat: true,
      uploadDocumento: true,
      downloadDocumento: true,
    },
    ocultar: [
      "Aba de teses/modelos do escritório",
      "Minutas internas não compartilhadas (compartilhar_com_parceiro=false)",
      "Comentários internos da controladoria",
      "Histórico de alterações da equipe",
      "Dados financeiros do contrato (só repasse próprio)",
      "Credenciais/cofre de senhas do cliente",
    ],
  },

  tarefas: {
    visivelNoMenu: true,
    podeAcessar: true,
    acoes: {
      visualizarLista: true,
      concluirTarefaPropria: true,
    },
    ocultar: [
      "Tarefas de outros responsáveis",
      "Tarefas marcadas como visivel_parceiro=false",
      "Backlog interno do escritório",
      "Atribuição de tarefas a terceiros",
    ],
  },

  prazos: {
    visivelNoMenu: true,
    podeAcessar: true,
    acoes: { visualizarLista: true },
    ocultar: [
      "Prazos de processos onde o parceiro não está vinculado",
      "Prazos marcados como visivel_parceiro=false",
      "Agenda interna da equipe (audiências/reuniões privadas)",
    ],
  },

  documentos: {
    visivelNoMenu: true,
    podeAcessar: true,
    acoes: {
      visualizarLista: true,
      uploadDocumento: true,
      downloadDocumento: true,
    },
    ocultar: [
      "Biblioteca de modelos/teses do escritório",
      "Documentos com compartilhar_com_parceiro=false",
      "Versões internas em rascunho",
      "Documentos de outros clientes",
      "Contratos e propostas comerciais do escritório",
    ],
  },

  repasses: {
    visivelNoMenu: true,
    podeAcessar: true,
    acoes: { visualizarLista: true },
    ocultar: [
      "Faturamento total do escritório",
      "Repasses de outros parceiros",
      "Custos operacionais e folha de pagamento",
      "Margem de lucro por contrato",
    ],
  },

  clientes: {
    visivelNoMenu: true,
    podeAcessar: true,
    acoes: { visualizarLista: true },
    ocultar: [
      "Clientes do escritório fora da carteira do parceiro",
      "Dados sigilosos não compartilhados (ex.: cofre de senhas)",
    ],
  },

  indicacoes: {
    visivelNoMenu: true,
    podeAcessar: true,
    acoes: { visualizarLista: true },
    ocultar: [
      "Submissões de outros parceiros",
      "Decisões internas sobre rejeição",
    ],
  },

  perfil: {
    visivelNoMenu: true,
    podeAcessar: true,
    acoes: { editarPerfilProprio: true },
    ocultar: [
      "Permissões internas do sistema",
      "Configurações do escritório",
      "Logs de outros usuários",
    ],
  },
};

/**
 * Lista de chaves usadas em <Link>/menu (deve casar com PortalParceiroLayout).
 * Mantemos um helper para o layout decidir o que renderizar.
 */
export const NAV_PARCEIRO_KEYS: { key: PaginaParceiro; to: string }[] = [
  { key: "dashboard", to: "" },
  { key: "processos", to: "processos" },
  { key: "clientes", to: "clientes" },
  { key: "indicacoes", to: "indicacoes" },
  { key: "tarefas", to: "tarefas" },
  { key: "prazos", to: "prazos" },
  { key: "documentos", to: "documentos" },
  { key: "repasses", to: "repasses" },
  { key: "perfil", to: "perfil" },
];

export function podeAcessar(pagina: PaginaParceiro): boolean {
  return PERMISSOES_PARCEIRO[pagina]?.podeAcessar ?? false;
}

export function podeFazer(
  pagina: PaginaParceiro,
  acao: keyof PermissoesPagina["acoes"],
): boolean {
  return PERMISSOES_PARCEIRO[pagina]?.acoes[acao] === true;
}
