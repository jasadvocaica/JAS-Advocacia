import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { useAuth } from "@/contexts/AuthContext";
import { useAssistenteChat } from "./useAssistenteChat";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";
import {
  Send,
  Plus,
  Sparkles,
  Trash2,
  Loader2,
  StopCircle,
  MessageSquare,
} from "lucide-react";

const BIA_HABILITADA = import.meta.env.VITE_BIA_ENABLED === "true";

const SUGESTOES = [
  "Quais prazos vencem nos próximos 7 dias?",
  "Quanto temos em honorários em aberto hoje?",
  "Tenho tarefas atrasadas? Liste por prioridade.",
  "Resumo do escritório: clientes ativos e processos em andamento.",
];

export default function AssistenteIA() {
  const { roles, isGestor, loading } = useAuth();
  const podeAcessar = isGestor || roles.includes("advogado");
  const {
    conversas,
    conversaAtual,
    enviando,
    novaConversa,
    abrirConversa,
    enviar,
    cancelar,
    arquivar,
  } = useAssistenteChat();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [conversaAtual?.mensagens.length, conversaAtual?.mensagens[conversaAtual.mensagens.length - 1]?.content]);

  if (loading) return null;
  if (!podeAcessar) return <Navigate to="/sem-permissao" replace />;

  if (!BIA_HABILITADA) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Assistente Bia"
          description="Integração de inteligência artificial preparada para ativação futura."
        />
        <Card className="p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Sparkles className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="font-semibold">Bia temporariamente desativada</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            O sistema jurídico continua funcionando normalmente. A assistente será ativada
            futuramente, quando uma API de inteligência artificial for contratada.
          </p>
          <Button asChild variant="outline" className="mt-5">
            <Link to="/">Voltar ao início</Link>
          </Button>
        </Card>
      </div>
    );
  }

  const submit = () => {
    if (!input.trim() || enviando) return;
    void enviar(input);
    setInput("");
  };

  const msgs = conversaAtual?.mensagens ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Assistente IA"
        description="Chat com contexto real do escritório — clientes, processos, prazos e financeiro."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        {/* Sidebar de conversas */}
        <Card className="p-3 space-y-2 h-[calc(100vh-220px)] flex flex-col">
          <Button onClick={novaConversa} className="w-full" variant="default">
            <Plus className="w-4 h-4 mr-2" /> Nova conversa
          </Button>
          <ScrollArea className="flex-1 -mx-3 px-3">
            <div className="space-y-1 pt-2">
              {conversas.length === 0 && (
                <p className="text-xs text-muted-foreground px-1 py-2">Nenhuma conversa ainda.</p>
              )}
              {conversas.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "group flex items-center gap-2 rounded-md text-sm",
                    conversaAtual?.id === c.id ? "bg-accent" : "hover:bg-accent/50",
                  )}
                >
                  <button
                    onClick={() => abrirConversa(c)}
                    className="flex-1 text-left px-2 py-2 truncate"
                    title={c.titulo ?? "Conversa"}
                  >
                    <MessageSquare className="w-3 h-3 inline mr-1.5 opacity-60" />
                    {c.titulo ?? "Conversa"}
                  </button>
                  <button
                    onClick={() => void arquivar(c.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 mr-1 hover:text-destructive"
                    title="Arquivar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>

        {/* Chat */}
        <Card className="flex flex-col h-[calc(100vh-220px)]">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {msgs.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Olá! Como posso ajudar?</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Pergunte sobre clientes, processos, prazos ou financeiro do escritório.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
                  {SUGESTOES.map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setInput(s);
                      }}
                      className="text-xs text-left p-2 rounded-md border bg-card hover:bg-accent transition"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {msgs.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "flex",
                  m.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted",
                  )}
                >
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1">
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
                <div className="bg-muted rounded-lg px-3 py-2 text-sm flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> consultando dados...
                </div>
              </div>
            )}
          </div>

          <div className="border-t p-3 flex gap-2 items-end">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Pergunte algo sobre o escritório..."
              className="min-h-[44px] max-h-[160px] resize-none"
              disabled={enviando}
            />
            {enviando ? (
              <Button variant="outline" onClick={cancelar} title="Cancelar">
                <StopCircle className="w-4 h-4" />
              </Button>
            ) : (
              <Button onClick={submit} disabled={!input.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            )}
          </div>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        O assistente responde com base nos dados reais do escritório.{" "}
        <Link to="/" className="underline">Voltar ao início</Link>
      </p>
    </div>
  );
}
