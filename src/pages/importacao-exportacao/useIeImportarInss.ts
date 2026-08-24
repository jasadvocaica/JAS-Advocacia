import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useIeJobPolling } from "./useIeJobPolling";
import { criarJob, uploadArquivoIe, atualizarJob } from "./useIeJobs";

export interface ErroValidacaoInss {
  mensagem: string;
  detalhe?: string;
  job_id?: string;
}

export type StatusValidacaoInss =
  | "ok_novo_cliente"
  | "ok_cliente_existente"
  | "atualizar_existente"
  | "duplicado_pdf"
  | "campos_faltando";

export interface ItemValidadoInss {
  protocolo: string;
  servico: string;
  nome: string;
  cpf: string;
  cpf_limpo: string;
  protocolado_em: string | null;
  unidade: string | null;
  situacao: string | null;
  ultima_atualizacao: string | null;
  status_validacao: StatusValidacaoInss;
  cliente_id: string | null;
  processo_id: string | null;
  campos_faltando: string[];
}

export interface ResumoInss {
  total: number;
  ok_cliente_existente: number;
  ok_novo_cliente: number;
  atualizar_existente: number;
  duplicado_pdf: number;
  campos_faltando: number;
}

/**
 * Importação em lote de processos administrativos a partir do PDF do
 * Portal de Atendimento INSS. Fluxo em duas etapas (validar → confirmar).
 */
export function useIeImportarInss() {
  const { job, polling, acompanhar, parar } = useIeJobPolling();
  const [iniciando, setIniciando] = useState(false);
  const [validando, setValidando] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [validacao, setValidacao] = useState<{ resumo: ResumoInss; itens: ItemValidadoInss[] } | null>(null);
  const [erroValidacao, setErroValidacao] = useState<ErroValidacaoInss | null>(null);

  const buscarMensagemJob = async (id: string): Promise<string | null> => {
    try {
      const { data } = await supabase
        .from("ie_jobs")
        .select("mensagem, status, erros_json")
        .eq("id", id)
        .maybeSingle();
      if (!data) return null;
      const partes: string[] = [];
      if (data.mensagem) partes.push(String(data.mensagem));
      if (Array.isArray(data.erros_json) && data.erros_json.length > 0) {
        const primeirosErros = data.erros_json
          .slice(0, 3)
          .map((e: { mensagem?: string; erro?: string }) => e?.mensagem ?? e?.erro)
          .filter(Boolean)
          .join(" • ");
        if (primeirosErros) partes.push(primeirosErros);
      }
      return partes.join(" — ") || null;
    } catch {
      return null;
    }
  };

  const validar = async (arquivo: File) => {
    setValidando(true);
    setValidacao(null);
    setErroValidacao(null);
    let novoJobId: string | null = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada");

      const novoJob = await criarJob(
        {
          tipo: "importacao",
          modulo: "processos",
          subtipo: "pdf_inss",
          arquivo_entrada_nome: arquivo.name,
        },
        user.id,
      );
      novoJobId = novoJob.id;

      const path = await uploadArquivoIe(user.id, novoJob.id, arquivo, arquivo.name);
      await atualizarJob(novoJob.id, { arquivo_entrada_url: path });

      const { data, error } = await supabase.functions.invoke("inss-importar-pdf", {
        body: { job_id: novoJob.id, dry_run: true },
      });
      if (error) throw error;

      const resumo = (data as { resumo?: ResumoInss })?.resumo;
      const itens = (data as { itens?: ItemValidadoInss[] })?.itens ?? [];
      if (!resumo) {
        const detalheJob = await buscarMensagemJob(novoJob.id);
        const respErro =
          (data as { erro?: string; error?: string })?.erro ??
          (data as { erro?: string; error?: string })?.error ??
          null;
        throw new Error(
          detalheJob ?? respErro ?? "Pré-validação não retornou resumo (PDF sem protocolos detectáveis).",
        );
      }
      setJobId(novoJob.id);
      setValidacao({ resumo, itens });
      return { jobId: novoJob.id, resumo, itens };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      const detalhe = novoJobId ? await buscarMensagemJob(novoJobId) : null;
      setErroValidacao({
        mensagem: msg,
        detalhe: detalhe && detalhe !== msg ? detalhe : undefined,
        job_id: novoJobId ?? undefined,
      });
      toast({
        title: "Falha na pré-validação do PDF do INSS",
        description: detalhe ?? msg,
        variant: "destructive",
      });
      throw e;
    } finally {
      setValidando(false);
    }
  };

  const confirmar = async (pular_protocolos: string[] = []) => {
    if (!jobId) throw new Error("Execute a pré-validação primeiro.");
    setIniciando(true);
    try {
      const { error } = await supabase.functions.invoke("inss-importar-pdf", {
        body: { job_id: jobId, dry_run: false, pular_protocolos },
      });
      if (error) throw error;
      acompanhar(jobId);
      return jobId;
    } catch (e) {
      toast({
        title: "Falha ao gravar processos do INSS",
        description: e instanceof Error ? e.message : "Erro desconhecido",
        variant: "destructive",
      });
      throw e;
    } finally {
      setIniciando(false);
    }
  };

  const reset = useCallback(() => {
    setJobId(null);
    setValidacao(null);
    setErroValidacao(null);
    parar();
  }, [parar]);

  return { job, polling: polling || iniciando, validando, validacao, erroValidacao, validar, confirmar, parar, reset };
}
