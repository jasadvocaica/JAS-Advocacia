// Conversão de um atendimento em outro tipo de trabalho.
// Centraliza a lógica usada pela FichaAtendimentoSheet e pela
// lista de atendimentos (AtendimentosTab).
import { supabase } from "@/integrations/supabase/client";

export type TipoConversao =
  | "processo"
  | "processo_administrativo"
  | "diligencia"
  | "prazo"
  | "tarefa";

export const TIPO_CONVERSAO_LABEL: Record<TipoConversao, string> = {
  processo: "Processo judicial",
  processo_administrativo: "Processo administrativo",
  diligencia: "Diligência",
  prazo: "Prazo",
  tarefa: "Tarefa",
};

interface ConverterArgs {
  atendimentoId: string;
  clienteId: string;
  tipo: TipoConversao;
  titulo: string;
  resumo?: string | null;
  tese?: string | null;
  informacoesBrutas?: string | null;
  area?: string | null;
  userId?: string | null;
  prazoDias?: number;
}

export interface ConverterResult {
  processoId?: string | null;
  itemId?: string | null;
  link: string | null;
}

export async function converterAtendimento(
  args: ConverterArgs,
): Promise<ConverterResult> {
  const {
    atendimentoId,
    clienteId,
    tipo,
    titulo,
    resumo,
    tese,
    informacoesBrutas,
    area,
    userId,
    prazoDias = 5,
  } = args;

  const descricao = [
    resumo,
    tese ? `\n\n**Tese:**\n${tese}` : "",
  ]
    .filter(Boolean)
    .join("");

  let processoId: string | null = null;
  let itemId: string | null = null;

  if (tipo === "processo" || tipo === "processo_administrativo") {
    const { data, error } = await supabase
      .from("processos")
      .insert({
        cliente_id: clienteId,
        tipo: tipo === "processo_administrativo" ? "administrativo" : "judicial",
        area_direito: area ?? null,
        observacoes_internas:
          `Originado da ficha de atendimento "${titulo}".\n\n` +
          (descricao || informacoesBrutas || ""),
        status: "ativo",
        criado_por: userId ?? null,
      })
      .select("id")
      .maybeSingle();
    if (error) throw error;
    processoId = data?.id ?? null;
  } else {
    // diligencia | prazo | tarefa
    const { data, error } = await supabase
      .from("controladoria_itens")
      .insert({
        tipo,
        titulo,
        descricao: descricao || informacoesBrutas || "",
        prioridade: "media",
        data_vencimento: new Date(Date.now() + 86400000 * prazoDias).toISOString(),
        cliente_id: clienteId,
        origem: "controladoria",
        criado_por: userId ?? null,
      } as any)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    itemId = data?.id ?? null;
  }

  const link = processoId
    ? `/processos/${processoId}`
    : itemId
      ? `/controladoria`
      : null;

  const { error: upErr } = await supabase
    .from("cliente_atendimentos")
    .update({
      status: "convertido",
      convertido_em: new Date().toISOString(),
      convertido_tipo: tipo === "prazo" || tipo === "tarefa" ? "diligencia" : tipo,
      processo_id: processoId ?? undefined,
      item_controladoria_id: itemId ?? undefined,
      link: link ?? undefined,
    })
    .eq("id", atendimentoId);
  if (upErr) throw upErr;

  return { processoId, itemId, link };
}
