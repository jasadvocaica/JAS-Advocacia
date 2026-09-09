import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useResponsavelComunicacao } from "@/hooks/useResponsavelComunicacao";

interface ComercialRouteProps {
  children: ReactNode;
  requireGestor?: boolean;
}

/**
 * Protege a operação comercial por uma regra explícita:
 * gestor, permissão granular de Marketing ou responsável de comunicação configurado.
 * Nenhuma pessoa ou UUID fica fixado no código.
 */
export function ComercialRoute({ children, requireGestor = false }: ComercialRouteProps) {
  const { user, isGestor, hasPermission } = useAuth();
  const { data: responsavel, isLoading } = useResponsavelComunicacao();

  if (isLoading) {
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
    hasPermission("marketing", "visualizar") ||
    (!!user?.id && responsavel?.ativo && responsavel.user_id === user.id);

  if (!autorizado) {
    return <Navigate to="/sem-permissao" replace />;
  }

  return <>{children}</>;
}
