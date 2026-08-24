import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Lê a URL da logo customizada salva em `configuracoes_sistema`
 * (seção `escritorio`, chave `logo_url`). Pública — não exige role de gestor
 * porque a configuração tem `publica = true` (lida via RLS pública).
 *
 * Retorna `null` enquanto carrega ou se nenhuma logo customizada estiver definida,
 * para que o componente que consome possa cair no asset padrão.
 */
export function useBrandingLogo() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ativo = true;
    (async () => {
      const { data } = await supabase
        .from("configuracoes_sistema")
        .select("valor")
        .eq("secao", "escritorio")
        .eq("chave", "logo_url")
        .maybeSingle();
      if (!ativo) return;
      const url = data?.valor?.trim();
      setLogoUrl(url ? url : null);
      setLoading(false);
    })();
    return () => {
      ativo = false;
    };
  }, []);

  return { logoUrl, loading };
}
