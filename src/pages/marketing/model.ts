export type Tipo =
  | "tarefa"
  | "rotina"
  | "concorrente"
  | "pesquisa"
  | "ideia"
  | "planejamento"
  | "pauta"
  | "conteudo"
  | "roteiro"
  | "artigo"
  | "gravacao"
  | "material"
  | "campanha";
export interface Item {
  pacote_id?: string | null;
  modelo_id?: string | null;
  id: string;
  tipo: Tipo;
  titulo: string;
  descricao: string;
  status: string;
  prioridade: string;
  responsavel_id: string | null;
  area_id: string | null;
  servico_id: string | null;
  tese_id: string | null;
  origem_id: string | null;
  campanha_id: string | null;
  planejamento_id: string | null;
  pauta_id: string | null;
  canal: string | null;
  formato: string | null;
  prazo: string | null;
  data_prevista: string | null;
  dados: Record<string, any>;
  versao: number;
  versao_aprovada: number | null;
  roteiro_aprovado: number | null;
  arquivado_em: string | null;
  criado_em: string;
  atualizado_em: string;
}
export interface Contexto {
  permissoes: Record<string, boolean>;
  usuarios: Opcao[];
  areas: Opcao[];
  servicos: Opcao[];
  teses: Opcao[];
  tese_servicos: any[];
  clientes: Opcao[];
  leads: Opcao[];
  contratos: any[];
  acessos: any[];
  campanhas?: Opcao[];
}
export interface Opcao {
  id: string;
  nome: string;
  [key: string]: any;
}
export const STATUS: Record<string, string> = {
  rascunho: "Rascunho / novo",
  producao: "Em produção",
  revisao: "Revisão interna",
  aguardando_aprovacao: "Aguardando aprovação",
  ajustes: "Ajustes solicitados",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
  aguardando_gravacao: "Aguardando gravação",
  gravado: "Gravado",
  edicao: "Em edição",
  pronto: "Pronto para publicar",
  publicado: "Publicado",
  concluido: "Concluído",
  arquivado: "Arquivado",
  convertida: "Convertida em pauta",
  ativa: "Campanha ativa",
  pausada: "Campanha pausada",
  encerrada: "Campanha encerrada",
};
export const TIPOS: Record<Tipo, string> = {
  tarefa: "Tarefa",
  rotina: "Rotina recorrente",
  concorrente: "Concorrente",
  pesquisa: "Pesquisa de mercado",
  ideia: "Ideia",
  planejamento: "Planejamento editorial",
  pauta: "Pauta",
  conteudo: "Conteúdo",
  roteiro: "Roteiro",
  artigo: "Artigo jurídico",
  gravacao: "Sessão de gravação",
  material: "Material do Drive",
  campanha: "Campanha",
};
export const MENUS: readonly {
  nome: string;
  itens: readonly (readonly [string, string])[];
}[] = [
  {
    nome: "Visão Geral",
    itens: [
      ["visao", "Dashboard"],
      ["tarefas", "Minhas Tarefas"],
      ["equipe", "Atividades da Equipe"],
    ],
  },
  {
    nome: "Planejamento",
    itens: [
      ["ideias", "Banco de Ideias"],
      ["calendario", "Calendário Editorial"],
      ["campanhas", "Campanhas"],
      ["pacotes", "Pacotes de Conteúdo"],
    ],
  },
  {
    nome: "Produção",
    itens: [
      ["producao", "Central de Produção"],
      ["posts", "Posts e Carrosséis"],
      ["roteiros", "Roteiros de Vídeos"],
      ["gravacoes", "Gravações"],
      ["artigos", "Artigos Jurídicos"],
      ["biblioteca", "Biblioteca de Materiais"],
      ["modelos", "Modelos de Conteúdo"],
    ],
  },
  {
    nome: "Aprovações",
    itens: [
      ["aprovacoes", "Aguardando Aprovação"],
      ["ajustes", "Ajustes Solicitados"],
      ["historico", "Histórico de Aprovações"],
    ],
  },
  {
    nome: "Resultados",
    itens: [
      ["publicacoes", "Publicações"],
      ["relatorios", "Relatórios de Marketing"],
      ["demanda", "Análise de Demanda Jurídica"],
      ["oportunidades", "Oportunidades de Conteúdo"],
      ["resumo", "Resumo Semanal e Mensal"],
    ],
  },
];
export const SECOES = MENUS.flatMap((m) => m.itens);
export const CANAIS = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  site_blog: "Site / blog",
};
export const FORMATOS = {
  feed_foto: "Post estático / institucional",
  carrossel: "Carrossel",
  story: "Stories",
  reels: "Reels",
  video_longo: "Vídeo longo",
  blog_post: "Artigo",
  live: "Live / outros",
};
export const CHECKLIST = {
  informacoes: "Revisão das informações jurídicas",
  sem_promessas: "Ausência de promessas de resultados",
  linguagem: "Linguagem adequada à publicidade profissional",
  privacidade: "Proteção de dados pessoais",
  referencias: "Verificação das referências",
  autoria: "Conferência de autoria",
  cta: "Adequação da chamada para ação",
};
export interface Campo {
  chave: string;
  rotulo: string;
  tipo?: "texto" | "longo" | "data" | "numero" | "select" | "editor";
  opcoes?: Record<string, string>;
}
const campo = (
  chave: string,
  rotulo: string,
  tipo: Campo["tipo"] = "texto",
  opcoes?: Record<string, string>,
): Campo => ({ chave, rotulo, tipo, opcoes });
const base = [
  campo("publico", "Público-alvo"),
  campo("objetivo", "Objetivo", "longo"),
  campo("referencias", "Referências e links", "longo"),
];
export const CAMPOS: Record<Tipo, Campo[]> = {
  tarefa: [
    campo("categoria", "Categoria"),
    campo("inicio", "Data de início", "data"),
    campo("links", "Links de apoio", "longo"),
  ],
  rotina: [
    campo("frequencia", "Frequência", "select", {
      diaria: "Diária",
      semanal: "Semanal",
      mensal: "Mensal",
    }),
    campo("categoria", "Categoria"),
  ],
  concorrente: [
    campo("cidade", "Cidade"),
    campo("estado", "Estado"),
    ...["site", "instagram", "facebook", "tiktok", "youtube"].map((k) =>
      campo(k, k[0].toUpperCase() + k.slice(1)),
    ),
    campo("outras_redes", "Outras redes e links", "longo"),
    campo("areas", "Áreas jurídicas", "longo"),
    ...base,
    campo("servicos", "Principais serviços divulgados", "longo"),
    campo("posicionamento", "Posicionamento de comunicação", "longo"),
    campo("frequencia", "Frequência de publicação observada"),
    campo("formatos", "Formatos utilizados"),
    campo("temas", "Temas recorrentes", "longo"),
    campo("pontos_fortes", "Pontos fortes", "longo"),
    campo("pontos_fracos", "Pontos fracos", "longo"),
    campo("oportunidades", "Oportunidades identificadas", "longo"),
    campo("ultima_analise", "Data da última análise", "data"),
  ],
  pesquisa: [
    campo("categoria", "Tipo de pesquisa", "select", {
      concorrente: "Análise de concorrente",
      tendencia: "Tendência",
      duvidas: "Dúvidas frequentes",
      datas: "Datas relevantes",
      campanha: "Oportunidade de campanha",
      referencia: "Referência de mercado",
    }),
    campo("periodo_inicio", "Período observado: início", "data"),
    campo("periodo_fim", "Período observado: fim", "data"),
    campo("conteudos_analisados", "Conteúdos analisados", "longo"),
    campo("estrategias", "Estratégias identificadas", "longo"),
    campo("oportunidades", "Oportunidades", "longo"),
    campo("referencias", "Referências e links", "longo"),
    campo("link_drive", "Anexo no Google Drive"),
  ],
  ideia: [
    ...base,
    campo("origem", "Origem da ideia"),
    campo("formato_sugerido", "Formato sugerido"),
    campo("link_referencia", "Link de referência"),
  ],
  planejamento: [
    campo("periodo_inicio", "Início do planejamento", "data"),
    campo("periodo_fim", "Fim do planejamento", "data"),
    campo("objetivo", "Objetivo estratégico", "longo"),
  ],
  pauta: [
    ...base,
    campo("prazo_producao", "Prazo de produção", "data"),
    campo("prazo_revisao", "Prazo de revisão", "data"),
    campo("prazo_aprovacao", "Prazo de aprovação", "data"),
    campo("observacoes", "Observações", "longo"),
  ],
  conteudo: [
    ...base,
    campo("texto", "Texto principal", "longo"),
    campo("slides", "Slides: um texto por linha", "longo"),
    campo("quantidade_slides", "Quantidade de slides", "numero"),
    campo("orientacoes_visuais", "Orientações visuais", "longo"),
    campo("legenda", "Legenda", "longo"),
    campo("cta", "Chamada para ação"),
    campo("link_drive", "Arte / mídia no Google Drive"),
    campo("versao_arquivo", "Identificação da versão do arquivo"),
  ],
  roteiro: [
    ...base,
    campo("tema", "Tema"),
    campo("tipo_video", "Tipo de produção", "select", {
      advogada: "Gravado pela advogada",
      equipe: "Produzido pela equipe",
      narracao: "Imagens e narração",
      institucional: "Institucional",
    }),
    campo("duracao", "Duração estimada (segundos)", "numero"),
    campo("gancho", "Gancho inicial", "longo"),
    campo("introducao", "Introdução", "longo"),
    campo("desenvolvimento", "Desenvolvimento", "longo"),
    campo("encerramento", "Encerramento", "longo"),
    campo("cta", "Chamada para ação"),
    campo("texto_gravacao", "Texto completo para gravação", "longo"),
    campo("fala", "Orientações de fala", "longo"),
    campo("cenario", "Orientações de cenário", "longo"),
    campo("cenas", "Sugestões de cenas", "longo"),
    campo("legenda", "Legenda", "longo"),
    campo("link_drive", "Vídeo final no Google Drive"),
    campo("versao_arquivo", "Versão do vídeo final"),
  ],
  artigo: [
    ...base,
    campo("palavra_chave", "Palavra-chave principal"),
    campo("palavras_secundarias", "Palavras-chave secundárias"),
    campo("resumo", "Descrição resumida", "longo"),
    campo("subtitulos", "Estrutura de subtítulos", "longo"),
    campo("html", "Conteúdo completo", "editor"),
    campo("referencias_juridicas", "Referências jurídicas e links", "longo"),
    campo("revisar_em", "Próxima revisão jurídica", "data"),
  ],
  gravacao: [
    campo("local", "Local"),
    campo("orientacoes", "Orientações", "longo"),
  ],
  material: [
    campo("categoria", "Categoria", "select", {
      logo: "Logotipos",
      identidade: "Identidade visual",
      foto: "Fotografias",
      arte: "Artes",
      video: "Vídeos",
      modelo: "Modelos de carrossel",
      institucional: "Institucional",
      referencia: "Referências",
      aprovado: "Materiais aprovados",
    }),
    campo("tipo_arquivo", "Tipo de arquivo"),
    campo("link_drive", "Link do Google Drive"),
    campo("versao_arquivo", "Identificação da versão"),
    campo("observacoes", "Observações", "longo"),
  ],
  campanha: [
    ...base,
    campo("objetivo_campanha", "Objetivo da campanha", "select", {
      leads: "Leads",
      trafego: "Tráfego",
      alcance: "Alcance",
      conversao: "Conversão",
      engajamento: "Engajamento",
    }),
    campo("data_fim", "Data final", "data"),
    campo("observacoes", "Observações", "longo"),
  ],
};
export const prioridadePeso: Record<string, number> = {
  urgente: 0,
  alta: 1,
  normal: 2,
  baixa: 3,
};
export function ordenarRotina(itens: Item[]) {
  return [...itens].sort(
    (a, b) =>
      prioridadePeso[a.prioridade] - prioridadePeso[b.prioridade] ||
      (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999"),
  );
}
export function linkSeguro(url: string, drive = false) {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      (!drive || ["drive.google.com", "docs.google.com"].includes(u.hostname))
    );
  } catch {
    return false;
  }
}
export function podePublicar(i: Item) {
  return (
    ["conteudo", "roteiro", "artigo"].includes(i.tipo) &&
    ["aprovado", "pronto"].includes(i.status) &&
    i.versao_aprovada === i.versao
  );
}
export function periodo(itens: Item[], inicio: string, fim: string) {
  return itens.filter(
    (i) =>
      i.criado_em.slice(0, 10) >= inicio && i.criado_em.slice(0, 10) <= fim,
  );
}
export function diaLocal(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
