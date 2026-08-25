import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useAuth } from "@/contexts/AuthContext";
import { useAssistenteChat } from "@/pages/assistente/useAssistenteChat";
import { useAIContext } from "@/hooks/useAIContext";
import { quickActionsParaModulo } from "@/components/assistente/quickActions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Send, X, Maximize2, Loader2, StopCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

const BIA_HABILITADA = import.meta.env.VITE_BIA_ENABLED === "true";

/**
 * Botão flutuante + painel de chat rápido (Assistente "Bia").
 * Visível apenas para gestores e advogados em qualquer página interna.
 */
export function AssistenteFlutuante() {
  const { roles, isGestor, user } = useAuth();
  const podeAcessar = !!user && (isGestor || roles.includes("advogado"));

  const [aberto, setAberto] = useState(false);
  const { conversaAtual, enviando, novaConversa, enviar, cancelar } = useAssistenteChat();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const ctxRota = useAIContext();
  const chips = quickActionsParaModulo(ctxRota.modulo);

  useEffect(() => {
    if (aberto && !conversaAtual) novaConversa();
  }, [aberto, conversaAtual, novaConversa]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [conversaAtual?.mensagens.length, conversaAtual?.mensagens[conversaAtual.mensagens.length - 1]?.content]);

  if (!BIA_HABILITADA || !podeAcessar) return null;

  const submit = (texto?: string) => {
    const t = (texto ?? input).trim();
    if (!t || enviando) return;
    void enviar(t, ctxRota);
    if (!texto) setInput("");
  };

  const msgs = conversaAtual?.mensagens ?? [];

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setAberto((v) => !v)}
        aria-label="Abrir assistente IA"
        className={cn(
          "fixed bottom-5 right-5 z-50 h-12 w-12 rounded-full shadow-lg",
          "bg-primary text-primary-foreground flex items-center justify-center",
          "hover:scale-105 transition-transform",
          !aberto && "animate-pulse",
        )}
      >
        {aberto ? <X className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
      </button>

      {/* Painel */}
      {aberto && (
        <div
          className={cn(
            "fixed bottom-20 right-5 z-50 w-[min(420px,calc(100vw-2rem))] h-[560px]",
            "bg-card border rounded-lg shadow-2xl flex flex-col overflow-hidden",
          )}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="w-4 h-4 text-primary" />
              <div className="flex flex-col leading-tight">
                <span>Bia · Assistente IA</span>
                <span className="text-[10px] text-muted-foreground font-normal">
                  Contexto: {ctxRota.modulo}
                  {ctxRota.entityId ? " (item aberto)" : ""}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Link
                to="/assistente"
                onClick={() => setAberto(false)}
                className="p-1.5 rounded hover:bg-accent text-muted-foreground"
                title="Abrir página completa"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </Link>
              <button
                onClick={() => setAberto(false)}
                className="p-1.5 rounded hover:bg-accent text-muted-foreground"
                title="Fechar"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
            {msgs.length === 0 && (
              <div className="text-center text-muted-foreground py-6 px-4">
                <Sparkles className="w-6 h-6 mx-auto mb-2 text-primary/60" />
                <p className="text-xs">
                  Olá! Sou a <strong>Bia</strong>, sua assistente jurídica. Tenho acesso aos dados do escritório.
                  Pergunte sobre clientes, processos, prazos ou financeiro — ou use um atalho abaixo.
                </p>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[88%] rounded-lg px-2.5 py-1.5 text-xs",
                    m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
                  )}
                >
                  {m.role === "assistant" ? (
                    <div className="prose prose-xs dark:prose-invert max-w-none [&_p]:my-0.5 [&_ul]:my-0.5 [&_ol]:my-0.5">
                      <ReactMarkdown>{m.content || "…"}</ReactMarkdown>
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap">{m.content}</span>
                  )}
                </div>
              </div>
            ))}
            {enviando && msgs[msgs.length - 1]?.role === "user" && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-2.5 py-1.5 text-xs flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" /> consultando...
                </div>
              </div>
            )}
          </div>

          {/* Chips de ação rápida */}
          {chips.length > 0 && (
            <div className="px-2 py-2 border-t flex gap-1.5 overflow-x-auto bg-muted/20">
              {chips.map((a) => (
                <button
                  key={a.label}
                  onClick={() => submit(a.prompt)}
                  disabled={enviando}
                  className="whitespace-nowrap text-[11px] px-2.5 py-1 rounded-full border border-primary/40 text-primary bg-primary/5 hover:bg-primary/10 transition-colors flex-shrink-0 disabled:opacity-50"
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}

          <div className="border-t p-2 flex gap-2 items-end">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Pergunte algo..."
              className="min-h-[36px] max-h-[100px] resize-none text-xs"
              disabled={enviando}
            />
            {enviando ? (
              <Button size="sm" variant="outline" onClick={cancelar}>
                <StopCircle className="w-3.5 h-3.5" />
              </Button>
            ) : (
              <Button size="sm" onClick={() => submit()} disabled={!input.trim()}>
                <Send className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
