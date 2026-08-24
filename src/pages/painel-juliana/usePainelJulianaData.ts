import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ItemPainel } from "./logic";

export interface IntimacaoPendente {
  id: string;
  numero_processo: string | null;
  sigla_tribunal: string | null;
  tipo_comunicacao: string | null;
  data_publicacao: string | null;
  processo_id: string | null;
  item_controladoria_id: string | null;
}

export interface PendenciaProducao {
  id: string;
  codigo: string;
  status: string;
  criado_em: string;
}

export interface ProcessoResumo {
  id: string;
  status: string | null;
  area_direito: string | null;
}

export interface PainelJulianaDados {
  itens: ItemPainel[];
  processos: ProcessoResumo[];
  ufs: { label: string; total: number }[];
  intimacoes: IntimacaoPendente[];
  pendenciasProducao: PendenciaProducao[];
}

const COLUNAS_ITEM =
  "id, titulo, tipo, status, prioridade, data_vencimento, criado_em, etapa_workflow, etapa_atualizada_em, exige_revisao, responsavel_id, executor_id, revisor_id, corretor_id, protocolador_id, sla_previsto_em, sla_status, cliente:clientes(nome), processo:processos(numero_cnj), responsavel:profiles!responsavel_id(nome)";

/**
 * Hook consolidado do Painel da Juliana: 5 leituras em paralelo, uma única
 * entrada de cache. Sem N+1 e sem refetch duplicado (react-query).
 */
export function usePainelJulianaData(habilitado: boolean) {
  return useQuery<PainelJulianaDados>({
    queryKey: ["painel-juliana"],
    enabled: habilitado,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const [rItens, rProcessos, rClientes, rIntimacoes, rPendencias] = await Promise.all([
        supabase
          .from("controladoria_itens")
          .select(COLUNAS_ITEM)
          .not("status", "in", '("cancelado")')
          .order("data_vencimento", { ascending: true }),
        supabase.from("processos").select("id, status, area_direito"),
        supabase.from("clientes").select("estado").eq("ativo", true),
        supabase
          .from("pje_publicacoes")
          .select("id, numero_processo, sigla_tribunal, tipo_comunicacao, data_publicacao, processo_id, item_controladoria_id")
          .neq("status_leitura", "vista")
          .order("data_publicacao", { ascending: false })
          .limit(20),
        supabase
          .from("producao_juridica_pendencias")
          .select("id, codigo, status, criado_em")
          .is("resolvido_em", null)
          .order("criado_em", { ascending: false })
          .limit(20),
      ]);

      const erro = rItens.error ?? rProcessos.error ?? rClientes.error;
      if (erro) throw erro;

      const itens: ItemPainel[] = ((rItens.data ?? []) as any[]).map((d) => ({
        ...d,
        cliente_nome: Array.isArray(d.cliente) ? d.cliente[0]?.nome ?? null : d.cliente?.nome ?? null,
        processo_cnj: Array.isArray(d.processo) ? d.processo[0]?.numero_cnj ?? null : d.processo?.numero_cnj ?? null,
        responsavel_nome: Array.isArray(d.responsavel) ? d.responsavel[0]?.nome ?? null : d.responsavel?.nome ?? null,
      }));

      const mapaUf = new Map<string, number>();
      for (const c of (rClientes.data ?? []) as { estado: string | null }[]) {
        const uf = (c.estado ?? "").trim().toUpperCase();
        if (!uf || uf.length !== 2) continue; // UF confiável apenas quando em sigla
        mapaUf.set(uf, (mapaUf.get(uf) ?? 0) + 1);
      }

      return {
        itens,
        processos: (rProcessos.data ?? []) as ProcessoResumo[],
        ufs: Array.from(mapaUf.entries())
          .map(([label, total]) => ({ label, total }))
          .sort((a, b) => b.total - a.total),
        intimacoes: (rIntimacoes.data ?? []) as IntimacaoPendente[],
        pendenciasProducao: (rPendencias.data ?? []) as PendenciaProducao[],
      };
    },
  });
}
