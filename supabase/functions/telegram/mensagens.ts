// Textos e formatos do Telegram (sem acesso a rede ou banco, para testar isolado).

export interface Aprovacao {
  id: string;
  tipo: string;
  agente: string | null;
  resumo: string;
  riscos: string | null;
  parametros: Record<string, unknown>;
  escopo_hash: string;
  valida_ate: string;
}

const CAMPO: Record<string, string> = {
  titulo: "Título",
  descricao: "Descrição",
  data_vencimento: "Vencimento",
  prioridade: "Prioridade",
  autor: "Para",
  comentario: "Comentário",
  mensagem: "Resposta",
  plataforma: "Rede",
  conta: "Conta",
  texto: "Texto do post",
  midia_url: "Imagem/vídeo",
  agendar_para: "Quando",
};
const OCULTOS = new Set(["post_id", "conta_id", "comentario_id", "processo_id"]);

/** Separa "/comando resto" (aceita /comando@NomeDoBot). Texto comum vem com nome vazio. */
export function comando(texto: string): { nome: string; resto: string } {
  const m = texto.trim().match(/^\/([a-zçãõáéíóú_]+)(?:@\w+)?\s*([\s\S]*)$/i);
  if (!m) return { nome: "", resto: texto.trim() };
  const nome = m[1].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return { nome, resto: m[2].trim() };
}

export const dadosBotao = (id: string, aprovar: boolean) => `ap:${id}:${aprovar ? "s" : "n"}`;

export function lerBotao(dados: string): { id: string; aprovar: boolean } | null {
  const m = dados.match(/^ap:([0-9a-f-]{36}):([sn])$/i);
  return m ? { id: m[1], aprovar: m[2] === "s" } : null;
}

export function textoAprovacao(a: Aprovacao): string {
  const valor = (k: string, v: unknown) =>
    k === "data_vencimento" ? String(v).split("-").reverse().join("/")
      : k === "agendar_para"
        ? new Date(String(v)).toLocaleString("pt-BR", { timeZone: "America/Cuiaba", dateStyle: "short", timeStyle: "short" })
        : String(v);
  const campos = Object.entries(a.parametros ?? {})
    .filter(([k, v]) => !OCULTOS.has(k) && v != null && v !== "")
    .map(([k, v]) => `• ${CAMPO[k] ?? k}: ${valor(k, v)}`);
  return [
    `🔔 Pedido de aprovação${a.agente ? ` · ${a.agente}` : ""}`,
    a.resumo,
    ...campos,
    a.riscos ? `⚠️ ${a.riscos}` : "",
    `Vale até ${new Date(a.valida_ate).toLocaleDateString("pt-BR", { timeZone: "America/Cuiaba" })}.`,
  ].filter(Boolean).join("\n");
}

export function ajuda(vinculado: boolean): string {
  if (!vinculado)
    return "Olá! Sou o canal do escritório Juliana Araújo Advocacia.\n\n" +
      "Para usar, gere o código no JAS (Escritório › Aprovações › Telegram) e envie aqui:\n/vincular SEU-CÓDIGO";
  return "Como usar:\n" +
    "• Escreva normalmente para falar com a Gestora.\n" +
    "• /missao texto — cria uma missão para a Gestora.\n" +
    "• /aprovacoes — mostra os pedidos esperando você, com botões para aprovar ou recusar.\n" +
    "• /desvincular — desliga este Telegram do JAS.\n\n" +
    "Pedidos novos de aprovação chegam aqui automaticamente.";
}
