import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useIeJobPolling } from "./useIeJobPolling";

export type ExportarFormato = "xlsx" | "csv" | "pdf";
export type ExportarModulo = "clientes" | "processos" | "financeiro";
export type ExportarVersao = "interno" | "parceiro" | "cliente";

export interface FiltrosExportacao {
  data_inicio?: string;
  data_fim?: string;
  status?: string;
  responsavel_id?: string;
  area_direito?: string;
}

interface ExportarInput {
  modulo: ExportarModulo;
  formato: ExportarFormato;
  versao?: ExportarVersao;
  filtros?: FiltrosExportacao;
}

/**
 * Dispara a edge function de exportação e acompanha o job via polling.
 * Quando concluído, o componente pode usar `job.arquivo_saida_url` para baixar.
 */
export function useIeExportar() {
  const { job, polling, acompanhar, parar } = useIeJobPolling();
  const [iniciando, setIniciando] = useState(false);

  const exportar = async (input: ExportarInput) => {
    setIniciando(true);
    try {
      const { data, error } = await supabase.functions.invoke("ie-exportar", {
        body: {
          modulo: input.modulo,
          formato: input.formato,
          versao: input.versao ?? "interno",
          filtros: input.filtros ?? {},
        },
      });
      if (error) throw error;
      const jobId = (data as { job_id?: string } | null)?.job_id;
      if (!jobId) throw new Error("Resposta inválida da exportação");
      acompanhar(jobId);
      return jobId;
    } catch (e) {
      toast({
        title: "Falha ao iniciar exportação",
        description: e instanceof Error ? e.message : "Erro desconhecido",
        variant: "destructive",
      });
      throw e;
    } finally {
      setIniciando(false);
    }
  };

  return { job, polling: polling || iniciando, exportar, parar };
}
