import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  resolverPortaisDisponiveis,
  descreverMotivoIdentificacao,
  type PortalInfo,
  type PortalDisponivel,
} from "@/lib/portal-rules";

export type { PortalDisponivel, PortalInfo };

/**
 * Detecta vínculos do usuário aplicando as regras documentadas em
 * `@/lib/portal-rules`. Consulta `parceiros` e `cliente_usuarios` por
 * e-mail e combina com profile/roles + domínio corporativo.
 */
export function useUserPortais() {
  const { user, profile, roles, loading: authLoading } = useAuth();
  const [portais, setPortais] = useState<PortalInfo[]>([]);
  const [motivo, setMotivo] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const userId = user?.id;
  const email = user?.email;
  const profileAtivo = !!profile?.ativo;
  const rolesCount = roles?.length ?? 0;

  useEffect(() => {
    let cancelado = false;
    if (authLoading) return () => { cancelado = true; };
    if (!userId) {
      setPortais([]);
      setMotivo("");
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);

      const [parceiroRes, clienteRes] = await Promise.all([
        supabase
          .from("parceiros")
          .select("id, nome")
          .eq("email", email!)
          .eq("portal_ativo", true)
          .eq("ativo", true)
          .maybeSingle(),
        supabase
          .from("cliente_usuarios")
          .select("cliente_id, ativo, clientes(nome)")
          .eq("email", email!)
          .eq("ativo", true)
          .maybeSingle(),
      ]);

      const ctx = {
        email,
        profileAtivo,
        rolesCount,
        parceiroNome: parceiroRes.data?.nome ?? null,
        clienteNome:
          (clienteRes.data as any)?.clientes?.nome ??
          (clienteRes.data ? "Acompanhar processos" : null),
      };

      const lista = resolverPortaisDisponiveis(ctx);
      if (cancelado) return;
      setPortais(lista);
      setMotivo(descreverMotivoIdentificacao(ctx, lista));
      setLoading(false);
    })();

    return () => {
      cancelado = true;
    };
  }, [userId, email, profileAtivo, rolesCount, authLoading]);

  return { portais, motivo, loading: loading || authLoading };
}
