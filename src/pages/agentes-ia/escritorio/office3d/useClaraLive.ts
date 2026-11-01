import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { acceptSnapshot, currentTask, type ClaraSnapshot } from "./model";
export function useClaraLive() {
  const [snapshot, setSnapshot] = useState<ClaraSnapshot | null>(null),
    [error, setError] = useState<string | null>(null),
    [updated, setUpdated] = useState<number | null>(null);
  useEffect(() => {
    let active = true,
      busy = false,
      failures = 0,
      timer: ReturnType<typeof setTimeout>;
    let latest: ClaraSnapshot | null = null;
    const load = async () => {
      if (!active || busy || document.hidden) return;
      busy = true;
      try {
        const { data, error } = await supabase.functions.invoke(
          "clara-acompanhar",
          { body: {} },
        );
        if (error || data?.error)
          throw new Error("Sem confirmação do servidor.");
        const accepted = acceptSnapshot(latest, data);
        if (!accepted) throw new Error("Resposta de acompanhamento inválida.");
        if (active) {
          latest = accepted;
          setSnapshot(accepted);
          setError(null);
          setUpdated(Date.now());
          failures = 0;
        }
      } catch {
        if (active) {
          setError(
            "Não foi possível atualizar. O último estado é apenas referência.",
          );
          failures++;
        }
      } finally {
        busy = false;
        if (active) {
          clearTimeout(timer);
          timer = setTimeout(
            load,
            Math.min(
              30000,
              failures
                ? 5000 * 2 ** Math.min(failures, 3)
                : ["queued", "running"].includes(
                      currentTask(latest?.tarefas ?? [])?.estado ?? "",
                    )
                  ? 1000
                  : 5000,
            ),
          );
        }
      }
    };
    const resume = () => {
      if (!document.hidden) {
        clearTimeout(timer);
        void load();
      }
    };
    void load();
    window.addEventListener("online", resume);
    window.addEventListener("jas:clara-update", resume);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener("online", resume);
      window.removeEventListener("jas:clara-update", resume);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);
  return { snapshot, error, updated };
}
