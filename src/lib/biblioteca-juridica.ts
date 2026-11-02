import { supabase } from "@/integrations/supabase/client";
export { prepararConsulta } from "../../supabase/functions/_shared/fundamentos";
export type { FonteLegal } from "../../supabase/functions/_shared/fundamentos";
export interface EstadoBiblioteca {
  normas: number;
  normas_ativas: number;
  dispositivos: number;
  ultima_verificacao: string | null;
  escopo: string;
  catalogo: {
    id: string;
    titulo: string;
    versao_texto: string;
    verificado_em: string;
  }[];
}
export async function consultarBiblioteca<T>(
  nome: "jur_estado" | "jur_pesquisar",
  args: Record<string, unknown> = {},
): Promise<T> {
  const api = supabase as unknown as {
    rpc: (
      nome: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: T; error: { message: string } | null }>;
  };
  const { data, error } = await api.rpc(nome, args);
  if (error)
    throw new Error(
      "Não foi possível consultar a biblioteca jurídica. Tente novamente.",
    );
  return data;
}
