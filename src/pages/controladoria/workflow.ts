import { supabase } from "@/integrations/supabase/client";

export type EtapaWorkflow =
  | "criacao"
  | "execucao"
  | "revisao"
  | "correcao"
  | "protocolo"
  | "finalizado";

export const ETAPAS_ORDENADAS: EtapaWorkflow[] = [
  "criacao",
  "execucao",
  "revisao",
  "correcao",
  "protocolo",
  "finalizado",
];

export const ETAPAS_ORDEM = ETAPAS_ORDENADAS;

export const ETAPA_LABEL: Record<EtapaWorkflow, string> = {
  criacao: "Criação",
  execucao: "Execução",
  revisao: "Revisão",
  correcao: "Correção",
  protocolo: "Protocolo",
  finalizado: "Finalizado",
};

export const ETAPA_DESCRICAO: Record<EtapaWorkflow, string> = {
  criacao: "Item cadastrado, aguardando início da execução",
  execucao: "Peça / tarefa em elaboração pelo responsável",
  revisao: "Minuta em conferência pelo advogado / gestor",
  correcao: "Apontamentos devolvidos para ajuste pelo executor",
  protocolo: "Peça aprovada, pronta para protocolo no tribunal",
  finalizado: "Item protocolado / concluído e arquivado",
};

/** Matriz canônica de transições permitidas (POP 01 - Controladoria). */
export const TRANSIÇÕES_PERMITIDAS: Record<EtapaWorkflow, EtapaWorkflow[]> = {
  criacao: ["execucao", "finalizado"],
  execucao: ["revisao", "protocolo", "finalizado"],
  revisao: ["correcao", "protocolo", "finalizado"],
  correcao: ["revisao", "protocolo", "finalizado"],
  protocolo: ["finalizado", "correcao"],
  finalizado: [],
};

/** Valida se uma transição é válida segundo o fluxo canônico. */
export function podeTransicionar(
  origem: EtapaWorkflow,
  destino: EtapaWorkflow,
  exigeRevisao: boolean = true,
): boolean {
  if (origem === destino) return false;
  if (!exigeRevisao && origem === "execucao" && destino === "protocolo") return true;
  return TRANSIÇÕES_PERMITIDAS[origem]?.includes(destino) ?? false;
}

/** Descobre a etapa canônica de um item, considerando fallbacks de itens antigos. */
export function etapaAtualDe(item: {
  etapa_workflow?: EtapaWorkflow | string | null;
  status?: string | null;
}): EtapaWorkflow {
  if (item.etapa_workflow && (item.etapa_workflow as EtapaWorkflow) in ETAPA_LABEL) {
    return item.etapa_workflow as EtapaWorkflow;
  }
  if (item.status === "concluido") return "finalizado";
  if (item.status === "aguardando_revisao") return "revisao";
  if (item.status === "em_andamento") return "execucao";
  return "criacao";
}

export interface TransicionarParams {
  itemId: string;
  novaEtapa: EtapaWorkflow;
  novoResponsavelId?: string | null;
  observacao?: string | null;
  arquivoProtocoloUrl?: string | null;
  numeroProtocolo?: string | null;
}

export interface TransicaoResult {
  ok: boolean;
  etapa: EtapaWorkflow;
  error?: string;
}

/**
 * Transiciona a etapa do item chamando a função canônica do banco
 * `controladoria_transicionar_etapa`, que:
 *  - Valida a máquina de estados
 *  - Atualiza status, coluna_kanban e etapa_workflow
 *  - Registra histórico imutável com executor e observação
 *  - Sincroniza campos de protocolo se aplicável
 */
export async function transicionarEtapa(
  params: TransicionarParams,
): Promise<TransicaoResult> {
  const { data, error } = await (supabase as any).rpc(
    "controladoria_transicionar_etapa",
    {
      _item_id: params.itemId,
      _nova_etapa: params.novaEtapa,
      _novo_responsavel_id: params.novoResponsavelId ?? null,
      _observacao: params.observacao ?? null,
      _arquivo_protocolo_url: params.arquivoProtocoloUrl ?? null,
      _numero_protocolo: params.numeroProtocolo ?? null,
    },
  );

  if (error) {
    console.error("[workflow] erro ao transicionar:", error);
    return { ok: false, etapa: params.novaEtapa, error: error.message };
  }

  const res = (data as any) ?? {};
  if (res.ok === false) {
    return { ok: false, etapa: params.novaEtapa, error: res.error || "Transição inválida" };
  }

  return { ok: true, etapa: (res.etapa as EtapaWorkflow) || params.novaEtapa };
}
