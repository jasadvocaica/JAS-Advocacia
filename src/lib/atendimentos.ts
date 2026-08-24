import { supabase } from "@/integrations/supabase/client";

export type FerramentaAtendimento =
  | "analisador_caso"
  | "analise_publicacoes_ia"
  | "publicacoes_pje"
  | "manual";

export interface RegistrarAtendimentoInput {
  clienteId: string;
  titulo: string;
  resumo: string;
  ferramenta: FerramentaAtendimento;
  link?: string | null;
  processoId?: string | null;
  metadados?: Record<string, unknown>;
  criadoPor?: string | null;
  origem?: "sistema" | "manual";
}

/**
 * Registra um atendimento na ficha do cliente.
 * Grava em duas tabelas:
 *  - cliente_atendimentos: registro estruturado (com link, ferramenta, metadados)
 *  - cliente_interacoes: linha do tempo do Histórico (tipo "sistema" para automáticos)
 *
 * Não lança erro para não bloquear o fluxo principal — retorna o erro mais relevante.
 */
export async function registrarAtendimento(input: RegistrarAtendimentoInput) {
  if (!input.clienteId || !input.titulo?.trim() || !input.resumo?.trim()) {
    return { data: null, error: new Error("Dados incompletos para registrar atendimento") };
  }

  const titulo = input.titulo.trim();
  const resumo = input.resumo.trim();
  const origem = input.origem ?? "sistema";

  const { data, error } = await supabase
    .from("cliente_atendimentos")
    .insert({
      cliente_id: input.clienteId,
      titulo,
      resumo,
      ferramenta: input.ferramenta,
      link: input.link ?? null,
      processo_id: input.processoId ?? null,
      metadados: (input.metadados ?? {}) as never,
      origem,
      criado_por: input.criadoPor ?? null,
    })
    .select("id")
    .single();

  // Espelha no Histórico (cliente_interacoes) como tipo "sistema" quando automático,
  // ou "atendimento" quando manual. Falha aqui não bloqueia o atendimento principal.
  const tipoInteracao = origem === "sistema" ? "sistema" : "atendimento";
  const ferramentaLabel = FERRAMENTA_LABEL[input.ferramenta] ?? input.ferramenta;
  const partesDescricao = [
    `[${ferramentaLabel}] ${titulo}`,
    resumo,
    input.link ? `Abrir registro: ${input.link}` : null,
  ].filter(Boolean) as string[];

  await supabase.from("cliente_interacoes").insert({
    cliente_id: input.clienteId,
    tipo: tipoInteracao,
    descricao: partesDescricao.join("\n\n"),
    criado_por: input.criadoPor ?? null,
  });

  return { data, error };
}

export const FERRAMENTA_LABEL: Record<FerramentaAtendimento, string> = {
  analisador_caso: "Analisador de Caso",
  analise_publicacoes_ia: "Análise de Publicações IA",
  publicacoes_pje: "Publicações PJe",
  manual: "Manual",
};
