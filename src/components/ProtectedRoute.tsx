import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth, Modulo, Acao } from "@/contexts/AuthContext";
import { useUserPortais, PortalDisponivel } from "@/hooks/useUserPortais";
import { usePreviewMode } from "@/contexts/PreviewModeContext";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: ReactNode;
  requireModulo?: Modulo;
  requireAcao?: Acao;
  requireGestor?: boolean;
  /**
   * Restringe o acesso a usuários que tenham vínculo com este portal.
   * Se informado, usuários sem o vínculo são redirecionados para /selecionar-portal
   * (ou para o seu portal correto, se houver apenas um).
   */
  requirePortal?: PortalDisponivel;
}

export function ProtectedRoute({
  children,
  requireModulo,
  requireAcao = "visualizar",
  requireGestor,
  requirePortal,
}: ProtectedRouteProps) {
  const { user, loading, hasPermission, profile, isGestor } = useAuth();
  const { portais, loading: portaisLoading } = useUserPortais();
  const { preview } = usePreviewMode();
  const location = useLocation();

  if (loading || (requirePortal && portaisLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Bloqueio rígido por TIPO DE PORTAL DO PROFILE.
  // Um profile marcado como "cliente" NUNCA acessa portal interno/parceiro,
  // mesmo que tenha sido criado erroneamente com role.
  // Um profile "parceiro" só acessa o portal de parceiro.
  const tipoPerfil = profile?.tipo_portal ?? "interno";
  const destinoPorTipo: Record<string, string> = {
    cliente: "/portal-cliente",
    parceiro: "/portal-parceiro",
  };
  if (tipoPerfil !== "interno") {
    // Se a rota requer portal específico e não bate com o tipo do perfil → manda pro portal correto
    if (requirePortal && requirePortal !== tipoPerfil) {
      return <Navigate to={destinoPorTipo[tipoPerfil]} replace />;
    }
    // Se a rota é interna sem requirePortal mas exige módulo/gestor → bloqueia
    if (!requirePortal && (requireModulo || requireGestor)) {
      return <Navigate to={destinoPorTipo[tipoPerfil]} replace />;
    }
  }

  // Restrição por tipo de portal: o usuário precisa ter vínculo com este portal
  if (requirePortal) {
    // Gestor em modo preview do mesmo tipo: liberado para visualizar
    const previewLiberado = isGestor && preview?.tipo === requirePortal;
    if (!previewLiberado) {
      const temVinculo = portais.some((p) => p.tipo === requirePortal);
      if (!temVinculo) {
        // Se tem vínculo único com outro portal, manda direto pra lá; senão, seletor
        if (portais.length === 1) {
          return <Navigate to={portais[0].rota} replace />;
        }
        return <Navigate to="/selecionar-portal" replace />;
      }
    }
  }

  // Conta inativa só bloqueia o portal interno (parceiros/clientes têm seus próprios fluxos)
  if (profile && !profile.ativo && (!requirePortal || requirePortal === "interno") && tipoPerfil === "interno") {
    return <Navigate to="/conta-inativa" replace />;
  }

  if (requireGestor && !isGestor) {
    return <Navigate to="/sem-permissao" replace />;
  }

  if (requireModulo && !hasPermission(requireModulo, requireAcao)) {
    return <Navigate to="/sem-permissao" replace />;
  }

  return <>{children}</>;
}

