import { supabase } from "@/integrations/supabase/client";

/** Etapas canônicas do fluxo da Controladoria (POP 01). */
export type EtapaWorkflow =
  | "criacao"
  | "execucao"
  | "revisao"
  | "correcao"
  | "protocolo"
  | "finalizado";

export const ETAPAS_ORDEM: EtapaWorkflow[] = [
  "criacao", "execucao", "revisao", "correcao", "protocolo", "finalizado",
];

export const ETAPA_LABEL: Record<EtapaWorkflow, string> = {
  criacao: "Criação",
  execucao: "Execução",
  revisao: "Revisão",
  correcao: "Correção",
  protocolo: "Protocolo",
  finalizado: "Finalizado",
};

/** Campo do item que guarda o responsável de cada etapa (null = sem responsável próprio). */
export const ETAPA_RESP_KEY: Record<EtapaWorkflow, string | null> = {
  criacao: null,
  execucao: "executor_id",
  revisao: "revisor_id",
  correcao: "corretor_id",
  protocolo: "protocolador_id",
  finalizado: null,
};

export interface ItemFluxo {
  etapa_workflow?: string | null;
  exige_revisao?: boolean | null;
}

export function etapaAtualDe(item: ItemFluxo): EtapaWorkflow {
  const e = (item.etapa_workflow ?? "criacao") as EtapaWorkflow;
  return ETAPAS_ORDEM.includes(e) ? e : "criacao";
}

/**
 * Máquina de estados canônica. Única fonte de verdade no cliente —
 * espelha `public.controladoria_transicionar_etapa` no banco.
 */
export function transicoesPermitidas(
  etapaAtual: EtapaWorkflow,
  exigeRevisao = true,
): EtapaWorkflow[] {
  switch (etapaAtual) {
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
    default:
      return [];
  }
}

export function podeTransicionar(
  etapaAtual: EtapaWorkflow,
  novaEtapa: EtapaWorkflow,
  exigeRevisao = true,
): boolean {
  return transicoesPermitidas(etapaAtual, exigeRevisao).includes(novaEtapa);
}

/** Rótulo da ação para cada transição possível. */
export function labelTransicao(
  etapaAtual: EtapaWorkflow,
  novaEtapa: EtapaWorkflow,
): string {
  if (etapaAtual === "criacao" && novaEtapa === "execucao") return "Iniciar execução";
  if (novaEtapa === "revisao") return etapaAtual === "correcao" ? "Reenviar para revisão" : "Enviar para revisão";
  if (novaEtapa === "correcao") return "Devolver para correção";
  if (etapaAtual === "revisao" && novaEtapa === "protocolo") return "Aprovar para protocolo";
  if (novaEtapa === "protocolo") return "Enviar para protocolo";
  if (novaEtapa === "finalizado") return "Marcar como protocolado";
  return ETAPA_LABEL[novaEtapa];
}

/** Observação é obrigatória ao devolver para correção. */
export function exigeObservacao(novaEtapa: EtapaWorkflow): boolean {
  return novaEtapa === "correcao";
}

export interface TransicaoResult {
  ok: boolean;
  erro?: string;
}

/**
 * Transição canônica — TODA mudança de etapa (detalhe, kanban, atalhos)
 * deve passar por aqui. A validação real acontece no banco.
 */
export async function transicionarEtapa(params: {
  itemId: string;
  etapaAtual: EtapaWorkflow;
  novaEtapa: EtapaWorkflow;
  exigeRevisao?: boolean;
  responsavelId?: string | null;
  observacao?: string | null;
}): Promise<TransicaoResult> {
  const { itemId, etapaAtual, novaEtapa, exigeRevisao = true, responsavelId, observacao } = params;

  if (!podeTransicionar(etapaAtual, novaEtapa, exigeRevisao)) {
    return { ok: false, erro: `Transição não permitida: ${ETAPA_LABEL[etapaAtual]} → ${ETAPA_LABEL[novaEtapa]}` };
  }
  if (exigeObservacao(novaEtapa) && !observacao?.trim()) {
    return { ok: false, erro: "Informe o que deve ser corrigido" };
  }

  const { error } = await (supabase as any).rpc("controladoria_transicionar_etapa", {
    _item_id: itemId,
    _nova_etapa: novaEtapa,
    _responsavel_id: responsavelId ?? null,
    _observacao: observacao?.trim() || null,
  });
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}
