import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { IeJob, IeJobStatus, ErroLinha } from "@/pages/importacao-exportacao/types";

const BUCKET = "ie-arquivos";
/** Validade dos arquivos gerados/enviados, em dias */
export const EXPIRACAO_DIAS = 7;

export function useIeJobs(opts?: { limit?: number; tipo?: "importacao" | "exportacao" }) {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<IeJob[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    let q = (supabase as any)
      .from("ie_jobs")
      .select("*")
      .order("iniciado_em", { ascending: false })
      .limit(opts?.limit ?? 50);
    if (opts?.tipo) q = q.eq("tipo", opts.tipo);
    const { data, error } = await q;
    if (!error && data) setJobs(data as IeJob[]);
    setLoading(false);
  }, [user, opts?.limit, opts?.tipo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return { jobs, loading, recarregar: carregar };
}

interface CriarJobInput {
  tipo: "importacao" | "exportacao";
  modulo: string;
  subtipo?: string;
  filtros?: Record<string, unknown>;
  arquivo_entrada_nome?: string;
}

export async function criarJob(input: CriarJobInput, userId: string): Promise<IeJob> {
  const { data, error } = await (supabase as any)
    .from("ie_jobs")
    .insert({
      tipo: input.tipo,
      modulo: input.modulo,
      subtipo: input.subtipo ?? null,
      filtros: input.filtros ?? {},
      arquivo_entrada_nome: input.arquivo_entrada_nome ?? null,
      iniciado_por: userId,
      status: "processando",
      expira_em: new Date(Date.now() + EXPIRACAO_DIAS * 86400000).toISOString(),
    })
    .select()
    .single();
  if (error || !data) throw error ?? new Error("Falha ao criar job");
  return data as IeJob;
}

export async function atualizarJob(
  id: string,
  patch: {
    status?: IeJobStatus;
    total_registros?: number;
    registros_ok?: number;
    registros_erro?: number;
    erros_json?: ErroLinha[];
    arquivo_entrada_url?: string;
    arquivo_saida_url?: string;
    arquivo_saida_nome?: string;
    arquivo_tamanho_bytes?: number;
    mensagem?: string;
  },
) {
  const concluido = patch.status && ["concluido", "concluido_parcial", "erro"].includes(patch.status);
  const { error } = await (supabase as any)
    .from("ie_jobs")
    .update({
      ...patch,
      ...(concluido ? { concluido_em: new Date().toISOString() } : {}),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function uploadArquivoIe(
  userId: string,
  jobId: string,
  arquivo: File | Blob,
  nome: string,
): Promise<string> {
  const path = `${userId}/${jobId}/${nome}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, arquivo, { upsert: true });
  if (error) throw error;
  return path;
}

/**
 * Cria uma URL assinada para download. Retorna null se o arquivo não existir
 * ou se o job estiver expirado.
 */
export async function urlAssinadaIe(path: string, segundos = 60 * 5): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, segundos);
  if (error || !data) return null;
  return data.signedUrl;
}
