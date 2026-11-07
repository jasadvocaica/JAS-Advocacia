import { supabase } from "@/integrations/supabase/client";
import type { FiltrosResultados, LinhaAds } from "./resultados";
export type Registro = Record<string, unknown>;
export interface PainelResultados {
  conexao: {
    estado: string;
    ultima_sync_ok_em: string | null;
    addon_ads: boolean | null;
    intervalo_minutos: number;
  };
  contas: {
    externo_id: string;
    nome: string;
    plataforma: string;
    precisa_reconectar: boolean;
  }[];
  diario: LinhaAds[];
  campanhas: Registro[];
  conjuntos: Registro[];
  anuncios: Registro[];
  publicacoes: Registro[];
  job_ativo: Registro | null;
  ultima_rodada: Registro | null;
  crm: null | {
    leads: number;
    qualificados: number;
    contratos: number;
    sem_atribuicao: number;
    campanhas: {
      campanha_id: string | null;
      nome: string;
      leads: number;
      contratos: number;
    }[];
  };
  apurado_em: string;
  parcial: boolean;
}
export class ErroMarketing extends Error {
  constructor(
    mensagem: string,
    public codigo?: string,
  ) {
    super(mensagem);
  }
}
export async function operacaoMarketing<T>(
  acao: string,
  payload: Registro = {},
): Promise<T> {
  const { data, error } = await supabase.rpc(
    "mkt_integrado" as never,
    { _acao: acao, _payload: payload } as never,
  );
  if (error) throw new ErroMarketing(error.message, error.code);
  return data as T;
}
export const lerResultados = (f: FiltrosResultados) =>
  operacaoMarketing<PainelResultados>("resultados", { ...f });
