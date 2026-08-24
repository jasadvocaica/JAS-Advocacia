import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useIeJobPolling } from "./useIeJobPolling";
import { criarJob, uploadArquivoIe, atualizarJob } from "./useIeJobs";

export interface ItemValidadoPdpj {
  cnj: string;
  cnj_limpo: string;
  status_validacao: "ok" | "duplicado_pdf" | "duplicado_banco" | "campos_faltando";
  campos_faltando: string[];
  autor_generico: boolean;
  autor: string;
  reu: string | null;
  tribunal_sigla: string | null;
  vara: string | null;
  data_distribuicao: string | null;
}

export interface ResumoValidacaoPdpj {
  total: number;
  ok: number;
  duplicado_pdf: number;
  duplicado_banco: number;
  campos_faltando: number;
}

/**
 * Importação em lote de processos a partir de um PDF do Portal PDPJ.
 * Fluxo em duas etapas:
 *   1. validar(arquivo)  → cria job, faz upload, roda dry_run e devolve a prévia
 *   2. confirmar(pular_cnjs?) → grava de fato, pulando duplicatas e CNJs marcados
 */
export function useIeImportarPdpj() {
  const { job, polling, acompanhar, parar } = useIeJobPolling();
  const [iniciando, setIniciando] = useState(false);
  const [validando, setValidando] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [validacao, setValidacao] = useState<{
    resumo: ResumoValidacaoPdpj;
    itens: ItemValidadoPdpj[];
  } | null>(null);

  const validar = async (arquivo: File) => {
    setValidando(true);
    setValidacao(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada");

      const novoJob = await criarJob(
        {
          tipo: "importacao",
          modulo: "processos",
          subtipo: "pdf_pdpj",
          arquivo_entrada_nome: arquivo.name,
        },
        user.id,
      );

      const path = await uploadArquivoIe(user.id, novoJob.id, arquivo, arquivo.name);
      await atualizarJob(novoJob.id, { arquivo_entrada_url: path });

      const { data, error } = await supabase.functions.invoke("pdpj-importar-pdf", {
        body: { job_id: novoJob.id, dry_run: true },
      });
      if (error) throw error;

      setJobId(novoJob.id);
      const resumo = (data as { resumo?: ResumoValidacaoPdpj })?.resumo;
      const itens = (data as { itens?: ItemValidadoPdpj[] })?.itens ?? [];
      if (!resumo) throw new Error("Pré-validação não retornou resumo.");
      setValidacao({ resumo, itens });
      return { jobId: novoJob.id, resumo, itens };
    } catch (e) {
      toast({
        title: "Falha na pré-validação do PDF",
        description: e instanceof Error ? e.message : "Erro desconhecido",
        variant: "destructive",
      });
      throw e;
    } finally {
      setValidando(false);
    }
  };

  const confirmar = async (pular_cnjs: string[] = []) => {
    if (!jobId) throw new Error("Execute a pré-validação primeiro.");
    setIniciando(true);
    try {
      const { error } = await supabase.functions.invoke("pdpj-importar-pdf", {
        body: { job_id: jobId, dry_run: false, pular_cnjs },
      });
      if (error) throw error;
      acompanhar(jobId);
      return jobId;
    } catch (e) {
      toast({
        title: "Falha ao gravar processos",
        description: e instanceof Error ? e.message : "Erro desconhecido",
        variant: "destructive",
      });
      throw e;
    } finally {
      setIniciando(false);
    }
  };

  const reset = () => {
    setJobId(null);
    setValidacao(null);
    parar();
  };

  return {
    job,
    polling: polling || iniciando,
    validando,
    validacao,
    validar,
    confirmar,
    parar,
    reset,
  };
}
