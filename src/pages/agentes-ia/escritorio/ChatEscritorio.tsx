import { useEffect, useRef, useState } from "react";
import { ArrowRight, MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  chamarEscritorio,
  type AgenteIA,
  type ExecucaoAgente,
  type MensagemEscritorio,
} from "../hooks/useAgentesIA";
import { horario } from "../EscritorioVisual";
export default function ChatEscritorio({
  agentes,
  execucoes,
  mensagens,
  recarregar,
}: {
  agentes: AgenteIA[];
  execucoes: ExecucaoAgente[];
  mensagens: MensagemEscritorio[];
  recarregar: () => Promise<void>;
}) {
  const analistas = agentes.filter(
    (a) => a.executor === "analista_operacional" && a.ativo,
  );
  const [filtro, setFiltro] = useState("geral");
  const selecionado = agentes.find((a) => a.id === filtro);
  const somenteRegistros =
    filtro !== "geral" &&
    (selecionado?.executor !== "analista_operacional" || !selecionado.ativo);
  const visiveis = mensagens.filter(
    (m) =>
      filtro === "geral" ||
      m.agente_id === filtro ||
      m.destinatario_id === filtro,
  );
  const logRef = useRef<HTMLDivElement>(null);
  const pertoFim = useRef(true);
  useEffect(() => {
    if (logRef.current && pertoFim.current)
      logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [mensagens[mensagens.length - 1]?.id, filtro]);
  const [destino, setDestino] = useState("");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fim = useRef<HTMLDivElement>(null);

  const agenteId = analistas.some((a) => a.id === destino)
    ? destino
    : analistas[0]?.id;
  async function enviar() {
    if (!agenteId || !texto.trim() || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      await chamarEscritorio({ acao: "conversar", agente_id: agenteId, texto });
      setTexto("");
    } catch (e) {
      setErro(
        e instanceof Error ? e.message : "Não foi possível enviar a mensagem.",
      );
    } finally {
      await recarregar();
      setEnviando(false);
    }
  }
  const nome = (id: string | null) =>
    agentes.find((a) => a.id === id)?.nome ?? "Sistema";
  return (
    <section
      className="rounded-xl border bg-card"
      aria-label="Canal do escritório"
    >
      <aside className="office-chat-rail" aria-label="Canais e agentes">
        <h3>Conversas do escritório</h3>
        <div className="office-chat-contacts">
          <button
            type="button"
            aria-pressed={filtro === "geral"}
            onClick={() => {
              setFiltro("geral");
              pertoFim.current = true;
            }}
          >
            <span className="office-contact-avatar">#</span>
            <span>
              <strong>Canal geral</strong>
              <small>Trabalho e passagens entre agentes</small>
            </span>
          </button>
          {agentes.map((a) => (
            <button
              key={a.id}
              type="button"
              aria-pressed={filtro === a.id}
              onClick={() => {
                setFiltro(a.id);
                setDestino(a.id);
                setErro(null);
                pertoFim.current = true;
              }}
            >
              <span className="office-contact-avatar">{a.nome.charAt(0)}</span>
              <span>
                <strong>{a.nome}</strong>
                <small>
                  {!a.ativo
                    ? "Pausado · Registros"
                    : a.executor === "analista_operacional"
                      ? "Analista · Conversar"
                      : "Registros da rotina"}
                </small>
              </span>
            </button>
          ))}
        </div>
      </aside>
      <div className="office-chat-thread">
        <header className="flex flex-wrap items-start justify-between gap-2 border-b p-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <MessageSquare className="h-4 w-4" />
              {filtro === "geral" ? "Canal do escritório" : selecionado?.nome}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Histórico compartilhado com a diretoria. Acompanhe as rotinas e
              converse com seus analistas.
            </p>
          </div>
          <span className="rounded-full border px-2 py-1 text-[10px] text-muted-foreground">
            Registros reais · histórico compartilhado com a diretoria
          </span>
        </header>
        <div
          className="max-h-96 min-h-40 space-y-4 overflow-auto p-4"
          role="log"
          aria-label="Mensagens do escritório"
          ref={logRef}
          onScroll={() => {
            const el = logRef.current;
            if (el)
              pertoFim.current =
                el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          aria-live="polite"
          aria-relevant="additions"
        >
          {visiveis.length === 0 && (
            <div className="py-6 text-center text-xs text-muted-foreground">
              O canal está pronto. As próximas execuções publicarão seus
              resultados aqui. Você também pode perguntar a um analista.
            </div>
          )}
          {visiveis.map((m) => {
            const exec = execucoes.find((e) => e.id === m.execucao_id);
            return (
              <article
                key={m.id}
                className={
                  m.origem === "usuario"
                    ? "ml-6 rounded-lg border bg-primary/5 p-3"
                    : "mr-6 rounded-lg border bg-muted/20 p-3"
                }
              >
                <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px]">
                  <strong>
                    {m.origem === "usuario" ? "Diretoria" : nome(m.agente_id)}
                  </strong>
                  {m.destinatario_id && (
                    <>
                      <ArrowRight className="h-3 w-3" />
                      <span>{nome(m.destinatario_id)}</span>
                    </>
                  )}
                  <span className="text-[9px] text-muted-foreground">
                    {m.origem === "sistema"
                      ? "Registro automático da execução"
                      : m.origem === "agente"
                        ? "Resposta do agente"
                        : "Mensagem da diretoria"}
                  </span>
                  <time className="ml-auto text-[9px] text-muted-foreground">
                    {horario(m.criado_em)}
                  </time>
                </div>
                <p className="whitespace-pre-wrap break-words text-xs leading-relaxed">
                  {m.texto}
                </p>
                {m.origem === "usuario" && exec?.status === "erro" && (
                  <p className="mt-2 text-xs text-destructive">
                    Resposta não concluída: {exec.erro}
                  </p>
                )}
                {m.origem === "usuario" && exec?.status === "executando" && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Consultando indicadores e preparando resposta…
                  </p>
                )}
              </article>
            );
          })}
          <div ref={fim} />
        </div>
        {!somenteRegistros ? (
          <form
            className="space-y-3 border-t p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void enviar();
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="chat-agente" className="text-xs">
                Conversar com
              </label>
              <select
                id="chat-agente"
                className="rounded-md border bg-background px-3 py-2 text-xs"
                value={agenteId ?? ""}
                onChange={(e) => setDestino(e.target.value)}
                disabled={enviando || !analistas.length}
              >
                {!analistas.length && (
                  <option value="">Contrate um analista para conversar</option>
                )}
                {analistas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome}
                  </option>
                ))}
              </select>
            </div>
            <label className="sr-only" htmlFor="chat-pergunta">
              Sua mensagem ao agente
            </label>
            <Textarea
              id="chat-pergunta"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={1500}
              rows={2}
              placeholder="Ex.: O que precisa da minha atenção na Controladoria hoje?"
              disabled={enviando || !analistas.length}
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Respostas usam indicadores reais e o teto compartilhado de 50
                mil tokens/dia. Conversar não altera tarefas nem envia mensagens
                externas.
              </p>
              <Button
                type="submit"
                size="sm"
                disabled={enviando || !texto.trim() || !agenteId}
              >
                <Send className="mr-2 h-3 w-3" />
                {enviando ? "Respondendo…" : "Enviar"}
              </Button>
            </div>
            {erro && (
              <p role="alert" className="text-xs text-destructive">
                {erro}
              </p>
            )}
          </form>
        ) : (
          <div className="office-chat-readonly">
            <p>
              Este canal mostra os registros da rotina automática. Para
              conversar, selecione um analista.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
