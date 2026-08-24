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
export function transicoesPermitidas(
  origem: EtapaWorkflow,
  exigeRevisao: boolean = true,
): EtapaWorkflow[] {
  switch (origem) {
    case "criacao":
      return ["execucao"];
    case "execucao":
      return exigeRevisao ? ["revisao"] : ["protocolo"];
    case "revisao":
      return ["correcao", "protocolo"];
    case "correcao":
      return ["revisao"];
    case "protocolo":
      return ["finalizado"];
    case "finalizado":
      return [];
    default:
      return [];
  }
}

/** Valida se uma transição é válida segundo o fluxo canônico. */
export function podeTransicionar(
  origem: EtapaWorkflow,
  destino: EtapaWorkflow,
  exigeRevisao: boolean = true,
): boolean {
  if (origem === destino) return false;
  const permitidas = transicoesPermitidas(origem, exigeRevisao);
  return permitidas.includes(destino);
}

/** Indica se a transição para a etapa informada exige observação/apontamento. */
export function exigeObservacao(destino: EtapaWorkflow): boolean {
  return destino === "correcao";
}

/** Rótulo de ação claro para botões de transição. */
export function labelTransicao(origem: EtapaWorkflow, destino: EtapaWorkflow): string {
  if (origem === "criacao" && destino === "execucao") return "Iniciar execução";
  if (origem === "execucao" && destino === "revisao") return "Enviar para revisão";
  if (origem === "execucao" && destino === "protocolo") return "Liberar para protocolo";
  if (origem === "revisao" && destino === "correcao") return "Devolver para correção";
  if (origem === "revisao" && destino === "protocolo") return "Aprovar para protocolo";
  if (origem === "correcao" && destino === "revisao") return "Reenviar para revisão";
  if (origem === "protocolo" && destino === "finalizado") return "Concluir protocolo";
  return ETAPA_LABEL[destino] ?? destino;
}

/** Descobre a etapa canônica de um item, considerando fallbacks de itens antigos. */
export function etapaAtualDe(item: {
  etapa_workflow?: EtapaWorkflow | string | null;
  status?: string | null;
}): EtapaWorkflow {
  if (item?.etapa_workflow && (item.etapa_workflow as EtapaWorkflow) in ETAPA_LABEL) {
    return item.etapa_workflow as EtapaWorkflow;
  }
  if (item?.status === "concluido") return "finalizado";
  if (item?.status === "aguardando_revisao") return "revisao";
  if (item?.status === "em_andamento") return "execucao";
  return "criacao";
}

export interface TransicionarParams {
  itemId: string;
  novaEtapa: EtapaWorkflow;
  etapaAtual?: EtapaWorkflow | string | null;
  exigeRevisao?: boolean;
  responsavelId?: string | null;
  novoResponsavelId?: string | null;
  observacao?: string | null;
  arquivoProtocoloUrl?: string | null;
  numeroProtocolo?: string | null;
}

export interface TransicaoResult {
  ok: boolean;
  etapa: EtapaWorkflow;
  erro?: string;
  error?: string;
}

/**
 * Transiciona a etapa do item chamando a função canônica do banco
 * `controladoria_transicionar_etapa`, que:
 *  - Valida a máquina de estados
 *  - Atualiza status, coluna_kanban e etapa_workflow
 *  - Registra histórico imutável com executor e observação
 *  - Sincroniza campos de conclusão se aplicável
 */
export async function transicionarEtapa(
  params: TransicionarParams,
): Promise<TransicaoResult> {
  const respId = params.responsavelId ?? params.novoResponsavelId ?? null;
  const etapaAtual = params.etapaAtual;
  const exigeRevisao = params.exigeRevisao ?? true;

  // Validação prévia de máquina de estados se etapa atual for informada
  if (etapaAtual) {
    const atual = etapaAtual as EtapaWorkflow;
    if (!podeTransicionar(atual, params.novaEtapa, exigeRevisao)) {
      const msg = `Transição inválida: ${atual} → ${params.novaEtapa}`;
      return {
        ok: false,
        erro: msg,
      };
    }
  }

  // Devolução para correção exige observação obrigatória
  if (exigeObservacao(params.novaEtapa) && (!params.observacao || !params.observacao.trim())) {
    const msg = "Informe o que deve ser corrigido";
    return {
      ok: false,
      erro: msg,
    };
  }

  let obs = params.observacao?.trim() || null;
  if (params.novaEtapa === "finalizado") {
    const complementos: string[] = [];
    if (params.numeroProtocolo?.trim()) complementos.push(`Protocolo nº ${params.numeroProtocolo.trim()}`);
    if (params.arquivoProtocoloUrl?.trim()) complementos.push(`Comprovante: ${params.arquivoProtocoloUrl.trim()}`);
    if (complementos.length > 0) {
      obs = obs ? `${obs} (${complementos.join(" - ")})` : complementos.join(" - ");
    }
  }

  const { data, error } = await (supabase as any).rpc(
    "controladoria_transicionar_etapa",
    {
      _item_id: params.itemId,
      _nova_etapa: params.novaEtapa,
      _responsavel_id: respId,
      _observacao: obs,
    },
  );

  if (error) {
    console.error("[workflow] erro ao transicionar:", error);
    const msg = error.message || "Erro ao transicionar etapa";
    return { ok: false, erro: msg };
  }

  const res = (data as any) ?? {};
  if (res.ok === false) {
    const msg = res.error || res.erro || "Transição inválida";
    return { ok: false, erro: msg };
  }

  const etapaRetornada = (res.etapa_workflow as EtapaWorkflow) || (res.etapa as EtapaWorkflow) || params.novaEtapa;
  return { ok: true, etapa: etapaRetornada };
}
