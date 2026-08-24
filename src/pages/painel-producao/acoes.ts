import { supabase } from "@/integrations/supabase/client";
import { transicionarEtapa, type EtapaWorkflow } from "@/pages/controladoria/workflow";
import type { ItemProducao, RevisorConfigurado } from "./logic";
import { revisorParaAtribuir } from "./logic";
import { etapaAtualDe } from "@/pages/controladoria/workflow";

export interface AcaoResult {
  ok: boolean;
  erro?: string;
}

/** Toda mudança de etapa passa pela transição canônica da Controladoria. */
async function transicao(
  item: ItemProducao,
  novaEtapa: EtapaWorkflow,
  opts: { responsavelId?: string | null; observacao?: string | null } = {},
): Promise<AcaoResult> {
  return transicionarEtapa({
    itemId: item.id,
    etapaAtual: etapaAtualDe(item),
    novaEtapa,
    exigeRevisao: item.exige_revisao ?? true,
    responsavelId: opts.responsavelId ?? null,
    observacao: opts.observacao ?? null,
  });
}

/** Novos → produção (criacao → execucao), assumindo o item. */
export function iniciarProducao(item: ItemProducao, userId: string) {
  return transicao(item, "execucao", { responsavelId: userId });
}

/**
 * Fim da peça = "Enviar para revisão" (nunca "concluir"). O revisor vem apenas
 * da configuração canônica; sem configuração, a ação é bloqueada.
 */
export async function enviarParaRevisao(
  item: ItemProducao,
  revisor: RevisorConfigurado | null | undefined,
  observacao?: string,
): Promise<AcaoResult> {
  if (item.exige_revisao === false) {
    return { ok: false, erro: "Esta tarefa está configurada sem revisão." };
  }
  const revisorId = revisorParaAtribuir(revisor) ?? item.revisor_id ?? null;
  if (!revisorId) return { ok: false, erro: "Revisor não configurado" };
  return transicao(item, "revisao", { responsavelId: revisorId, observacao });
}

/** Ajustes → reenvio, também via transição canônica (correcao → revisao). */
export function reenviarParaRevisao(
  item: ItemProducao,
  revisor: RevisorConfigurado | null | undefined,
  observacao?: string,
) {
  return enviarParaRevisao(item, revisor, observacao);
}

/** Protocolo → finalizado. Alimenta o ponto existente de comunicação ao cliente. */
export function registrarProtocolo(item: ItemProducao, userId: string, observacao?: string): Promise<AcaoResult> {
  if (item.protocolador_id !== userId) {
    return Promise.resolve({ ok: false, erro: "Somente o protocolador do item pode registrar o protocolo." });
  }
  return transicao(item, "finalizado", { observacao });
}

export async function aguardarDocumentos(itemId: string, motivo: string): Promise<AcaoResult> {
  if (!motivo.trim()) return { ok: false, erro: "Informe o que está sendo aguardado do cliente" };
  const { error } = await (supabase as any).rpc("producao_aguardar_documentos", {
    _item_id: itemId,
    _motivo: motivo.trim(),
  });
  return error ? { ok: false, erro: error.message } : { ok: true };
}

export async function retomarProducao(
  itemId: string,
  opts: { observacao?: string; documentoRecebido?: string } = {},
): Promise<AcaoResult> {
  const { error } = await (supabase as any).rpc("producao_retomar_producao", {
    _item_id: itemId,
    _observacao: opts.observacao?.trim() || null,
    _documento_recebido: opts.documentoRecebido?.trim() || null,
  });
  return error ? { ok: false, erro: error.message } : { ok: true };
}
