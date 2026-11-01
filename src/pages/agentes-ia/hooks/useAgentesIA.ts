import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AgenteIA {
  id: string;
  slug: string;
  nome: string;
  descricao: string | null;
  area: string;
  webhook_url: string | null;
  exige_aprovacao: boolean;
  ativo: boolean;
  ordem: number;
}

export interface ExecucaoAgente {
  id: string;
  agente_id: string;
  origem: string;
  status:
    | "pendente"
    | "executando"
    | "aguardando_aprovacao"
    | "concluida"
    | "rejeitada"
    | "erro"
    | "cancelada";
  resumo: string | null;
  erro: string | null;
  entrada: Record<string, unknown> | null;
  saida: Record<string, unknown> | null;
  iniciado_em: string;
  finalizado_em: string | null;
  duracao_ms: number | null;
  agente?: { nome: string; slug: string } | null;
}

export const LABEL_STATUS_EXECUCAO: Record<ExecucaoAgente["status"], string> = {
  pendente: "Pendente",
  executando: "Executando",
  aguardando_aprovacao: "Aguardando aprovação",
  concluida: "Concluída",
  rejeitada: "Rejeitada",
  erro: "Erro",
  cancelada: "Cancelada",
};

async function chamar(corpo: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("agentes-disparar", { body: corpo });
  if (error) {
    let msg = error.message;
    try {
      const b = await (error as { context?: { json: () => Promise<{ error?: string }> } }).context?.json();
      if (b?.error) msg = b.error;
    } catch {
      /* mantém a mensagem original */
    }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export function useAgentesIA() {
  const [agentes, setAgentes] = useState<AgenteIA[]>([]);
  const [execucoes, setExecucoes] = useState<ExecucaoAgente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [ag, ex] = await Promise.all([
      supabase.from("agentes_ia").select("*").order("ordem"),
      supabase
        .from("agente_execucoes")
        .select(
          `id, agente_id, origem, status, resumo, erro, entrada, saida,
           iniciado_em, finalizado_em, duracao_ms,
           agente:agentes_ia(nome, slug)`,
        )
        .order("iniciado_em", { ascending: false })
        .limit(60),
    ]);

    const erroInicial = ag.error || ex.error;
    if (erroInicial) setError(erroInicial.message);

    setAgentes((ag.data ?? []) as AgenteIA[]);
    setExecucoes((ex.data ?? []) as unknown as ExecucaoAgente[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Atualiza automaticamente enquanto houver execução em andamento.
  useEffect(() => {
    const emAndamento = execucoes.some((e) => e.status === "executando" || e.status === "pendente");
    if (!emAndamento) return;
    const t = setInterval(() => void carregar(), 4000);
    return () => clearInterval(t);
  }, [execucoes, carregar]);

  const disparar = useCallback(
    async (agente_slug: string, entrada: Record<string, unknown> = {}) => {
      await chamar({ acao: "disparar", agente_slug, entrada });
      await carregar();
    },
    [carregar],
  );

  const decidir = useCallback(
    async (execucao_id: string, decisao: "aprovado" | "rejeitado", observacao?: string) => {
      await chamar({ acao: "decidir", execucao_id, decisao, observacao });
      await carregar();
    },
    [carregar],
  );

  const cancelar = useCallback(
    async (execucao_id: string) => {
      await chamar({ acao: "cancelar", execucao_id });
      await carregar();
    },
    [carregar],
  );

  const pendentesAprovacao = useMemo(
    () => execucoes.filter((e) => e.status === "aguardando_aprovacao"),
    [execucoes],
  );

  return {
    agentes,
    execucoes,
    pendentesAprovacao,
    loading,
    error,
    recarregar: carregar,
    disparar,
    decidir,
    cancelar,
  };
}
