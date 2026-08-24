import { useOutletContext } from "react-router-dom";

export interface PortalClienteCtx {
  clienteId: string;
  clienteNome: string;
  mostrarFinanceiro: boolean;
  primeiroAcesso: boolean;
  vinculoId: string;
}

export function usePortalCliente() {
  return useOutletContext<PortalClienteCtx>();
}
