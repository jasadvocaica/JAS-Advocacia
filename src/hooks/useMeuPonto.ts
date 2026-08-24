import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface RegistroPontoDia {
  id: string;
  membro_id: string;
  data: string;
  entrada: string | null;
  saida_almoco: string | null;
  retorno_almoco: string | null;
  saida: string | null;
  horas_trabalhadas: number | null;
}

export type EventoPonto = "entrada" | "saida_almoco" | "retorno_almoco" | "saida";

export type EstadoPonto =
  | "sem_entrada"
  | "trabalhando"
  | "em_almoco"
  | "pos_almoco"
  | "encerrado";

function calcularEstado(r: RegistroPontoDia | null): EstadoPonto {
  if (!r || !r.entrada) return "sem_entrada";
  if (r.saida) return "encerrado";
  if (r.saida_almoco && !r.retorno_almoco) return "em_almoco";
  if (r.retorno_almoco) return "pos_almoco";
  return "trabalhando";
}

function proximoEvento(estado: EstadoPonto): EventoPonto | null {
  switch (estado) {
    case "sem_entrada":
      return "entrada";
    case "trabalhando":
      return "saida_almoco";
    case "em_almoco":
      return "retorno_almoco";
    case "pos_almoco":
      return "saida";
    case "encerrado":
      return null;
  }
}

async function membroIdDoUsuario(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("equipe_membros")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as any)?.id ?? null;
}

export function useMeuPonto() {
  const { user } = useAuth();
  const [registro, setRegistro] = useState<RegistroPontoDia | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agora, setAgora] = useState(new Date());

  const carregar = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const membroId = await membroIdDoUsuario(user.id);
    if (!membroId) {
      setRegistro(null);
      setLoading(false);
      return;
    }
    const hoje = new Date().toISOString().slice(0, 10);
    const { data, error: err } = await supabase
      .from("gp_ponto_registros")
      .select("id, membro_id, data, entrada, saida_almoco, retorno_almoco, saida, horas_trabalhadas")
      .eq("membro_id", membroId)
      .eq("data", hoje)
      .maybeSingle();
    if (err) setError(err.message);
    setRegistro((data as any) ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // ticker para "trabalhando há Xh"
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // realtime do dia
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`meu-ponto-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "gp_ponto_registros" },
        () => void carregar()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user, carregar]);

  const registrar = useCallback(
    async (evento: EventoPonto) => {
      const { error: err } = await (supabase as any).rpc("ponto_registrar_evento", { _evento: evento });
      if (err) {
        const hint = (err as any).hint as string | undefined;
        if (hint === "PT001") {
          throw new Error(
            "Seu login ainda não está vinculado a um membro da equipe. Solicite ao gestor que cadastre você em Equipe → Gestão de Pessoas."
          );
        }
        if (hint === "PT002") {
          throw new Error("Seu cadastro de membro está inativo. Procure o gestor para reativar.");
        }
        throw new Error(err.message);
      }
      await carregar();
    },
    [carregar]
  );

  const estado = calcularEstado(registro);
  const proximo = proximoEvento(estado);

  return { registro, estado, proximo, agora, loading, error, registrar, recarregar: carregar };
}
