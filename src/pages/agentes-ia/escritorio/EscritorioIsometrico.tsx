import { useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { AgenteIA, ExecucaoAgente } from "../hooks/useAgentesIA";

/**
 * Escritório isométrico (public/escritorio-isometrico) ligado aos agentes reais.
 * A página mostra o escritório num iframe da mesma origem e conversa com ele por
 * postMessage: manda agentes e execuções; recebe executar, revisar e personalizar,
 * que são atendidos com as mesmas funções do escritório 3D (nada novo no servidor).
 */
export const ORIGEM_ESCRITORIO = "escritorio-isometrico";

interface Props {
  agentes: AgenteIA[];
  execucoes: ExecucaoAgente[];
  atualizadoEm: string | null;
  ocupado: boolean;
  rodar: (agente: AgenteIA) => Promise<void> | void;
  revisar: (execucao: ExecucaoAgente) => void;
}

/** O que muda a planta (quem existe e em que sala). Nome e estado vão pela mensagem. */
export function enderecoEscritorio(agentes: AgenteIA[]): string {
  const equipe = agentes.map((a) => ({
    id: a.id,
    nome: a.nome,
    sala: a.sala ?? "operacional",
    ativo: a.ativo,
    cargo: a.executor === "analista_operacional" ? "Analista de IA" : "Rotina do sistema",
  }));
  return `/escritorio-isometrico/index.html#d=${encodeURIComponent(JSON.stringify({ agentes: equipe }))}`;
}

export default function EscritorioIsometrico({ agentes, execucoes, atualizadoEm, ocupado, rodar, revisar }: Props) {
  const ref = useRef<HTMLIFrameElement>(null);
  const navigate = useNavigate();
  // recarrega o escritório só quando entra/sai agente ou alguém muda de sala
  const chave = agentes.map((a) => `${a.id}:${a.sala ?? ""}`).sort().join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const src = useMemo(() => enderecoEscritorio(agentes), [chave]);

  const enviarEstado = useCallback(() => {
    const w = ref.current?.contentWindow;
    if (!w) return;
    w.postMessage(
      {
        destino: ORIGEM_ESCRITORIO,
        tipo: "estado",
        atualizadoEm,
        ocupado,
        agentes: agentes.map((a) => ({
          id: a.id, nome: a.nome, descricao: a.descricao, sala: a.sala, ativo: a.ativo,
          executor: a.executor ?? null, intervalo_minutos: a.intervalo_minutos ?? null,
        })),
        execucoes: execucoes.map((x) => ({
          id: x.id, agente_id: x.agente_id, status: x.status, origem: x.origem, resumo: x.resumo,
          erro: x.erro, iniciado_em: x.iniciado_em, finalizado_em: x.finalizado_em,
          missao_id: typeof x.entrada?.missao_id === "string" ? x.entrada.missao_id : null,
        })),
      },
      window.location.origin,
    );
  }, [agentes, execucoes, atualizadoEm, ocupado]);

  useEffect(() => enviarEstado(), [enviarEstado]);

  useEffect(() => {
    function ouvir(ev: MessageEvent) {
      // só o escritório desta página, na mesma origem
      if (ev.origin !== window.location.origin || ev.source !== ref.current?.contentWindow) return;
      const m = ev.data as { origem?: string; tipo?: string; agente_id?: string; execucao_id?: string };
      if (!m || m.origem !== ORIGEM_ESCRITORIO) return;
      if (m.tipo === "pronto") enviarEstado();
      else if (m.tipo === "executar") {
        const a = agentes.find((x) => x.id === m.agente_id);
        if (a && a.ativo && !ocupado) void rodar(a);
      } else if (m.tipo === "revisar") {
        const x = execucoes.find((e) => e.id === m.execucao_id && e.status === "aguardando_aprovacao");
        if (x) revisar(x);
      } else if (m.tipo === "editar") {
        if (agentes.some((x) => x.id === m.agente_id)) navigate(`/escritorio/equipe/${m.agente_id}/editar`);
      }
    }
    window.addEventListener("message", ouvir);
    return () => window.removeEventListener("message", ouvir);
  }, [agentes, execucoes, ocupado, rodar, revisar, navigate, enviarEstado]);

  return (
    <section aria-label="Escritório isométrico" className="overflow-hidden rounded-xl border" style={{ height: "calc(100dvh - 150px)", minHeight: 560 }}>
      <iframe
        ref={ref}
        key={src}
        src={src}
        title="Escritório isométrico com os agentes de IA"
        className="block h-full w-full border-0"
        onLoad={enviarEstado}
      />
    </section>
  );
}
