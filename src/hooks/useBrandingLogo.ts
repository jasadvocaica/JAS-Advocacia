import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Cache em memória do resultado da consulta. A logo é a mesma para todas as
 * instâncias de <BrandLogo/> na página (login tem várias), e a consulta antes
 * do login não é autorizada quando a migration de leitura anônima ainda não
 * foi aplicada — sem esse cache, cada instância gerava um 401 no console.
 */
let logoPromessa: Promise<string | null> | null = null;

function buscarLogo(): Promise<string | null> {
  if (logoPromessa) return logoPromessa;

  logoPromessa = (async () => {
    try {
      const { data, error } = await supabase
        .from("configuracoes_sistema")
        .select("valor")
        .eq("secao", "escritorio")
        .eq("chave", "logo_url")
        .maybeSingle();

      // 401/403 = sem permissão de leitura anônima. Silencioso de propósito:
      // o branding nunca deve impedir o carregamento da tela de login.
      if (error) return null;

      return data?.valor?.trim() || null;
    } catch {
      return null;
    }
  })();

  return logoPromessa;
}

/**
 * Lê a URL da logo customizada salva em `configuracoes_sistema`
 * (seção `escritorio`, chave `logo_url`). A linha tem `publica = true`.
 *
 * Retorna `null` enquanto carrega ou se nenhuma logo customizada estiver
 * definida, para que o componente que consome caia no asset padrão.
 */
export function useBrandingLogo() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ativo = true;

    void buscarLogo().then((url) => {
      if (!ativo) return;
      setLogoUrl(url);
      setLoading(false);
    });

    return () => {
      ativo = false;
    };
  }, []);

  return { logoUrl, loading };
}

/**
 * Invalida o cache — chamar depois que o usuário faz login, para que o logo
 * customizado (agora autorizado) seja lido de verdade.
 */
export function invalidarCacheLogo() {
  logoPromessa = null;
}
