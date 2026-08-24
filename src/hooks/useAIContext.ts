import { useLocation } from "react-router-dom";

export interface ContextoRota {
  pathname: string;
  modulo: string;
  entityId?: string;
}

/**
 * Detecta o módulo atual e id de entidade na URL para enriquecer o assistente.
 */
export function useAIContext(): ContextoRota {
  const { pathname } = useLocation();
  const partes = pathname.split("/").filter(Boolean);

  let modulo = "dashboard";
  if (partes[0]) modulo = partes[0];

  // Heurística simples: se segundo segmento for um UUID ou número, é entityId
  let entityId: string | undefined;
  const seg = partes[1];
  if (seg && /^[0-9a-f]{8}-[0-9a-f-]+$|^\d+$/i.test(seg)) {
    entityId = seg;
  }

  return { pathname, modulo, entityId };
}
