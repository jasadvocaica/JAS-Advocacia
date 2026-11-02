import type { DocPecaStatus } from "./types";

export interface FonteProducao {
  id: string;
  titulo: string;
  url: string;
  trecho: string;
  origem?: "biblioteca";
  dispositivo_id?: string;
  versao_sha?: string;
  commit?: string;
}

export interface ContextoProducao {
  pesquisa_legislacao?: string;
  norma_pesquisa?: string;
  provedor_ia?: "openai" | "anthropic";
  tarefa_id: string;
  intimacao: string;
  objetivo: string;
  orientacoes: string;
  documentos: string;
  prazo_interno: string;
  prazo_processual: string;
  prazo_conferido: boolean;
  fontes: FonteProducao[];
  checklist: string[];
  ultima_ia?: {
    fontes_consultadas?: import("@/lib/biblioteca-juridica").FonteLegal[];
    fontes_utilizadas?: import("@/lib/biblioteca-juridica").FonteLegal[];
    avisos_pesquisa?: string[];
    provedor?: "openai" | "anthropic";
    modelo?: string;
    acao: string;
    texto: string;
    pendencias: string[];
    gerado_em: string;
  };
}

export const CHECKLIST_REVISAO = [
  { id: "fatos", label: "Fatos e datas conferidos com os documentos" },
  { id: "pedido", label: "Determinação judicial e pedidos atendidos" },
  {
    id: "fontes",
    label: "Fundamentos, citações e redação aplicável conferidos",
  },
  { id: "anexos", label: "Anexos e documentos necessários conferidos" },
  {
    id: "formatacao",
    label: "Qualificação, assinatura e formatação conferidas",
  },
] as const;

export function normalizarContexto(
  valor?: Partial<ContextoProducao> | null,
): ContextoProducao {
  return {
    tarefa_id: "",
    intimacao: "",
    objetivo: "",
    orientacoes: "",
    documentos: "",
    prazo_interno: "",
    prazo_processual: "",
    prazo_conferido: false,
    ...valor,
    fontes: Array.isArray(valor?.fontes) ? valor.fontes : [],
    checklist: Array.isArray(valor?.checklist) ? valor.checklist : [],
  };
}

export function textoDoHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style").forEach((el) => el.remove());
  doc
    .querySelectorAll("p,h1,h2,h3,li,blockquote,br")
    .forEach((el) => el.append("\n"));
  return (doc.body.textContent ?? "").trim();
}

// Saída da IA é texto, nunca HTML confiável. Preserva parágrafos sem executar marcação.
export function textoParaHtml(texto: string): string {
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  return (
    texto
      .trim()
      .split(/\n\s*\n/)
      .map((p) => `<p>${escape(p).replace(/\n/g, "<br>")}</p>`)
      .join("") || "<p></p>"
  );
}

export function urlFonteSegura(url: string): boolean {
  try {
    return ["https:", "http:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

export function pendenciasDocumento(html: string): string[] {
  const texto = textoDoHtml(html);
  return [
    ...new Set(
      texto.match(/\{\{[^}]+\}\}|\[(?:INSERIR|PENDENTE|CONFERIR)[^\]]*\]/gi) ??
        [],
    ),
  ];
}

export function bloqueiosRevisao(params: {
  html: string;
  contexto: ContextoProducao;
  comentariosAbertos: number;
  proximo: DocPecaStatus;
}): string[] {
  const { html, contexto, comentariosAbertos, proximo } = params;
  const pendencias: string[] = [];
  if (!textoDoHtml(html)) pendencias.push("O documento está vazio.");
  if (pendenciasDocumento(html).length)
    pendencias.push("Preencha os campos pendentes do documento.");
  if (["revisado", "finalizado", "protocolado"].includes(proximo)) {
    if (CHECKLIST_REVISAO.some((item) => !contexto.checklist.includes(item.id)))
      pendencias.push("Conclua a conferência de revisão.");
    if (comentariosAbertos)
      pendencias.push("Resolva os comentários de revisão abertos.");
    if (
      (contexto.intimacao || contexto.prazo_processual) &&
      !contexto.prazo_conferido
    )
      pendencias.push("Confirme a conferência do prazo pelo responsável.");
  }
  return pendencias;
}
