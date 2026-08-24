import { useMemo } from "react";

export type Ambiente = "interno" | "parceiro" | "cliente";

/**
 * Detecta qual portal renderizar baseado APENAS no prefixo do path:
 *  - /portal-parceiro → parceiro
 *  - /portal-cliente  → cliente
 *  - resto            → interno
 *
 * (Subdomínios foram removidos: usamos um login único + seletor de portal.)
 */
export function usePortalAmbiente(): {
  ambiente: Ambiente;
  basePath: string;
  isInterno: boolean;
  isParceiro: boolean;
  isCliente: boolean;
} {
  return useMemo(() => {
    if (typeof window === "undefined") {
      return { ambiente: "interno", basePath: "", isInterno: true, isParceiro: false, isCliente: false };
    }
    const path = window.location.pathname;

    let ambiente: Ambiente = "interno";
    let basePath = "";

    if (path.startsWith("/portal-parceiro")) {
      ambiente = "parceiro";
      basePath = "/portal-parceiro";
    } else if (path.startsWith("/portal-cliente")) {
      ambiente = "cliente";
      basePath = "/portal-cliente";
    }

    return {
      ambiente,
      basePath,
      isInterno: ambiente === "interno",
      isParceiro: ambiente === "parceiro",
      isCliente: ambiente === "cliente",
    };
  }, []);
}
