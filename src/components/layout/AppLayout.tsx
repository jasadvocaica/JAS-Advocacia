import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useResponsavelComunicacao } from "@/hooks/useResponsavelComunicacao";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, Briefcase, ClipboardCheck, DollarSign,
  FileText, Handshake, Settings, LogOut, Menu, ChevronDown, Workflow, UserCog, Calendar, Wrench, Database, RefreshCw, Eye, Megaphone, Clock, Sun, Moon,
  PanelLeftClose, PanelLeftOpen, BarChart3, Scale,
} from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { useMuralAvisos } from "@/hooks/useMuralAvisos";
import { BrandLogo } from "@/components/BrandLogo";
import { Modulo } from "@/contexts/AuthContext";
import { NotificacoesBadge } from "@/components/layout/NotificacoesBadge";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { GlobalSearch } from "@/components/layout/GlobalSearch";
import { AssistenteFlutuante } from "@/components/assistente/AssistenteFlutuante";
import { VisualizarComoDialog } from "@/components/VisualizarComoDialog";
import { PreviewBanner } from "@/components/PreviewBanner";

const STORAGE_KEY = "legisflow_sidebar_collapsed";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  modulo?: Modulo;
  badge?: string;
}

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/clientes", label: "Clientes", icon: Users, modulo: "clientes" },
  { to: "/processos", label: "Processos", icon: Briefcase, modulo: "processos" },
  { to: "/controladoria", label: "Controladoria", icon: ClipboardCheck, modulo: "controladoria" },
  { to: "/agenda", label: "Agenda", icon: Calendar },
  { to: "/diligencias", label: "Diligências", icon: Scale },
  { to: "/fluxos", label: "Fluxos", icon: Workflow, modulo: "controladoria" },
  { to: "/financeiro", label: "Financeiro", icon: DollarSign, modulo: "financeiro" },
  { to: "/documentos", label: "Documentos", icon: FileText, modulo: "documentos" },
  { to: "/parceiros", label: "Parceiros", icon: Handshake, modulo: "parceiros" },
  { to: "/equipe", label: "Gestão de Pessoas", icon: UserCog, modulo: "equipe" },
  { to: "/ferramentas", label: "Ferramentas", icon: Wrench },
];

/**
 * Item de menu adaptado a estado recolhido/expandido.
 * Usa Tooltip do Radix quando collapsed para mostrar o nome.
 */
