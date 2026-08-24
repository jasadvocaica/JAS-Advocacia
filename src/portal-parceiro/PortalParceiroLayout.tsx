import { ReactNode, useEffect, useRef } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePortalParceiro } from "./usePortalParceiro";
import { registrarAcaoParceiro, type AcaoParceiro } from "./auditLog";
import {
  LayoutDashboard, Briefcase, ListChecks, Calendar,
  FileText, HandCoins, UserCircle, LogOut, Loader2, ShieldAlert, HelpCircle, PlusCircle, Users,
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { PreviewBanner } from "@/components/PreviewBanner";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { iniciais } from "@/pages/parceiros/types";
import { PERMISSOES_PARCEIRO, NAV_PARCEIRO_KEYS } from "./permissoes";

const ROUTE_LABELS: Record<string, string> = {
  "": "Dashboard",
  processos: "Processos",
  clientes: "Clientes",
  indicacoes: "Indicações",
  tarefas: "Tarefas",
  prazos: "Prazos",
  documentos: "Documentos",
  repasses: "Meus repasses",
  perfil: "Perfil",
};

function PortalBreadcrumbs({ basePath }: { basePath: string }) {
  const location = useLocation();
  const prefix = basePath || "";
  const rest = location.pathname.startsWith(prefix)
    ? location.pathname.slice(prefix.length)
    : location.pathname;
  const segments = rest.split("/").filter(Boolean);

  const crumbs = segments.map((seg, idx) => {
    const href = `${prefix}/${segments.slice(0, idx + 1).join("/")}`;
    const isLast = idx === segments.length - 1;
    // se for um id (uuid-ish ou qualquer não-mapeado), mostra "Detalhe"
    const label = ROUTE_LABELS[seg] ?? (idx > 0 ? "Detalhe" : seg);
    return { href, label, isLast };
  });

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to={prefix || "/"}>Portal</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {crumbs.map((c) => (
          <span key={c.href} className="flex items-center gap-1.5 sm:gap-2.5">
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {c.isLast ? (
                <BreadcrumbPage>{c.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link to={c.href}>{c.label}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </span>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

const NAV_META: Record<string, { label: string; icon: typeof LayoutDashboard; end?: boolean }> = {
  dashboard: { label: "Dashboard", icon: LayoutDashboard, end: true },
  processos: { label: "Processos", icon: Briefcase },
  clientes: { label: "Clientes", icon: Users },
  indicacoes: { label: "Indicações", icon: PlusCircle },
  tarefas: { label: "Minhas tarefas", icon: ListChecks },
  prazos: { label: "Meus prazos", icon: Calendar },
  documentos: { label: "Documentos", icon: FileText },
  repasses: { label: "Meus repasses", icon: HandCoins },
  perfil: { label: "Perfil", icon: UserCircle },
};

// Filtrado pela matriz de permissões: só entra no menu o que está
// marcado como visivelNoMenu + podeAcessar em src/portal-parceiro/permissoes.ts
const NAV = NAV_PARCEIRO_KEYS
  .filter(({ key }) => {
    const p = PERMISSOES_PARCEIRO[key];
    return p?.visivelNoMenu && p?.podeAcessar;
  })
  .map(({ key, to }) => ({ to, ...NAV_META[key] }));

function PortalParceiroSidebar({ basePath, parceiroNome, parceiroOab, parceiroEmail, onSignOut }: {
  basePath: string;
  parceiroNome: string;
  parceiroOab: string | null;
  parceiroEmail: string | null;
  onSignOut: () => void;
}) {
  return (
    <aside className="hidden lg:flex flex-col w-64 shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="p-4 border-b border-sidebar-border bg-[hsl(var(--sidebar-header))] text-[hsl(var(--sidebar-header-foreground))]">
        <BrandLogo variant="dark" size="h-44" />
        <div className="flex justify-center mt-2">
          <Badge className="bg-primary text-primary-foreground text-[10px] px-2 py-0 h-4">
            PORTAL DO PARCEIRO
          </Badge>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-hide py-4 px-3 space-y-1">
        {NAV.map((item) => {
          const Icon = item.icon;
          const target = item.to ? `${basePath}/${item.to}` : basePath || "/";
          return (
            <NavLink
              key={item.to}
              to={target}
              end={item.end}
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary border-l-2 border-primary font-semibold"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary",
              )}
            >
              <Icon className="w-4 h-4 shrink-0 text-sidebar-foreground/70" />
              <span className="flex-1">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="p-3 border-t border-sidebar-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-sidebar-accent transition-colors text-left">
              <Avatar className="h-9 w-9 border border-sidebar-border">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                  {iniciais(parceiroNome) || "?"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-sidebar-foreground">{parceiroNome}</p>
                <p className="text-xs text-sidebar-foreground/70 truncate">
                  {parceiroOab ?? "Parceiro"}
                </p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{parceiroEmail ?? "Conta"}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onSignOut}>
              <LogOut className="w-4 h-4 mr-2" /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}

export default function PortalParceiroLayout({ basePath = "" }: { basePath?: string }) {
  const { user, loading: authLoading, signOut } = useAuth();
  const { parceiro, loading } = usePortalParceiro();
  const location = useLocation();
  const navigate = useNavigate();

  // Primeiro acesso: leva o parceiro para a tela de boas-vindas com
  // a explicação do que ele pode ver e fazer. Marca em localStorage
  // para não reabrir nas próximas sessões.
  useEffect(() => {
    if (!parceiro?.id) return;
    const chave = `portal-parceiro:onboarding:${parceiro.id}`;
    let visto = "0";
    try { visto = localStorage.getItem(chave) ?? "0"; } catch {}
    const naRaiz = location.pathname === basePath || location.pathname === `${basePath}/`;
    if (visto !== "1" && naRaiz) {
      navigate(`${basePath}/bem-vindo`, { replace: true });
    }
  }, [parceiro?.id, location.pathname, basePath, navigate]);

  // Auditoria automática: registra cada navegação dentro do portal.
  // Mapeia o segmento da rota para uma ação semântica e dedupa para
  // não logar o mesmo path duas vezes em re-renders.
  const ultimoPathLogado = useRef<string | null>(null);
  useEffect(() => {
    if (!parceiro?.id) return;
    if (ultimoPathLogado.current === location.pathname) return;
    ultimoPathLogado.current = location.pathname;

    const prefix = basePath || "";
    const rest = location.pathname.startsWith(prefix)
      ? location.pathname.slice(prefix.length)
      : location.pathname;
    const segs = rest.split("/").filter(Boolean);
    const primeiro = segs[0] ?? "";
    const segundo = segs[1];

    const mapaAcao: Record<string, AcaoParceiro> = {
      "": "acessou_dashboard",
      processos: "acessou_processos",
      tarefas: "acessou_tarefas",
      prazos: "acessou_prazos",
      documentos: "acessou_documentos",
      repasses: "acessou_financeiro",
      perfil: "acessou_perfil",
    };

    // /processos/:id => acessou_processo_detalhe (com recurso_id)
    if (primeiro === "processos" && segundo) {
      registrarAcaoParceiro({
        parceiroId: parceiro.id,
        acao: "acessou_processo_detalhe",
        recursoTipo: "processo",
        recursoId: segundo,
        descricao: `Abriu detalhe do processo ${segundo.slice(0, 8)}…`,
      });
      return;
    }

    const acao = mapaAcao[primeiro];
    if (acao) {
      registrarAcaoParceiro({
        parceiroId: parceiro.id,
        acao,
        recursoTipo: "pagina",
        descricao: `Acessou ${primeiro || "dashboard"}`,
      });
    }
  }, [location.pathname, parceiro?.id, basePath]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-gold" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!parceiro) {
    return <SemAcessoParceiro onSignOut={() => signOut()} />;
  }

  return (
    <div className="flex flex-col min-h-screen bg-muted/30">
      <PreviewBanner />
      <div className="flex flex-1 min-h-0">
      <PortalParceiroSidebar
        basePath={basePath}
        parceiroNome={parceiro.nome}
        parceiroOab={parceiro.oab_completo}
        parceiroEmail={parceiro.email}
        onSignOut={() => signOut()}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-16 border-b border-border bg-background/80 backdrop-blur-md flex items-center px-4 sm:px-6 gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Badge className="bg-sidebar text-sidebar-foreground border border-gold/40 shrink-0">
              Portal do Parceiro
            </Badge>
            <div className="hidden sm:block h-5 w-px bg-border" />
            <div className="hidden sm:block min-w-0 truncate">
              <PortalBreadcrumbs basePath={basePath} />
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`${basePath}/bem-vindo`)}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <HelpCircle className="w-4 h-4" />
            <span className="hidden sm:inline">Como usar</span>
          </Button>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 animate-fade-in">
          <RouteErrorBoundary resetKey={location.pathname} modulo="portal-parceiro">
            <Outlet context={{ parceiro }} />
          </RouteErrorBoundary>
        </main>
      </div>
      </div>
    </div>
  );
}

function SemAcessoParceiro({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-destructive/10 mx-auto flex items-center justify-center">
          <ShieldAlert className="w-7 h-7 text-destructive" />
        </div>
        <h1 className="font-display text-2xl">Acesso ao portal indisponível</h1>
        <p className="text-sm text-muted-foreground">
          Sua conta não está vinculada a um cadastro de parceiro ativo, ou o portal ainda não foi
          ativado pelo escritório. Entre em contato com a Juliana Araujo Advocacia.
        </p>
        <Button variant="outline" onClick={onSignOut}>
          <LogOut className="w-4 h-4 mr-2" /> Sair
        </Button>
      </div>
    </div>
  );
}

export type PortalParceiroContext = {
  parceiro: {
    id: string;
    nome: string;
    oab_completo: string | null;
    email: string | null;
    whatsapp: string | null;
    cidade: string | null;
    estado: string | null;
    especialidades: string[] | null;
  };
};
