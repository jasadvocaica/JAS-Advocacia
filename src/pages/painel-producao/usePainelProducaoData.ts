import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ItemProducao, RevisorConfigurado } from "./logic";

export interface PainelProducaoDados {
  itens: ItemProducao[];
  revisor: RevisorConfigurado;
}

const COLUNAS =
  "id, titulo, descricao, tipo, status, prioridade, origem, data_vencimento, criado_em, " +
  "etapa_workflow, etapa_atualizada_em, exige_revisao, responsavel_id, executor_id, revisor_id, " +
  "corretor_id, protocolador_id, criado_por, cliente_id, processo_id, sla_entrada_em, " +
  "sla_pausado_em, sla_pausa_motivo, sla_minutos_pausados, documentos_recebidos, " +
  "comentario_revisao, anotacoes_revisao, cliente:clientes(nome), processo:processos(numero_cnj)";

const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/**
 * Uma única leitura filtrada no servidor: somente os itens ativos em que o
 * usuário aparece como responsável de algum papel do fluxo. Não carrega a
 * Controladoria inteira, não faz N+1 e não lê nenhum dado financeiro.
 */
export function usePainelProducaoData(userId: string | null | undefined) {
  return useQuery<PainelProducaoDados>({
    queryKey: ["painel-producao", userId],
    enabled: !!userId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const filtro = [
        `responsavel_id.eq.${userId}`,
        `executor_id.eq.${userId}`,
        `revisor_id.eq.${userId}`,
        `corretor_id.eq.${userId}`,
        `protocolador_id.eq.${userId}`,
      ].join(",");

      const [rItens, rRevisor] = await Promise.all([
        supabase
          .from("controladoria_itens")
          .select(COLUNAS)
          .or(filtro)
          .not("status", "in", "(concluido,cancelado)")
          .order("data_vencimento", { ascending: true, nullsFirst: false })
          .limit(300),
        (supabase as any).rpc("producao_revisor_padrao"),
      ]);

      if (rItens.error) throw rItens.error;

      const itens: ItemProducao[] = ((rItens.data as any[]) ?? []).map((d) => ({
        ...d,
        cliente_nome: um(d.cliente)?.nome ?? null,
        processo_cnj: um(d.processo)?.numero_cnj ?? null,
      }));

      const rev = (rRevisor?.data ?? null) as RevisorConfigurado | null;

      return {
        itens,
        revisor: rev ?? { configurado: false, user_id: null, nome: null, ativo: false },
      };
    },
  });
}
