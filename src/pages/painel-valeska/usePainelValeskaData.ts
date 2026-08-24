import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  ComunicacaoPendente, FichaAtendimento, LeadRegistrado, PendenciaGerencial, TarefaPainel,
} from "./logic";

export interface ResponsavelComunicacao {
  configurado: boolean;
  user_id: string | null;
  nome: string | null;
  ativo: boolean;
}

export interface PainelValeskaDados {
  responsavel: ResponsavelComunicacao;
  comunicacoes: ComunicacaoPendente[];
  fichas: FichaAtendimento[];
  leads: LeadRegistrado[];
  tarefas: TarefaPainel[];
  pendencias: PendenciaGerencial[];
}

const COLUNAS_TAREFA =
  "id, titulo, status, prioridade, data_vencimento, etapa_workflow, responsavel_id, executor_id, revisor_id, corretor_id, protocolador_id, cliente:clientes(nome)";

const nomeCliente = (d: any) =>
  Array.isArray(d?.cliente) ? d.cliente[0]?.nome ?? null : d?.cliente?.nome ?? null;

/**
 * Hook consolidado do Painel Comercial: 6 leituras em paralelo, uma entrada de
 * cache, sem N+1 e sem refetch duplicado.
 *
 * NENHUMA fonte de WhatsApp/mensageria é consultada nesta fase.
 */
export function usePainelValeskaData(habilitado: boolean) {
  return useQuery<PainelValeskaDados>({
    queryKey: ["painel-valeska"],
    enabled: habilitado,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const [rResp, rCom, rFichas, rLeads, rTarefas, rPend] = await Promise.all([
        (supabase as any).rpc("comercial_responsavel_comunicacao"),
        (supabase as any)
          .from("comunicacoes_cliente")
          .select(
            "id, item_id, cliente_id, processo_id, status, responsavel_id, sla_preferencial_em, sla_limite_em, comunicado_em, comunicado_por, criado_em, cliente:clientes(nome), processo:processos(numero_cnj), item:controladoria_itens(titulo)",
          )
          .eq("status", "pendente")
          .order("criado_em", { ascending: true })
          .limit(100),
        supabase
          .from("cliente_atendimentos")
          .select("id, titulo, status, area, subtipo, cliente_id, criado_em, convertido_em, cliente:clientes(nome)")
          .order("criado_em", { ascending: false })
          .limit(200),
        supabase
          .from("mkt_leads")
          .select("id, nome, status, area_direito, cliente_id, valor_contrato, criado_em")
          .order("criado_em", { ascending: false })
          .limit(200),
        supabase
          .from("controladoria_itens")
          .select(COLUNAS_TAREFA)
          .not("status", "in", '("cancelado")')
          .order("data_vencimento", { ascending: true })
          .limit(300),
        supabase
          .from("producao_juridica_pendencias")
          .select("id, codigo, status, criado_em")
          .is("resolvido_em", null)
          .order("criado_em", { ascending: false })
          .limit(50),
      ]);

      const erro = rCom.error ?? rFichas.error ?? rTarefas.error;
      if (erro) throw erro;

      const respRaw = (rResp.data ?? {}) as any;

      return {
        responsavel: {
          configurado: !!respRaw.configurado,
          user_id: respRaw.user_id ?? null,
          nome: respRaw.nome ?? null,
          ativo: !!respRaw.ativo,
        },
        comunicacoes: ((rCom.data ?? []) as any[]).map((d) => ({
          ...d,
          cliente_nome: nomeCliente(d),
          processo_cnj: Array.isArray(d.processo) ? d.processo[0]?.numero_cnj ?? null : d.processo?.numero_cnj ?? null,
          item_titulo: Array.isArray(d.item) ? d.item[0]?.titulo ?? null : d.item?.titulo ?? null,
        })) as ComunicacaoPendente[],
        fichas: ((rFichas.data ?? []) as any[]).map((d) => ({
          ...d, cliente_nome: nomeCliente(d),
        })) as FichaAtendimento[],
        leads: ((rLeads.data ?? []) as any[]) as LeadRegistrado[],
        tarefas: ((rTarefas.data ?? []) as any[]).map((d) => ({
          ...d, cliente_nome: nomeCliente(d),
        })) as TarefaPainel[],
        pendencias: ((rPend.data ?? []) as any[]) as PendenciaGerencial[],
      };
    },
  });
}
