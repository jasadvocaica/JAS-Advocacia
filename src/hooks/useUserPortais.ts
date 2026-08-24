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

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
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
          .eq("email", user.email!)
          .eq("portal_ativo", true)
          .eq("ativo", true)
          .maybeSingle(),
        supabase
          .from("cliente_usuarios")
          .select("cliente_id, ativo, clientes(nome)")
          .eq("email", user.email!)
          .eq("ativo", true)
          .maybeSingle(),
      ]);

      const ctx = {
        email: user.email,
        profileAtivo: !!profile?.ativo,
        rolesCount: roles?.length ?? 0,
        parceiroNome: parceiroRes.data?.nome ?? null,
        clienteNome:
          (clienteRes.data as any)?.clientes?.nome ??
          (clienteRes.data ? "Acompanhar processos" : null),
      };

      const lista = resolverPortaisDisponiveis(ctx);
      setPortais(lista);
      setMotivo(descreverMotivoIdentificacao(ctx, lista));
      setLoading(false);
    })();
  }, [user, profile, roles, authLoading]);

  return { portais, motivo, loading: loading || authLoading };
}
