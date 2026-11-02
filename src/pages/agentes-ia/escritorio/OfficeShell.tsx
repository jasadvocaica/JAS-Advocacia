import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowLeft, CheckCheck, ChevronDown, LogOut, Moon, Plus, RefreshCw, Settings, Sun } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificacoesBadge } from "@/components/layout/NotificacoesBadge";
import { OFFICE_SECTIONS, OFFICE_TABS, abaAtiva, type SecaoOffice } from "./design/navigation";
import { useOfficeAppearance } from "./design/useOfficeAppearance";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "./escritorio.css";
import "./design/office-product.css";
import "./design/office-live.css";
import "./design/office-shell.css";
export { secaoOffice } from "./design/navigation";

const SUBTITULO: Partial<Record<SecaoOffice, string>> = {
  agentes: "Cada agente com identidade, instruções, ferramentas, histórico e consumo.",
  configurar: "Papel, instruções e fontes do agente. Salvo aqui, vale nas próximas execuções.",
  missoes: "Missões que os agentes executam, do pedido à entrega aprovada.",
  gestora: "Manu, a Gestora Geral: pedidos para aprovar, orçamento de IA e o motor.",
  chat: "Conversas e registros reais dos agentes.",
  comando: "Da sua solicitação ao resultado. Tudo acompanhado, em um só lugar.",
  operacao: "Saúde das rotinas, conexão da VPS e consumo de inteligência artificial.",
  historico: "Execuções e passos registrados pelos agentes.",
  entregas: "Resultados que precisam da sua decisão.",
};

/**
 * Moldura do Escritório Virtual: barra superior enxuta (sem menu lateral) com as áreas do escritório.
 * Os demais módulos ficam no JAS. No modo imersivo a moldura some e o escritório ocupa a tela toda.
 */
export default function OfficeShell({
  secao,
  children,
  contratar,
  recarregar,
  loading,
  pendentes,
  trabalhando,
  atualizadoEm,
  imersivo = false,
}: {
  secao: SecaoOffice;
  children: ReactNode;
  contratar: () => void;
  recarregar: () => void;
  loading: boolean;
  pendentes: number;
  trabalhando: number;
  atualizadoEm: string | null;
  imersivo?: boolean;
}) {
  const { profile, signOut } = useAuth();
  const { theme, toggleTheme, reduceMotion, setReduceMotion } = useOfficeAppearance();
  const nome = profile?.nome ?? "Minha conta";
  const iniciais = nome.split(" ").filter(Boolean).slice(0, 2).map((n) => n[0]).join("");
  const ativa = abaAtiva(secao);
  const cena = secao === "escritorio";

  return (
    <div className="office-product os-shell" data-imersivo={imersivo} data-cena={cena}>
      <a className="op-skip-link" href="#office-content">Pular para o conteúdo</a>
      {!imersivo && (
        <header className="os-topo">
          <Link to="/" className="os-voltar" aria-label="Voltar ao sistema JAS" title="Voltar ao JAS">
            <ArrowLeft size={16} />
            <img src="/escritorio-isometrico/assets/logo.webp" alt="" className="os-logo" />
          </Link>
          <nav className="os-abas" aria-label="Áreas do escritório">
            {OFFICE_TABS.map(({ label, to, section, icon: Icone }) => (
              <Link key={section} to={to} className="os-aba"
                aria-current={ativa === section ? "page" : undefined} data-ativa={ativa === section}>
                <Icone size={15} aria-hidden />
                <span>{label}</span>
              </Link>
            ))}
          </nav>
          <div className="os-controles">
            <button type="button" className="os-criar" onClick={contratar}>
              <Plus size={15} /> <span>Criar agente</span>
            </button>
            <Link to="/escritorio/historico" className="os-pilula" title="Execuções em andamento registradas no sistema"
              aria-label={`${trabalhando} execuções em andamento`}>
              <Activity size={14} /> {trabalhando} em execução
            </Link>
            <Link to="/escritorio/gestora" className="os-icone" title="Pedidos e entregas para aprovar"
              aria-label={`${pendentes} resultados para revisar`}>
              <CheckCheck size={17} />
              {pendentes > 0 && <b>{pendentes}</b>}
            </Link>
            <NotificacoesBadge />
            <button className="os-icone" aria-label={theme === "light" ? "Usar tema escuro" : "Usar tema claro"} onClick={toggleTheme}>
              {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger className="os-conta" aria-label="Abrir perfil e preferências">
                <span className="os-avatar">{profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : iniciais}</span>
                <ChevronDown size={12} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="op-profile-menu">
                <DropdownMenuLabel>{nome}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem checked={reduceMotion} onCheckedChange={setReduceMotion}>Reduzir animações</DropdownMenuCheckboxItem>
                <DropdownMenuItem asChild>
                  <Link to="/configuracoes/escritorio"><Settings size={15} className="mr-2" />Configurações do escritório</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void signOut()}><LogOut size={15} className="mr-2" />Sair da conta</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
      )}
      <main id="office-content" className="os-conteudo" data-view={secao} aria-label={OFFICE_SECTIONS[secao]} tabIndex={-1}>
        {!cena && (
          <div className="os-cabecalho">
            <div>
              <h1>{OFFICE_SECTIONS[secao]}</h1>
              {SUBTITULO[secao] && <p>{SUBTITULO[secao]}</p>}
            </div>
            <div className="os-cabecalho-acoes">
              {ativa === "agentes" && (
                <Button size="sm" onClick={contratar}><Plus size={14} /> Contratar agente</Button>
              )}
              <Button variant="outline" size="sm" onClick={recarregar} disabled={loading}>
                <RefreshCw size={14} /> Atualizar
              </Button>
            </div>
          </div>
        )}
        {children}
        {!cena && atualizadoEm && (
          <p className="os-rodape">
            Atualizado às {new Date(atualizadoEm).toLocaleTimeString("pt-BR", { timeZone: "America/Cuiaba", hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </main>
    </div>
  );
}
