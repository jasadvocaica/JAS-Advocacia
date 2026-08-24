import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type Prioridade = "urgente" | "normal" | "informativo";

export interface MuralAviso {
  id: string;
  titulo: string;
  conteudo: string;
  prioridade: Prioridade;
  fixado: boolean;
  destinatarias: string[];
  criado_por: string | null;
  criado_em: string;
  expira_em: string | null;
  leituras: { user_id: string; lido_em: string }[];
}

type MuralRealtimeListener = () => void;

const muralRealtimeListeners = new Set<MuralRealtimeListener>();
let muralRealtimeChannel: ReturnType<typeof supabase.channel> | null = null;

function getMuralRealtimeChannelName() {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `mural-avisos-${suffix}`;
}

function subscribeMuralRealtime(listener: MuralRealtimeListener) {
  muralRealtimeListeners.add(listener);

  if (!muralRealtimeChannel) {
    muralRealtimeChannel = supabase
      .channel(getMuralRealtimeChannelName())
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mural_avisos" },
        () => muralRealtimeListeners.forEach((registeredListener) => registeredListener())
      )
      .subscribe();
  }

  return () => {
    muralRealtimeListeners.delete(listener);
    if (muralRealtimeListeners.size === 0 && muralRealtimeChannel) {
      const channel = muralRealtimeChannel;
      muralRealtimeChannel = null;
      void supabase.removeChannel(channel);
    }
  };
}

function ordenar(itens: MuralAviso[]): MuralAviso[] {
  return [...itens].sort((a, b) => {
    if (a.fixado !== b.fixado) return a.fixado ? -1 : 1;
    return new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime();
  });
}

export function useMuralAvisos() {
  const { user } = useAuth();
  const [avisos, setAvisos] = useState<MuralAviso[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const nowIso = new Date().toISOString();
    const { data, error: err } = await supabase
      .from("mural_avisos")
      .select("*")
      .or(`expira_em.is.null,expira_em.gt.${nowIso}`)
      .order("fixado", { ascending: false })
      .order("criado_em", { ascending: false });
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setAvisos(ordenar((data ?? []) as MuralAviso[]));
    setLoading(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    return subscribeMuralRealtime(() => void carregar());
  }, [carregar]);

  const naoLidos = useMemo(() => {
    if (!user) return 0;
    return avisos.filter(
      (a) => !a.leituras.some((l) => l.user_id === user.id)
    ).length;
  }, [avisos, user]);

  const marcarLido = useCallback(
    async (avisoId: string) => {
      await supabase.rpc("mural_marcar_lido", { _aviso_id: avisoId });
      // otimista
      if (user) {
        setAvisos((prev) =>
          prev.map((a) =>
            a.id === avisoId && !a.leituras.some((l) => l.user_id === user.id)
              ? { ...a, leituras: [...a.leituras, { user_id: user.id, lido_em: new Date().toISOString() }] }
              : a
          )
        );
      }
    },
    [user]
  );

  const marcarTodosLidos = useCallback(async () => {
    await supabase.rpc("mural_marcar_todos_lidos");
    await carregar();
  }, [carregar]);

  const ehLido = useCallback(
    (a: MuralAviso) => !!user && a.leituras.some((l) => l.user_id === user.id),
    [user]
  );

  return { avisos, loading, error, naoLidos, marcarLido, marcarTodosLidos, ehLido, recarregar: carregar };
}
