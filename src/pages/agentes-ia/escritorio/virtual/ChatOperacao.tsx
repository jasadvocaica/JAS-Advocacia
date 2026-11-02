import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Send, X } from "lucide-react";
import { chamarEscritorio, type AgenteIA, type ExecucaoAgente, type MensagemEscritorio } from "../../hooks/useAgentesIA";

type Item =
  | { tipo: "mensagem"; id: string; quando: string; de: string; para: string; texto: string; tarefa: string | null; origem: string }
  | { tipo: "evento"; id: string; quando: string; agente: string; texto: string; tom: "trabalho" | "revisao" | "ok" | "erro" };

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Cuiaba" });

/** Linha do tempo real: mensagens do canal dos agentes e mudanças de estado das execuções. Nada é inventado. */
export function linhaDoTempo(agentes: AgenteIA[], execucoes: ExecucaoAgente[], mensagens: MensagemEscritorio[]): Item[] {
  const nome = (id: string | null) => agentes.find((a) => a.id === id)?.nome ?? null;
  const resumoExec = (id: string | null) => execucoes.find((e) => e.id === id)?.resumo ?? null;
  const itens: Item[] = mensagens.map((m) => ({
    tipo: "mensagem",
    id: `m-${m.id}`,
    quando: m.criado_em,
    origem: m.origem,
    de: m.origem === "usuario" ? "Diretoria" : m.origem === "sistema" ? `${nome(m.agente_id) ?? "Sistema"} · registro` : nome(m.agente_id) ?? "Agente",
    para: m.destinatario_id ? nome(m.destinatario_id) ?? "Agente" : m.origem === "usuario" ? nome(m.agente_id) ?? "Agente" : "Diretoria",
    texto: m.texto,
    tarefa: resumoExec(m.execucao_id),
  }));
  for (const e of execucoes) {
    const ag = nome(e.agente_id) ?? "Agente";
    itens.push({ tipo: "evento", id: `i-${e.id}`, quando: e.iniciado_em, agente: ag, tom: "trabalho",
      texto: `${ag} começou${e.origem === "missao" ? " uma tarefa de missão" : e.origem === "chat" ? " a responder no canal" : " uma execução"}` });
    if (e.finalizado_em && e.status !== "executando") {
      const fim = {
        aguardando_aprovacao: { t: `${ag} entregou para revisão`, tom: "revisao" as const },
        concluida: { t: `${ag} concluiu`, tom: "ok" as const },
        rejeitada: { t: `Entrega de ${ag} rejeitada`, tom: "erro" as const },
        erro: { t: `${ag} parou com erro: ${e.erro ?? "veja o histórico"}`, tom: "erro" as const },
        cancelada: { t: `Execução de ${ag} cancelada`, tom: "erro" as const },
        pendente: null, executando: null,
      }[e.status];
      if (fim) itens.push({ tipo: "evento", id: `f-${e.id}`, quando: e.finalizado_em, agente: ag, tom: fim.tom, texto: fim.t });
    }
  }
  return itens.sort((a, b) => Date.parse(b.quando) - Date.parse(a.quando)).slice(0, 120);
}

