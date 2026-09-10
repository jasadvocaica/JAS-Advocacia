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

export interface FollowupComercial {
  id: string;
  conversa_id: string;
  responsavel_id: string | null;
  descricao: string;
  agendado_para: string;
  status: string;
  conversa_nome: string | null;
  conversa_telefone: string | null;
}

export interface PainelValeskaDados {
  responsavel: ResponsavelComunicacao;
  comunicacoes: ComunicacaoPendente[];
  fichas: FichaAtendimento[];
  leads: LeadRegistrado[];
  tarefas: TarefaPainel[];
  pendencias: PendenciaGerencial[];
  followups: FollowupComercial[];
}

const COLUNAS_TAREFA =
  "id, titulo, status, prioridade, data_vencimento, etapa_workflow, responsavel_id, executor_id, revisor_id, corretor_id, protocolador_id, cliente:clientes(nome)";

const nomeCliente = (d: any) =>
  Array.isArray(d?.cliente) ? d.cliente[0]?.nome ?? null : d?.cliente?.nome ?? null;

/**
 * Hook consolidado do Painel Comercial: leituras paralelas, uma entrada de
 * cache, sem N+1 e sem refetch duplicado.
 *
 * Mensagens não são inferidas. Follow-ups entram somente quando registrados
 * explicitamente pela equipe em uma conversa real.
 */
export function usePainelValeskaData(habilitado: boolean) {
  return useQuery<PainelValeskaDados>({
    queryKey: ["painel-valeska"],
    enabled: habilitado,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const [rResp, rCom, rFichas, rLeads, rTarefas, rPend, rFollowups] = await Promise.all([
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
        (supabase as any)
          .from("whatsapp_conversa_followups")
          .select("id, conversa_id, responsavel_id, descricao, agendado_para, status, conversa:whatsapp_conversas(nome_contato,telefone)")
          .eq("status", "pendente")
          .order("agendado_para", { ascending: true })
          .limit(100),
      ]);

      const erro = rCom.error ?? rFichas.error ?? rTarefas.error ?? rFollowups.error;
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
        followups: ((rFollowups.data ?? []) as any[]).map((d) => {
          const conversa = Array.isArray(d.conversa) ? d.conversa[0] : d.conversa;
          return {
            id: d.id,
            conversa_id: d.conversa_id,
            responsavel_id: d.responsavel_id,
            descricao: d.descricao,
            agendado_para: d.agendado_para,
            status: d.status,
            conversa_nome: conversa?.nome_contato ?? null,
            conversa_telefone: conversa?.telefone ?? null,
          };
        }) as FollowupComercial[],
      };
    },
  });
}
