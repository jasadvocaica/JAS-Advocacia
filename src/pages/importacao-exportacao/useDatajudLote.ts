import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useIeJobPolling } from "./useIeJobPolling";
import { criarJob } from "./useIeJobs";

/**
 * Lote de consulta DataJud: para uma lista de processos já cadastrados,
 * dispara a edge `datajud-lote` que reporta progresso item-a-item via
 * ie_jobs.erros_json. A mesma UI de progresso usada para o PDF PDPJ
 * é reaproveitada (acompanhamos o job pelo polling padrão).
 */
export function useDatajudLote() {
  const { job, polling, acompanhar, parar, reset } = useIeJobPolling();
  const [iniciando, setIniciando] = useState(false);

  const consultar = async (processoIds: string[]) => {
    reset();
    if (processoIds.length === 0) {
      toast({ title: "Nenhum processo selecionado", variant: "destructive" });
      return null;
    }
    setIniciando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada");

      const novoJob = await criarJob(
        {
          tipo: "importacao",
          modulo: "processos",
          subtipo: "datajud_lote",
          arquivo_entrada_nome: `Consulta DataJud (${processoIds.length} processos)`,
        },
        user.id,
      );

      // Dispara a edge — não aguardamos resposta completa; o polling cuida do resto
      supabase.functions.invoke("datajud-lote", {
        body: { job_id: novoJob.id, processo_ids: processoIds },
      }).then(({ error }) => {
        if (error) {
          toast({
            title: "Erro na consulta DataJud",
            description: error.message ?? "Falha ao processar lote",
            variant: "destructive",
          });
        }
      });

      acompanhar(novoJob.id);
      return novoJob.id;
    } catch (e) {
      toast({
        title: "Falha ao iniciar consulta DataJud",
        description: e instanceof Error ? e.message : "Erro desconhecido",
        variant: "destructive",
      });
      throw e;
    } finally {
      setIniciando(false);
    }
  };

  return { job, polling: polling || iniciando, consultar, parar, reset };
}