export default function ChatOperacao({
  agentes,
  execucoes,
  mensagens,
  fechar,
  recarregar,
}: {
  agentes: AgenteIA[];
  execucoes: ExecucaoAgente[];
  mensagens: MensagemEscritorio[];
  fechar: () => void;
  recarregar?: () => Promise<void> | void;
}) {
  const [filtro, setFiltro] = useState<"tudo" | "mensagem" | "evento">("tudo");
  const itens = useMemo(() => linhaDoTempo(agentes, execucoes, mensagens), [agentes, execucoes, mensagens]);
  const visiveis = filtro === "tudo" ? itens : itens.filter((i) => i.tipo === filtro);

  // Só os agentes contratados no escritório conversam; os de rotina (ex.: Monitor DJEN) apenas registram.
  const conversaveis = agentes.filter((a) => a.executor === "analista_operacional" && a.ativo);
  const [destino, setDestino] = useState("");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const agenteId = conversaveis.some((a) => a.id === destino) ? destino : conversaveis[0]?.id ?? "";

  async function enviar(e?: FormEvent | KeyboardEvent) {
    e?.preventDefault();
    const pergunta = texto.trim();
    if (!agenteId || !pergunta || enviando) return;
    setEnviando(agenteId);
    setErro(null);
    try {
      await chamarEscritorio({ acao: "conversar", agente_id: agenteId, texto: pergunta });
      setTexto("");
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível enviar a mensagem.");
    } finally {
      setEnviando(null);
      await recarregar?.();
    }
  }
  const teclas = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) void enviar(e);
  };

  return (
    <aside className="ev-chat" aria-label="Conversas e eventos dos agentes">
      <header>
        <strong>Operação ao vivo</strong>
        <button type="button" className="ev-chat-fechar" onClick={fechar} aria-label="Fechar painel de conversas"><X size={16} /></button>
      </header>
      <div className="ev-chat-filtros" role="group" aria-label="Filtrar">
        {(["tudo", "mensagem", "evento"] as const).map((f) => (
          <button key={f} type="button" aria-pressed={filtro === f} onClick={() => setFiltro(f)}>
            {f === "tudo" ? "Tudo" : f === "mensagem" ? "Mensagens" : "Eventos"}
          </button>
        ))}
      </div>
      <ol className="ev-chat-lista" role="log" aria-live="polite">
        {visiveis.length === 0 && <li className="ev-chat-vazio">Nenhuma conversa ou execução registrada ainda.</li>}
        {visiveis.map((i) =>
          i.tipo === "mensagem" ? (
            <li key={i.id} className={`ev-msg ev-msg-${i.origem}`}>
              <div className="ev-msg-topo">
                <b>{i.de}</b>
                <ArrowRight size={11} aria-label="para" />
                <span>{i.para}</span>
                <time>{hora(i.quando)}</time>
              </div>
              <p>{i.texto.length > 600 ? `${i.texto.slice(0, 599)}…` : i.texto}</p>
              {i.tarefa && <small>Tarefa: {i.tarefa}</small>}
            </li>
          ) : (
            <li key={i.id} className={`ev-evento ev-evento-${i.tom}`}>
              <i aria-hidden />
              <span>{i.texto}</span>
              <time>{hora(i.quando)}</time>
            </li>
          ),
        )}
      </ol>
      {conversaveis.length === 0 ? (
        <p className="ev-chat-aviso">
          Para conversar, crie um agente no botão <b>Criar agente</b>. Os agentes de rotina, como o Monitor DJEN, só registram o trabalho.
        </p>
      ) : (
        <form className="ev-chat-escrever" onSubmit={(e) => void enviar(e)} aria-label="Falar com um agente">
          <label>
            <span>Falar com</span>
            <select value={agenteId} onChange={(e) => setDestino(e.target.value)} disabled={!!enviando}>
              {conversaveis.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </label>
          <div className="ev-chat-campo">
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={teclas}
              maxLength={1500}
              rows={2}
              placeholder="Escreva sua mensagem… (Enter envia, Shift+Enter quebra linha)"
              aria-label="Mensagem"
              disabled={!!enviando}
            />
            <button type="submit" aria-label="Enviar mensagem" disabled={!texto.trim() || !!enviando}>
              <Send size={15} />
            </button>
          </div>
          {enviando && (
            <p className="ev-chat-status" role="status">
              {agentes.find((a) => a.id === enviando)?.nome ?? "Agente"} está respondendo…
            </p>
          )}
          {erro && <p className="ev-chat-erro" role="alert">{erro}</p>}
        </form>
      )}
      <footer>
        <Link to="/escritorio/chat">Abrir conversas completas</Link>
      </footer>
    </aside>
  );
}
