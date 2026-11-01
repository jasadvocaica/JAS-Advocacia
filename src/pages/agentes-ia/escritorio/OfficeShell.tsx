import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  CheckCheck,
  ChevronDown,
  Menu,
  Moon,
  RefreshCw,
  Settings,
  Sun,
  Terminal,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { GlobalSearch } from "@/components/layout/GlobalSearch";
import { NotificacoesBadge } from "@/components/layout/NotificacoesBadge";
import OfficeSidebar from "./design/OfficeSidebar";
import { OFFICE_SECTIONS, type SecaoOffice } from "./design/navigation";
import {
  readPreference,
  savePreference,
  useOfficeAppearance,
} from "./design/useOfficeAppearance";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "./escritorio.css";
import "./design/office-product.css";
export { secaoOffice } from "./design/navigation";
export default function OfficeShell({
  secao,
  children,
  contratar,
  recarregar,
  loading,
  pendentes,
  trabalhando,
  atualizadoEm,
}: {
  secao: SecaoOffice;
  children: ReactNode;
  contratar: () => void;
  recarregar: () => void;
  loading: boolean;
  pendentes: number;
  trabalhando: number;
  atualizadoEm: string | null;
}) {
  const { profile, signOut } = useAuth();
  const { theme, toggleTheme, reduceMotion, setReduceMotion } =
    useOfficeAppearance();
  const [collapsed, setCollapsed] = useState(
    () => readPreference("jas-office-sidebar", "expanded") === "collapsed",
  );
  const [mobile, setMobile] = useState(false);
  const toggle = () =>
    setCollapsed((v) => {
      savePreference("jas-office-sidebar", v ? "expanded" : "collapsed");
      return !v;
    });
  const nome = profile?.nome ?? "Minha conta";
  const iniciais = nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("");
  return (
    <div className="office-product" data-sidebar-collapsed={collapsed}>
      <a className="op-skip-link" href="#office-content">
        Pular para o conteúdo
      </a>
      <aside className="op-desktop-sidebar">
        <OfficeSidebar
          secao={secao}
          collapsed={collapsed}
          toggle={toggle}
          contratar={contratar}
        />
      </aside>
      <Sheet open={mobile} onOpenChange={setMobile}>
        <SheetContent side="left" className="op-mobile-sidebar">
          <SheetTitle className="sr-only">Navegação do escritório</SheetTitle>
          <SheetDescription className="sr-only">
            Módulos e ferramentas do escritório inteligente.
          </SheetDescription>
          <OfficeSidebar
            secao={secao}
            collapsed={false}
            toggle={() => setMobile(false)}
            contratar={contratar}
            onNavigate={() => setMobile(false)}
          />
        </SheetContent>
      </Sheet>
      <div className="op-workspace">
        <header className="op-topbar">
          <button
            className="op-icon-button op-mobile-menu"
            aria-label="Abrir menu do escritório"
            onClick={() => setMobile(true)}
          >
            <Menu size={20} />
          </button>
          <div className="op-breadcrumb">
            <span>Escritório Inteligente</span>
            <i>/</i>
            <strong>{OFFICE_SECTIONS[secao]}</strong>
          </div>
          <div className="op-global-search">
            <GlobalSearch label="Buscar no escritório…" />
          </div>
          <div className="op-topbar-controls">
            <Link
              to="/escritorio"
              className="op-icon-button op-command-shortcut"
              aria-label="Abrir Central de Comando"
              title="Central de Comando"
            >
              <Terminal size={17} />
            </Link>
            <Link
              to="/escritorio/historico"
              className="op-running"
              aria-label={`${trabalhando} execuções em andamento`}
              title="Execuções em andamento registradas no sistema"
            >
              <Activity size={14} />
              <span>{trabalhando} em execução</span>
            </Link>
            <Link
              to="/escritorio/entregas"
              className="op-icon-button op-approvals"
              aria-label={`${pendentes} resultados para revisar`}
              title="Entregas para revisão"
            >
              <CheckCheck size={18} />
              {pendentes > 0 && <b>{pendentes}</b>}
            </Link>
            <NotificacoesBadge />
            <button
              className="op-icon-button"
              aria-label={
                theme === "light" ? "Usar tema escuro" : "Usar tema claro"
              }
              onClick={toggleTheme}
            >
              {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger
                className="op-account"
                aria-label="Abrir perfil e preferências"
              >
                <span className="op-account-avatar">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" />
                  ) : (
                    iniciais
                  )}
                </span>
                <span className="op-account-name">
                  <strong>{nome.split(" ")[0]}</strong>
                  <small>Minha conta</small>
                </span>
                <ChevronDown size={12} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="op-profile-menu">
                <DropdownMenuLabel>{nome}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={reduceMotion}
                  onCheckedChange={setReduceMotion}
                >
                  Reduzir animações
                </DropdownMenuCheckboxItem>
                <DropdownMenuItem asChild>
                  <Link to="/configuracoes/escritorio">
                    <Settings size={15} className="mr-2" />
                    Configurações do escritório
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void signOut()}>
                  <LogOut size={15} className="mr-2" />
                  Sair da conta
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main
          id="office-content"
          className="office-shell-main"
          data-view={secao}
          aria-label={OFFICE_SECTIONS[secao]}
          tabIndex={-1}
        >
          {secao !== "planta" && (
            <div className="op-page-heading">
              <div>
                <p>ESCRITÓRIO INTELIGENTE</p>
                <h1>{OFFICE_SECTIONS[secao]}</h1>
                <span>
                  {secao === "configurar" ? "Configure papel, instruções e fontes do seu agente." : secao === "comando"
                    ? "Da sua solicitação ao resultado. Tudo acompanhado, em um só lugar."
                    : secao === "chat"
                      ? "Acompanhe as rotinas e converse com seus analistas."
                      : secao === "equipe"
                        ? "Pessoas virtuais, funções e rotinas do escritório."
                        : secao === "entregas"
                          ? "Resultados que precisam da sua decisão."
                          : secao === "historico"
                            ? "Execuções e passos registrados pelos agentes."
                            : "Saúde das rotinas e consumo de inteligência artificial."}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={recarregar}
                disabled={loading}
                className="op-refresh"
              >
                <RefreshCw size={14} />
                <span>Atualizar</span>
              </Button>
            </div>
          )}
          {children}
        </main>
        <footer className="op-workspace-status">
          <span>
            <i />
            {atualizadoEm
              ? `Atualizado às ${new Date(atualizadoEm).toLocaleTimeString("pt-BR", { timeZone: "America/Cuiaba", hour: "2-digit", minute: "2-digit" })}`
              : "Consultando registros…"}
          </span>
          <span>
            Juliana Araújo Advocacia <b>·</b> America/Cuiaba
          </span>
        </footer>
      </div>
    </div>
  );
}
