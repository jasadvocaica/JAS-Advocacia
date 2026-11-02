import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TarefaMissao {
  id: string;
  titulo: string;
  estado: "pendente" | "executando" | "concluida" | "falhou" | "cancelada";
  agente_id: string;
  agente: string;
  profundidade: number;
  tentativas: number;
  resumo: string | null;
  erro: string | null;
  concluida_em: string | null;
}

export interface Missao {
  id: string;
  titulo: string;
  objetivo: string;
  estado: "aberta" | "concluida" | "falhou" | "cancelada";
  origem: string;
  prioridade: number;
  criada_em: string;
  encerrada_em: string | null;
  aprovacoes_abertas: number;
  tarefas: TarefaMissao[];
}

export interface Orcamento {
  teto_absoluto_usd: number;
  orcamento_mensal_usd: number;
  extras_mes_usd: number;
  gasto_mes_usd: number;
  gasto_dia_usd: number;
  limite_dia_usd: number;
  media_7d_usd: number;
  dias_restantes: number;
  tarefas_na_fila: number;
}

export interface Atividade {
  id: number;
  acao: string;
  ator_tipo: "usuario" | "agente" | "sistema" | "mcp";
  ator: string | null;
  criado_em: string;
}

export interface Painel {
  motor_ligado: boolean;
  orcamento: Orcamento;
  consumo_agentes?: Record<string, { custo_usd: number; tokens: number }>;
  missoes: Missao[];
  atividades: Atividade[];
}

export interface OpcaoAumento {
  tipo: "extra_dia" | "mensal";
  valor_usd: number;
  descricao: string;
  limite_dia_previsto_usd: number;
  mes_fecharia_em_usd: number;
}

export interface Aprovacao {
  id: string;
  tipo: "acao" | "orcamento";
  origem: string;
  agente: string | null;
  ferramenta: string | null;
  modulo: string | null;
  resumo: string;
  riscos: string | null;
  parametros: Record<string, unknown> & { opcoes?: OpcaoAumento[] };
  escopo_hash: string;
  valida_ate: string;
  criada_em: string;
}

export async function chamarMotor<T = unknown>(corpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("motor-missoes", { body: corpo });
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
  return data as T;
}

export type Coluna = "fila" | "execucao" | "aprovacao" | "concluida" | "falhou";

export const COLUNAS: { id: Coluna; titulo: string; vazio: string }[] = [
  { id: "fila", titulo: "Na fila", vazio: "Nenhuma missão esperando." },
  { id: "execucao", titulo: "Em execução", vazio: "Nenhum agente trabalhando agora." },
  { id: "aprovacao", titulo: "Aguardando aprovação", vazio: "Nada esperando por você." },
  { id: "concluida", titulo: "Concluídas (7 dias)", vazio: "Nenhuma concluída na semana." },
  { id: "falhou", titulo: "Com falha", vazio: "Nenhuma falha. Ótimo." },
];

/** Em que coluna do quadro a missão aparece, pelo estado real das tarefas e aprovações. */
export function colunaDaMissao(m: Missao): Coluna {
  if (m.estado === "concluida") return "concluida";
  if (m.estado === "falhou" || m.estado === "cancelada") return "falhou";
  if (m.tarefas.some((t) => t.estado === "executando")) return "execucao";
  if (m.tarefas.some((t) => t.estado === "pendente")) return "fila";
  if (m.aprovacoes_abertas > 0) return "aprovacao";
  return "fila";
}

/** Tarefas encerradas sobre o total (concluída, falha ou cancelada). */
export function progresso(m: Missao): number {
  if (!m.tarefas.length) return 0;
  const feitas = m.tarefas.filter((t) => t.estado !== "pendente" && t.estado !== "executando").length;
  return Math.round((feitas / m.tarefas.length) * 100);
}

const ATIVIDADE: Record<string, string> = {
  "missao.criada": "criou uma missão",
  "tarefa.delegada": "delegou uma tarefa",
  "tarefa.concluida": "concluiu uma tarefa",
  "tarefa.falhou": "teve uma tarefa com falha",
  "tarefa.pendente": "vai tentar a tarefa de novo",
  "tarefa.devolvida": "devolveu a tarefa à fila (sem orçamento)",
  "aprovacao.pedida": "pediu uma aprovação",
  "aprovacao.aprovada": "aprovou um pedido",
  "aprovacao.recusada": "recusou um pedido",
  "acao.executada": "ação aprovada executada",
  "acao.falhou": "ação aprovada falhou",
  "orcamento.aviso": "aviso de orçamento",
  "orcamento.aprovado": "aumento de orçamento aprovado",
  "orcamento.recusado": "aumento de orçamento recusado",
  "motor.ajuste": "ajustou o motor",
  "motor.desligado_excedente": "motor desligado: custo acima do reservado",
  "ferramenta.concedida": "concedeu uma ferramenta",
  "ferramenta.retirada": "retirou uma ferramenta",
};

export function textoAtividade(a: Atividade): string {
  const quem = a.ator_tipo === "agente" ? a.ator ?? "Agente" : a.ator_tipo === "usuario" ? "Gestão" : "Sistema";
  return `${quem} ${ATIVIDADE[a.acao] ?? a.acao}`;
}

export const dolar = (v: number) => `US$ ${Number(v ?? 0).toFixed(2).replace(".", ",")}`;
export const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** Painel do motor com atualização a cada 10 s enquanto a aba está visível. */
export function usePainelMotor() {
  const [painel, setPainel] = useState<Painel | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const carregar = useCallback(async () => {
    try {
      setPainel(await chamarMotor<Painel>({ acao: "painel" }));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Painel indisponível");
    } finally {
      setCarregando(false);
    }
  }, []);
  useEffect(() => {
    void carregar();
    const t = setInterval(() => {
      if (!document.hidden) void carregar();
    }, 10000);
    return () => clearInterval(t);
  }, [carregar]);
  return { painel, erro, carregando, recarregar: carregar };
}

export function useAprovacoes() {
  const [lista, setLista] = useState<Aprovacao[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const carregar = useCallback(async () => {
    try {
      const r = await chamarMotor<{ aprovacoes: Aprovacao[] }>({ acao: "aprovacoes" });
      setLista(r.aprovacoes ?? []);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Aprovações indisponíveis");
    }
  }, []);
  useEffect(() => {
    void carregar();
    const t = setInterval(() => {
      if (!document.hidden) void carregar();
    }, 15000);
    return () => clearInterval(t);
  }, [carregar]);
  return { lista, erro, recarregar: carregar };
}
