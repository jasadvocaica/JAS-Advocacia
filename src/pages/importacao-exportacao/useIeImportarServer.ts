import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useIeJobPolling } from "./useIeJobPolling";
import { criarJob, uploadArquivoIe, atualizarJob } from "./useIeJobs";

interface ImportarInput {
  modulo: "clientes" | "processos";
  arquivo: File;
  mapeamento: Record<string, string>;
  ignorar_erros?: boolean;
}

/**
 * Fluxo de importação no servidor:
 * 1. cria job → 2. faz upload do arquivo → 3. invoca edge function ie-importar → 4. faz polling
 */
export function useIeImportarServer() {
  const { job, polling, acompanhar, parar } = useIeJobPolling();
  const [iniciando, setIniciando] = useState(false);

  const importar = async (input: ImportarInput) => {
    setIniciando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada");

      const novoJob = await criarJob(
        {
          tipo: "importacao",
          modulo: input.modulo,
          arquivo_entrada_nome: input.arquivo.name,
          filtros: { mapeamento: input.mapeamento },
        },
        user.id,
      );

      const path = await uploadArquivoIe(user.id, novoJob.id, input.arquivo, input.arquivo.name);
      await atualizarJob(novoJob.id, { arquivo_entrada_url: path });

      const { error } = await supabase.functions.invoke("ie-importar", {
        body: {
          job_id: novoJob.id,
          modulo: input.modulo,
          mapeamento: input.mapeamento,
          ignorar_erros: !!input.ignorar_erros,
        },
      });
      if (error) throw error;

      acompanhar(novoJob.id);
      return novoJob.id;
    } catch (e) {
      toast({
        title: "Falha ao iniciar importação",
        description: e instanceof Error ? e.message : "Erro desconhecido",
        variant: "destructive",
      });
      throw e;
    } finally {
      setIniciando(false);
    }
  };

  return { job, polling: polling || iniciando, importar, parar };
}