function SidebarItem({
  to,
  label,
  icon: Icon,
  collapsed,
  isActive,
  onNavigate,
  rightSlot,
}: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  collapsed: boolean;
  isActive: boolean;
  onNavigate?: () => void;
  rightSlot?: React.ReactNode;
}) {
  const link = (
    <NavLink
      to={to}
      onClick={onNavigate}
      aria-label={label}
      className={cn(
        "flex items-center gap-3 rounded-md text-sm font-medium transition-all",
        collapsed ? "justify-center px-0 py-2.5 mx-1" : "px-3 py-2.5",
        isActive
          ? "bg-sidebar-accent text-sidebar-primary border-l-2 border-primary font-semibold"
          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary",
      )}
    >
      <Icon className={cn("w-4 h-4 shrink-0", isActive ? "text-sidebar-primary" : "text-sidebar-foreground/70")} />
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
      {!collapsed && rightSlot}
    </NavLink>
  );

  if (!collapsed) return link;

  return (
    <Tooltip delayDuration={100}>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" className="font-medium">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function MuralNavItem({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { naoLidos } = useMuralAvisos();
  const location = useLocation();
  const isActive = location.pathname.startsWith("/mural-avisos");
  return (
    <SidebarItem
      to="/mural-avisos"
      label="Mural"
      icon={Megaphone}
      collapsed={collapsed}
      isActive={isActive}
      onNavigate={onNavigate}
      rightSlot={
        naoLidos > 0 ? (
          <Badge variant="secondary" className="bg-destructive text-destructive-foreground h-5 px-1.5">{naoLidos}</Badge>
        ) : null
      }
    />
  );
}

function SidebarContent({
  collapsed,
  onToggleCollapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
}) {
  const { hasPermission, isGestor, profile, signOut, roles, user } = useAuth();
  const isEstagiaria = roles.includes("estagiario");
  // Painel comercial: visível para gestor (supervisão) e para a usuária
  // definida na configuração explícita — sem UUID fixo no código.
  const { data: respComunicacao } = useResponsavelComunicacao();
  const podeVerComercial =
    isGestor || (!!user?.id && respComunicacao?.user_id === user.id);
  const location = useLocation();
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <TooltipProvider delayDuration={100}>
      <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground relative">
        {/* Header / Logo */}
        <div
          className={cn(
            "border-b border-sidebar-border bg-[hsl(var(--sidebar-header))] text-[hsl(var(--sidebar-header-foreground))]",
            collapsed ? "p-2 flex justify-center" : "p-4",
          )}
        >
          {collapsed ? (
            <div className="h-12 w-12 rounded-md bg-primary/15 text-primary font-display text-lg flex items-center justify-center font-bold border border-primary/30">
              JA
            </div>
          ) : (
            <BrandLogo variant="dark" size="h-44" />
          )}
        </div>

        {/* Toggle button (desktop only) */}
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            className="hidden lg:flex absolute -right-3 top-6 z-10 h-6 w-6 items-center justify-center rounded-full bg-background border border-border shadow-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {collapsed ? <PanelLeftOpen className="w-3.5 h-3.5" /> : <PanelLeftClose className="w-3.5 h-3.5" />}
          </button>
        )}

        <nav className={cn("flex-1 overflow-y-auto scrollbar-thin py-4 space-y-1", collapsed ? "px-1" : "px-3")}>
          {NAV.map((item) => {
            if (isEstagiaria && item.to === "/") return null;
            if (item.modulo && !hasPermission(item.modulo, "visualizar")) return null;
            const isActive = item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
            return (
              <SidebarItem
                key={item.to}
                to={item.to}
                label={item.label}
                icon={item.icon}
                collapsed={collapsed}
                isActive={isActive}
                onNavigate={onNavigate}
                rightSlot={
                  item.badge ? (
                    <Badge variant="secondary" className="bg-primary text-primary-foreground h-5 px-1.5">{item.badge}</Badge>
                  ) : null
                }
              />
            );
          })}

          {isEstagiaria && (
            <SidebarItem
              to="/painel-operacional"
              label="Dashboard"
              icon={LayoutDashboard}
              collapsed={collapsed}
              isActive={location.pathname.startsWith("/painel-operacional") || location.pathname === "/"}
              onNavigate={onNavigate}
            />
          )}
          <MuralNavItem collapsed={collapsed} onNavigate={onNavigate} />
          {isEstagiaria && (
            <SidebarItem
              to="/ponto"
              label="Meu ponto"
              icon={Clock}
              collapsed={collapsed}
              isActive={location.pathname.startsWith("/ponto")}
              onNavigate={onNavigate}
            />
          )}

          {isGestor && (
            <SidebarItem
              to="/painel-juliana"
              label="Meu painel"
              icon={LayoutDashboard}
              collapsed={collapsed}
              isActive={location.pathname.startsWith("/painel-juliana")}
              onNavigate={onNavigate}
            />
          )}

          {podeVerComercial && (
            <SidebarItem
              to="/painel-comercial"
              label="Painel comercial"
              icon={LayoutDashboard}
              collapsed={collapsed}
              isActive={location.pathname.startsWith("/painel-comercial")}
              onNavigate={onNavigate}
            />
          )}

          {hasPermission("controladoria", "visualizar") && (
            <SidebarItem
              to="/painel-producao"
              label="Minha produção"
              icon={LayoutDashboard}
              collapsed={collapsed}
              isActive={location.pathname.startsWith("/painel-producao")}
              onNavigate={onNavigate}
            />
          )}
          {isGestor && (
            <SidebarItem
              to="/dashboard-gestor"
              label="Painel executivo"
              icon={BarChart3}
              collapsed={collapsed}
              isActive={location.pathname.startsWith("/dashboard-gestor")}
              onNavigate={onNavigate}
            />
          )}
          {isGestor && (
            <>
              <div className={cn("pt-4 pb-2", collapsed ? "px-0" : "px-3")}>
                {collapsed ? (
                  <div className="h-px bg-sidebar-border mx-2" />
                ) : (
                  <div className="text-[10px] uppercase tracking-widest text-sidebar-foreground/60 font-semibold">
                    Administração
                  </div>
                )}
              </div>
              <SidebarItem
                to="/usuarios"
                label="Usuários"
                icon={Users}
                collapsed={collapsed}
                isActive={location.pathname.startsWith("/usuarios")}
                onNavigate={onNavigate}
              />
              <SidebarItem
                to="/importacao-exportacao"
                label="Importar / Exportar"
                icon={Database}
                collapsed={collapsed}
                isActive={location.pathname.startsWith("/importacao-exportacao")}
                onNavigate={onNavigate}
              />
              <SidebarItem
                to="/configuracoes"
                label="Configurações"
                icon={Settings}
                collapsed={collapsed}
                isActive={location.pathname.startsWith("/configuracoes")}
                onNavigate={onNavigate}
              />
            </>
          )}
        </nav>

        <div className={cn("border-t border-sidebar-border", collapsed ? "p-2" : "p-3")}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Menu do usuário"
                className={cn(
                  "w-full flex items-center rounded-md hover:bg-sidebar-accent transition-colors",
                  collapsed ? "justify-center p-1" : "gap-3 p-2",
                )}
              >
                {collapsed ? (
                  <Tooltip delayDuration={100}>
                    <TooltipTrigger asChild>
                      <Avatar className="h-9 w-9 border border-sidebar-border">
                        <AvatarImage src={profile?.avatar_url ?? undefined} />
                        <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                          {profile?.nome?.split(" ").map((n) => n[0]).slice(0, 2).join("") ?? "?"}
                        </AvatarFallback>
                      </Avatar>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="font-medium">
                      {profile?.nome ?? "Usuário"}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <>
                    <Avatar className="h-9 w-9 border border-sidebar-border">
                      <AvatarImage src={profile?.avatar_url ?? undefined} />
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                        {profile?.nome?.split(" ").map((n) => n[0]).slice(0, 2).join("") ?? "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-medium truncate text-sidebar-foreground">{profile?.nome ?? "Carregando..."}</p>
                      <p className="text-xs text-sidebar-foreground/70 truncate">{isGestor ? "Gestor" : "Usuário"}</p>
                    </div>
                    <ChevronDown className="w-4 h-4 text-sidebar-foreground/70" />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{profile?.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {isGestor && (
                <>
                  <DropdownMenuItem onClick={() => setPreviewOpen(true)}>
                    <Eye className="w-4 h-4 mr-2" />
                    Visualizar como…
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={() => signOut()}>
                <LogOut className="w-4 h-4 mr-2" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <VisualizarComoDialog open={previewOpen} onOpenChange={setPreviewOpen} />
      </div>
    </TooltipProvider>
  );
}

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return stored === "1";
    // Em telas < 1280px inicia recolhido por padrão
    return window.innerWidth < 1280;
  });
  const location = useLocation();
  const { tema, toggle } = useTheme();

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  const sidebarWidth = collapsed ? "w-[64px]" : "w-64";

  return (
    <div className="flex min-h-screen bg-muted/30">
      {/* Desktop sidebar */}
      <aside className={cn("hidden lg:block shrink-0 border-r border-sidebar-border transition-[width] duration-200", sidebarWidth)}>
        <div className={cn("fixed top-0 left-0 bottom-0 transition-[width] duration-200", sidebarWidth)}>
          <SidebarContent collapsed={collapsed} onToggleCollapsed={() => setCollapsed((v) => !v)} />
        </div>
      </aside>

      {/* Mobile sidebar (sempre expandido dentro do sheet) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-72 bg-sidebar border-sidebar-border">
          <SidebarContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex-1 flex flex-col min-w-0">
        <PreviewBanner />
        <header className="sticky top-0 z-30 h-16 border-b border-border bg-background/80 backdrop-blur-md flex items-center px-4 sm:px-6 gap-4">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)}>
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex-1 flex justify-center max-w-xl mx-auto">
            <GlobalSearch />
          </div>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2"
                  onClick={() => {
                    toast({ title: "Sincronizando acesso", description: "Recarregando dados de clientes e processos..." });
                    setTimeout(() => window.location.reload(), 300);
                  }}
                >
                  <RefreshCw className="w-4 h-4" />
                  <span className="hidden sm:inline">Sincronizar acesso</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Força a atualização dos dados após mudanças de responsável, vínculos ou permissões.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggle}
                  aria-label={tema === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
                >
                  {tema === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {tema === "dark" ? "Modo claro" : "Modo escuro"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <NotificacoesBadge />
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 relative isolate">
          <RouteErrorBoundary resetKey={location.pathname} modulo="app">
            <div key={location.pathname} className="animate-fade-in">
              <Outlet />
            </div>
          </RouteErrorBoundary>
        </main>
      </div>

      <AssistenteFlutuante />
    </div>
  );
}
