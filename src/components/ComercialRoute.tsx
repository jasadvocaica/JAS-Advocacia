import { useQuery } from "@tanstack/react-query";
import { contexto } from "@/pages/marketing/api";
import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useResponsavelComunicacao } from "@/hooks/useResponsavelComunicacao";

interface ComercialRouteProps {
  children: ReactNode;
  requireGestor?: boolean;
  requireDemandas?: boolean;
}

/**
 * Protege a operação comercial por uma regra explícita:
 * gestor, capacidade comercial validada no servidor ou responsável configurado.
 * Nenhuma pessoa ou UUID fica fixado no código.
 */
export function ComercialRoute({ children, requireGestor = false, requireDemandas = false }: ComercialRouteProps) {
  const { user, isGestor } = useAuth();
  const {data:departamento,isLoading:carregandoAcesso}=useQuery({queryKey:["mkt-contexto",user?.id],queryFn:contexto,enabled:!!user?.id&&!isGestor,retry:false});
  const { data: responsavel, isLoading } = useResponsavelComunicacao();

  if (isLoading || carregandoAcesso) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (requireGestor && !isGestor) {
    return <Navigate to="/sem-permissao" replace />;
  }

  const autorizado =
    isGestor ||
    !!(requireDemandas ? (departamento?.permissoes.demandas || departamento?.permissoes.comercial) : departamento?.permissoes.comercial) ||
    (!!user?.id && responsavel?.ativo && responsavel.user_id === user.id);

  if (!autorizado) {
    return <Navigate to="/sem-permissao" replace />;
  }

  return <>{children}</>;
}
