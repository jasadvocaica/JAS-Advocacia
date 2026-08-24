import { supabase } from "@/integrations/supabase/client";

/**
 * Produção jurídica (Fase 2A).
 *
 * Único gatilho: conversão NOVA e explícita da ficha de atendimento em
 * processo/diligência. Nunca retroativo, nunca por lead ou contrato.
 *
 * A RPC `public.iniciar_producao_juridica` é canônica e transacional. Ela
 * NUNCA bloqueia a conversão: quando falta associação de serviço (área+subtipo)
 * ativa/completa ou responsável explícito na regra de serviço, ela apenas registra uma pendência
 * persistente e retorna o status correspondente, sem criar instância ou tarefa.
 */

export type ProducaoJuridicaStatus =
  | "criado"
  | "ja_existia"
  | "sem_fluxo_configurado"
  | "responsavel_nao_configurado"
  | "template_sem_providencia"
  | "sem_permissao"
  | "sem_sessao"
  | "ficha_nao_encontrada"
  | "erro";

export interface ProducaoJuridicaResultado {
  /** false apenas em falha inesperada de infraestrutura. */
  ok: boolean;
  status: ProducaoJuridicaStatus;
  /** true quando um fluxo/tarefa foi realmente criado nesta chamada. */
  criouFluxo: boolean;
  /** true quando a ficha já havia gerado fluxo (idempotência). */
  jaExistia?: boolean;
  instanciaId?: string | null;
  itemId?: string | null;
  /** Mensagem amigável para exibir como aviso (nunca como bloqueio). */
  aviso?: string;
  erro?: string;
}

/** SLA operacional padrão da produção jurídica, em dias úteis. */
export const SLA_PRODUCAO_DIAS_UTEIS = 7;

export function mensagemStatusProducao(status: ProducaoJuridicaStatus): string | undefined {
  switch (status) {
    case "sem_fluxo_configurado":
      return "Conversão concluída. Nenhum fluxo foi iniciado: não há associação de serviço (área + subtipo) ativa e completa. Pendência registrada para a gestão.";
    case "responsavel_nao_configurado":
      return "Conversão concluída. Nenhum fluxo foi iniciado: a regra de serviço não tem responsável explícito, ativo e interno. Pendência registrada para a gestão.";
    case "template_sem_providencia":
      return "Conversão concluída. O template configurado não gerou providência na Controladoria — nenhum prazo foi inventado. Pendência técnica registrada para a gestão.";
    case "sem_permissao":
      return "Conversão concluída. A produção jurídica não foi iniciada por falta de permissão na Controladoria.";
    case "ficha_nao_encontrada":
      return "Conversão concluída, mas a ficha não foi localizada para iniciar a produção jurídica.";
    case "sem_sessao":
      return "Conversão concluída, mas a sessão expirou antes de iniciar a produção jurídica.";
    default:
      return undefined;
  }
}

export async function iniciarProducaoJuridica(params: {
  atendimentoId: string;
  processoId?: string | null;
}): Promise<ProducaoJuridicaResultado> {
  const { data, error } = await (supabase as any).rpc("iniciar_producao_juridica", {
    _atendimento_id: params.atendimentoId,
    _processo_id: params.processoId ?? null,
  });

  if (error) {
    return {
      ok: false,
      status: "erro",
      criouFluxo: false,
      erro: error.message || "Falha ao iniciar a produção jurídica",
      aviso: "Conversão concluída, mas a produção jurídica não pôde ser iniciada.",
    };
  }

  const payload = (data ?? {}) as Record<string, unknown>;
  const status = ((payload.status as ProducaoJuridicaStatus) ?? "erro") as ProducaoJuridicaStatus;

  return {
    ok: true,
    status,
    criouFluxo: payload.criou_fluxo === true,
    jaExistia: payload.ja_existia === true,
    instanciaId: (payload.instancia_id as string) ?? null,
    itemId: (payload.item_id as string) ?? null,
    aviso: mensagemStatusProducao(status),
  };
}

export interface PendenciaProducao {
  id: string;
  origem_id: string;
  cliente_id: string | null;
  codigo: string;
  status: string;
  contexto: Record<string, unknown> | null;
  criado_em: string;
}

export async function listarPendenciasProducao(): Promise<PendenciaProducao[]> {
  const { data, error } = await (supabase as any)
    .from("producao_juridica_pendencias")
    .select("id, origem_id, cliente_id, codigo, status, contexto, criado_em")
    .eq("status", "aberta")
    .order("criado_em", { ascending: false })
    .limit(50);
  if (error) return [];
  return (data ?? []) as PendenciaProducao[];
}

export const PENDENCIA_LABEL: Record<string, string> = {
  SEM_FLUXO_CONFIGURADO: "Sem fluxo configurado",
  RESPONSAVEL_NAO_CONFIGURADO: "Responsável de produção não configurado na regra de serviço",
  TEMPLATE_SEM_ETAPA_CONTROLADORIA: "Template sem etapa que gere providência na Controladoria",
};
