import { Outlet, NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Globe, Bell, Wrench, Info } from "lucide-react";
import { Navigate } from "react-router-dom";

const ABAS = [
  { to: "/configuracoes/sistema", label: "Fuso & localização", icon: Globe, exact: true },
  { to: "/configuracoes/sistema/notificacoes", label: "Notificações", icon: Bell },
  { to: "/configuracoes/sistema/manutencao", label: "Manutenção", icon: Wrench },
  { to: "/configuracoes/sistema/sobre", label: "Sobre", icon: Info },
];

/**
 * Layout interno da seção "Sistema" — abas para fuso, notificações,
 * manutenção e sobre.
 */
export default function SistemaLayout() {
  const location = useLocation();

  // Se a pessoa entrou só em /configuracoes/sistema, mostra a primeira aba (Fuso)
  // que é o próprio Outlet — quem renderiza é o roteamento.

  return (
    <div className="space-y-4">
      <Card className="p-1.5">
        <nav className="flex flex-wrap gap-1">
          {ABAS.map((aba) => {
            const Icon = aba.icon;
            const ativo = aba.exact
              ? location.pathname === aba.to || location.pathname === aba.to + "/"
              : location.pathname.startsWith(aba.to);
            return (
              <NavLink
                key={aba.to}
                to={aba.to}
                end={aba.exact}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  ativo ? "bg-primary text-primary-foreground" : "text-foreground/70 hover:bg-muted",
                )}
              >
                <Icon className="w-4 h-4" />
                {aba.label}
              </NavLink>
            );
          })}
        </nav>
      </Card>

      <Outlet />
    </div>
  );
}
