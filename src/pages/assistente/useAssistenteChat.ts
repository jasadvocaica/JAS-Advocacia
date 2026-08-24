import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

export interface AssistenteMensagem {
  role: "user" | "assistant";
  content: string;
  criado_em: string;
}

export interface AssistenteConversa {
  id: string;
  titulo: string | null;
  mensagens: AssistenteMensagem[];
  arquivada: boolean;
  criado_em: string;
  atualizado_em: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/assistente-chat`;

export function useAssistenteChat() {
  const { user, session } = useAuth();
  const [conversas, setConversas] = useState<AssistenteConversa[]>([]);
  const [conversaAtual, setConversaAtual] = useState<AssistenteConversa | null>(null);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const carregarConversas = useCallback(async () => {
    if (!user) return;
    setCarregandoLista(true);
    const { data, error } = await supabase
      .from("assistente_conversas" as any)
      .select("id, titulo, mensagens, arquivada, criado_em, atualizado_em")
      .eq("user_id", user.id)
      .eq("arquivada", false)
      .order("atualizado_em", { ascending: false })
      .limit(50);
    if (!error && data) setConversas(data as unknown as AssistenteConversa[]);
    setCarregandoLista(false);
  }, [user]);

  useEffect(() => {
    void carregarConversas();
  }, [carregarConversas]);

  const novaConversa = useCallback(() => {
    setConversaAtual({
      id: "",
      titulo: null,
      mensagens: [],
      arquivada: false,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    });
  }, []);

  const abrirConversa = useCallback((c: AssistenteConversa) => {
    setConversaAtual(c);
  }, []);

  const arquivar = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("assistente_conversas" as any)
        .update({ arquivada: true })
        .eq("id", id);
      if (error) {
        toast({ title: "Erro ao arquivar", description: error.message, variant: "destructive" });
        return;
      }
      setConversas((prev) => prev.filter((c) => c.id !== id));
      if (conversaAtual?.id === id) setConversaAtual(null);
    },
    [conversaAtual],
  );

  const enviar = useCallback(
    async (texto: string, contextoRota?: { pathname: string; modulo: string; entityId?: string }) => {
      if (!user || !session) {
        toast({ title: "Sessão expirada", variant: "destructive" });
        return;
      }
      const txt = texto.trim();
      if (!txt) return;

      const agora = new Date().toISOString();
      const userMsg: AssistenteMensagem = { role: "user", content: txt, criado_em: agora };

      // Garante conversa em memória
      const base: AssistenteConversa =
        conversaAtual ?? {
          id: "",
          titulo: null,
          mensagens: [],
          arquivada: false,
          criado_em: agora,
          atualizado_em: agora,
        };
      const comUser: AssistenteConversa = {
        ...base,
        mensagens: [...base.mensagens, userMsg],
        atualizado_em: agora,
      };
      setConversaAtual(comUser);
      setEnviando(true);

      // Stream
      const controller = new AbortController();
      abortRef.current = controller;
      let assistantSoFar = "";

      try {
        const resp = await fetch(CHAT_URL, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            mensagens: comUser.mensagens.map((m) => ({ role: m.role, content: m.content })),
            contexto_rota: contextoRota,
          }),
        });

        if (!resp.ok) {
          let errMsg = "Falha ao falar com o assistente";
          try {
            const j = await resp.json();
            errMsg = j?.error ?? errMsg;
          } catch {
            // ignore
          }
          if (resp.status === 429) {
            toast({ title: "Muitas requisições", description: errMsg, variant: "destructive" });
          } else if (resp.status === 402) {
            toast({ title: "Créditos da IA esgotados", description: errMsg, variant: "destructive" });
          } else {
            toast({ title: "Erro no assistente", description: errMsg, variant: "destructive" });
          }
          throw new Error(errMsg);
        }

        if (!resp.body) throw new Error("Resposta sem corpo");

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let done = false;

        // Cria mensagem do assistente vazia
        setConversaAtual((prev) =>
          prev
            ? {
                ...prev,
                mensagens: [
                  ...prev.mensagens,
                  { role: "assistant", content: "", criado_em: new Date().toISOString() },
                ],
              }
            : prev,
        );

        while (!done) {
          const { done: d, value } = await reader.read();
          if (d) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) !== -1) {
            let line = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (!line || line.startsWith(":")) continue;
            if (!line.startsWith("data: ")) continue;
            const json = line.slice(6).trim();
            if (json === "[DONE]") {
              done = true;
              break;
            }
            try {
              const p = JSON.parse(json);
              const delta = p?.choices?.[0]?.delta?.content as string | undefined;
              if (delta) {
                assistantSoFar += delta;
                setConversaAtual((prev) => {
                  if (!prev) return prev;
                  const msgs = [...prev.mensagens];
                  const last = msgs[msgs.length - 1];
                  if (last?.role === "assistant") {
                    msgs[msgs.length - 1] = { ...last, content: assistantSoFar };
                  }
                  return { ...prev, mensagens: msgs };
                });
              }
            } catch {
              buffer = line + "\n" + buffer;
              break;
            }
          }
        }

        // Persiste conversa
        const titulo = comUser.titulo ?? txt.slice(0, 60);
        const finalMsgs: AssistenteMensagem[] = [
          ...comUser.mensagens,
          { role: "assistant", content: assistantSoFar, criado_em: new Date().toISOString() },
        ];

        if (!comUser.id) {
          const { data: criado, error } = await supabase
            .from("assistente_conversas" as any)
            .insert({
              user_id: user.id,
              titulo,
              mensagens: finalMsgs as unknown as object,
            })
            .select("id, titulo, mensagens, arquivada, criado_em, atualizado_em")
            .single();
          if (!error && criado) {
            const novo = criado as unknown as AssistenteConversa;
            setConversaAtual(novo);
            setConversas((prev) => [novo, ...prev]);
          }
        } else {
          await supabase
            .from("assistente_conversas" as any)
            .update({ mensagens: finalMsgs as unknown as object, titulo })
            .eq("id", comUser.id);
          setConversaAtual((prev) =>
            prev ? { ...prev, mensagens: finalMsgs, titulo } : prev,
          );
          setConversas((prev) =>
            prev.map((c) =>
              c.id === comUser.id
                ? { ...c, mensagens: finalMsgs, titulo, atualizado_em: new Date().toISOString() }
                : c,
            ),
          );
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        // erro já notificado
      } finally {
        setEnviando(false);
        abortRef.current = null;
      }
    },
    [user, session, conversaAtual],
  );

  const cancelar = useCallback(() => {
    abortRef.current?.abort();
    setEnviando(false);
  }, []);

  return {
    conversas,
    conversaAtual,
    carregandoLista,
    enviando,
    novaConversa,
    abrirConversa,
    enviar,
    cancelar,
    arquivar,
    recarregar: carregarConversas,
  };
}
