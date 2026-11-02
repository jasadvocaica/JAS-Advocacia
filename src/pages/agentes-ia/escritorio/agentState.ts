import type { AgenteIA, ExecucaoAgente } from "../hooks/useAgentesIA";
import { agenteNativo } from "../../../../supabase/functions/_shared/agentes";
export function estadoMesa(a: AgenteIA, ultima?: ExecucaoAgente) {
  if (!a.ativo) return "Pausado";
  if (
    !agenteNativo(a.slug) &&
    a.executor !== "analista_operacional" &&
    !a.webhook_url
  )
    return "Precisa configurar";
  if (ultima?.status === "executando")
    return Date.now() - new Date(ultima.iniciado_em).getTime() > 600000
      ? "Execução sem confirmação"
      : "Trabalhando";
  if (ultima?.status === "pendente") return "Na fila";
  if (ultima?.status === "erro") return "Precisa de atenção";
  if (ultima?.status === "aguardando_aprovacao") return "Aguarda sua revisão";
  return "Disponível";
}

export function latestExecution(execucoes: ExecucaoAgente[], id: string) {
  return execucoes
    .filter((e) => e.agente_id === id)
    .reduce<
      ExecucaoAgente | undefined
    >((last, e) => (!last || Date.parse(e.iniciado_em) > Date.parse(last.iniciado_em) ? e : last), undefined);
}

export function agentVisualStates(
  agentes: AgenteIA[],
  execucoes: ExecucaoAgente[],
  atualizadoEm?: string | null,
) {
  return agentes.map((a) => {
    const last = latestExecution(execucoes, a.id);
    return {
      id: a.id,
      status: estadoMesa(a, last),
      expiresAt: Math.min(
        atualizadoEm ? Date.parse(atualizadoEm) + 35000 : 0,
        last?.status === "executando"
          ? Date.parse(last.iniciado_em) + 600000
          : Infinity,
      ),
    };
  });
}
