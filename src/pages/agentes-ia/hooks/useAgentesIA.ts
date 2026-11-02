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
  sala?: string;
  executor?: string | null;
  intervalo_minutos?: number | null;
  proxima_execucao?: string | null;
}

export interface MensagemEscritorio {
  id: string;
  agente_id: string | null;
  destinatario_id: string | null;
  usuario_id: string | null;
  execucao_id: string | null;
  origem: string;
  texto: string;
  criado_em: string;
}

export interface OperacaoDjen {
  triagem_pendente: number;
  triagem_com_erro: number;
  agenda_pendente: number;
  agenda_com_erro: number;
  ultima_consulta: string | null;
  falhas: { tipo: string; referencia: string; erro: string }[];
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

export async function chamarEscritorio(corpo: Record<string, unknown>) {
  return invocar("agentes-escritorio", corpo);
}
async function chamar(corpo: Record<string, unknown>) {
  return invocar("agentes-disparar", corpo);
}
async function invocar(funcao: string, corpo: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(funcao, {
    body: corpo,
  });
  if (error) {
    let msg = error.message;
    try {
      const b = await (
        error as { context?: { json: () => Promise<{ error?: string }> } }
      ).context?.json();
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
  const [operacaoDjen, setOperacaoDjen] = useState<OperacaoDjen | null>(null);

  const [mensagens, setMensagens] = useState<MensagemEscritorio[]>([]);
  const [passos, setPassos] = useState<
    { id: number; execucao_id: string; mensagem: string; criado_em: string }[]
  >([]);
  const [consultas, setConsultas] = useState<
    {
      id: string;
      status: string;
      iniciado_em: string;
      finalizado_em: string | null;
      total_novas: number;
      total_erros: number;
    }[]
  >([]);
  const [tokens, setTokens] = useState<{
    limite: number;
    usados: number;
    reservados: number;
    disponiveis: number;
  } | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setError(null);
    const [
      ag,
      ex,
      operacao,
      consultasResult,
      tokensResult,
      passosResult,
      mensagensResult,
    ] = await Promise.all([
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
      supabase.rpc("djen_resumo_operacional"),
      supabase
        .from("pje_sync_log")
        .select("id,status,iniciado_em,finalizado_em,total_novas,total_erros")
        .order("iniciado_em", { ascending: false })
        .limit(20),
      supabase.rpc("assistente_tokens_dia"),
      supabase
        .from("agente_execucao_logs")
        .select("id,execucao_id,mensagem,criado_em")
        .order("criado_em", { ascending: false })
        .limit(20),
      supabase
        .from("escritorio_mensagens")
        .select("*")
        .order("criado_em", { ascending: false })
        .limit(60),
    ]);

    const erroInicial = ag.error || ex.error || operacao.error;
    if (erroInicial) setError(erroInicial.message);

    setAgentes((ag.data ?? []) as AgenteIA[]);
    setExecucoes((ex.data ?? []) as unknown as ExecucaoAgente[]);
    setOperacaoDjen(
      operacao.error ? null : (operacao.data as unknown as OperacaoDjen),
    );
    if (!mensagensResult.error)
      setMensagens((mensagensResult.data ?? []).slice().reverse());
    if (!passosResult.error) setPassos(passosResult.data ?? []);
    if (!consultasResult.error) setConsultas(consultasResult.data ?? []);
    if (!tokensResult.error)
      setTokens(tokensResult.data as unknown as typeof tokens);
    if (!erroInicial) setAtualizadoEm(new Date().toISOString());
    setLoading(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Tempo real: qualquer mudança nas execuções recarrega em seguida (agrupando rajadas).
  useEffect(() => {
    let espera: ReturnType<typeof setTimeout> | null = null;
    const canal = supabase
      .channel(`agentes-execucoes-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agente_execucoes" },
        () => {
          if (espera) clearTimeout(espera);
          espera = setTimeout(() => void carregar(), 400);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "escritorio_mensagens" },
        () => {
          if (espera) clearTimeout(espera);
          espera = setTimeout(() => void carregar(), 400);
        },
      )
      .subscribe();
    return () => {
      if (espera) clearTimeout(espera);
      void supabase.removeChannel(canal);
    };
  }, [carregar]);

  // Atualiza automaticamente enquanto houver execução em andamento.
  useEffect(() => {
    const emAndamento = execucoes.some(
      (e) => e.status === "executando" || e.status === "pendente",
    );
    const t = setInterval(
      () => {
        if (!document.hidden) void carregar();
      },
      emAndamento ? 4000 : 15000,
    );
    const aoFocar = () => void carregar();
    window.addEventListener("focus", aoFocar);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", aoFocar);
    };
  }, [execucoes, carregar]);

  const disparar = useCallback(
    async (agente_slug: string, entrada: Record<string, unknown> = {}) => {
      await chamar({ acao: "disparar", agente_slug, entrada });
      await carregar();
    },
    [carregar],
  );

  const decidir = useCallback(
    async (
      execucao_id: string,
      decisao: "aprovado" | "rejeitado",
      observacao?: string,
    ) => {
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
    consultas,
    tokens,
    atualizadoEm,
    passos,
    mensagens,
    operacaoDjen,
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
