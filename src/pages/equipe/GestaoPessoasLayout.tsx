import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Users, Wallet, Clock, Plane, Target, Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const TABS = [
  { to: "/equipe", label: "Membros", icon: Users, end: true },
  { to: "/equipe/ponto", label: "Ponto", icon: Clock, end: false },
  { to: "/equipe/ferias", label: "Férias", icon: Plane, end: false },
  { to: "/equipe/metas", label: "Metas", icon: Target, end: false },
  { to: "/equipe/comissoes", label: "Comissões", icon: Coins, end: false },
  { to: "/equipe/folha", label: "Folha de pagamento", icon: Wallet, end: false, gestorOnly: true },
];

export default function GestaoPessoasLayout() {
  const { isGestor } = useAuth();
  const location = useLocation();

  // Esconder abas em rotas de detalhe/formulário (ex: /equipe/:id, /equipe/novo)
  const ocultarAbas =
    /^\/equipe\/(novo|[a-f0-9-]{8,})/.test(location.pathname);

  return (
    <div className="space-y-6">
      {!ocultarAbas && (
        <nav className="border-b border-border -mt-2">
          <div className="flex flex-wrap gap-x-1 gap-y-2 overflow-x-auto">
            {TABS.filter((t) => !t.gestorOnly || isGestor).map((tab) => {
              const Icon = tab.icon;
              return (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  end={tab.end}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                      isActive
                        ? "border-gold text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                    )
                  }
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </NavLink>
              );
            })}
          </div>
        </nav>
      )}
      <Outlet />
    </div>
  );
}
