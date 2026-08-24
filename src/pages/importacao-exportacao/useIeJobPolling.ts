import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { IeJob, IeJobStatus } from "./types";

const POLL_MS = 1500;
const STATUS_FINAL: IeJobStatus[] = ["concluido", "concluido_parcial", "erro", "expirado"];

/**
 * Faz polling do status de um job de I/E até atingir um status final.
 * Devolve o job atualizado, status de carregamento e função para iniciar/cancelar.
 */
export function useIeJobPolling() {
  const [job, setJob] = useState<IeJob | null>(null);
  const [polling, setPolling] = useState(false);
  const timerRef = useRef<number | null>(null);

  const parar = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPolling(false);
  }, []);

  const acompanhar = useCallback(
    (jobId: string) => {
      parar();
      setPolling(true);

      const tick = async () => {
        const { data, error } = await (supabase as any)
          .from("ie_jobs")
          .select("*")
          .eq("id", jobId)
          .maybeSingle();
        if (error || !data) {
          setPolling(false);
          return;
        }
        setJob(data as IeJob);
        if (STATUS_FINAL.includes((data as IeJob).status)) {
          setPolling(false);
          return;
        }
        timerRef.current = window.setTimeout(tick, POLL_MS);
      };

      tick();
    },
    [parar],
  );

  const reset = useCallback(() => {
    parar();
    setJob(null);
  }, [parar]);

  useEffect(() => () => parar(), [parar]);

  return { job, polling, acompanhar, parar, reset };
}
