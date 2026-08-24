import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface ResponsavelComunicacaoInfo {
  configurado: boolean;
  user_id: string | null;
  nome: string | null;
  ativo: boolean;
}

/**
 * Responsável comercial pela comunicação com o cliente após o protocolo.
 * Vem de configuração explícita no banco — nenhum UUID é fixado no frontend.
 */
export function useResponsavelComunicacao() {
  const { user } = useAuth();
  return useQuery<ResponsavelComunicacaoInfo>({
    queryKey: ["comercial-responsavel-comunicacao"],
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("comercial_responsavel_comunicacao");
      const d = (data ?? {}) as any;
      return {
        configurado: !!d.configurado,
        user_id: d.user_id ?? null,
        nome: d.nome ?? null,
        ativo: !!d.ativo,
      };
    },
  });
}
