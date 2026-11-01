import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  ArrowLeft,
  LayoutGrid,
  MessageSquare,
  Users,
  ClipboardCheck,
  History,
  Activity,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import "./escritorio.css";
const SECOES = [
  {
    id: "planta",
    nome: "Escritório",
    icone: LayoutGrid,
    caminho: "/escritorio",
  },
  {
    id: "chat",
    nome: "Conversas",
    icone: MessageSquare,
    caminho: "/escritorio/chat",
  },
  { id: "equipe", nome: "Equipe", icone: Users, caminho: "/escritorio/equipe" },
  {
    id: "entregas",
    nome: "Entregas",
    icone: ClipboardCheck,
    caminho: "/escritorio/entregas",
  },
  {
    id: "historico",
    nome: "Histórico",
    icone: History,
    caminho: "/escritorio/historico",
  },
  {
    id: "operacao",
    nome: "Operação",
    icone: Activity,
    caminho: "/escritorio/operacao",
  },
] as const;
export type SecaoOffice = (typeof SECOES)[number]["id"];
export function secaoOffice(pathname: string): SecaoOffice {
  const id = pathname.split("/")[2] || "planta";
  return SECOES.some((s) => s.id === id) ? (id as SecaoOffice) : "planta";
}
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
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  const titulo = SECOES.find((s) => s.id === secao)!.nome;
  return (
    <div className="jas-office-shell">
      <header className="office-shell-header">
        <Link to="/" className="office-back" aria-label="Voltar ao sistema JAS">
          <ArrowLeft size={16} />
          <span>Voltar ao JAS</span>
        </Link>
        <div className="office-shell-brand">
          <img src="/logo-juliana-araujo.png" alt="Juliana Araújo Advocacia" />
          <div>
            <h1>Escritório virtual</h1>
            <p>
              {trabalhando} em execução <span>·</span> {pendentes} para revisão
            </p>
          </div>
        </div>
        <div className="office-shell-clock">
          <time>
            {agora.toLocaleTimeString("pt-BR", {
              timeZone: "America/Cuiaba",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
          <span>
            {agora.toLocaleDateString("pt-BR", {
              timeZone: "America/Cuiaba",
              day: "2-digit",
              month: "long",
            })}
          </span>
        </div>
        <div className="office-shell-actions">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Atualizar dados do escritório"
            onClick={recarregar}
            disabled={loading}
          >
            <RefreshCw size={15} />
          </Button>
          <Button
            size="sm"
            onClick={contratar}
            aria-label="Contratar agente"
            className="jas-office-top-button"
          >
            <Plus size={14} />
            <span>Contratar agente</span>
          </Button>
        </div>
      </header>
      <nav className="office-shell-nav" aria-label="Menu do escritório virtual">
        {SECOES.map((s) => (
          <NavLink
            key={s.id}
            to={s.caminho}
            end={s.id === "planta"}
            className={secao === s.id ? "office-nav-active" : ""}
            aria-current={secao === s.id ? "page" : undefined}
          >
            <s.icone size={15} />
            <span>{s.nome}</span>
            {s.id === "entregas" && pendentes > 0 && <b>{pendentes}</b>}
          </NavLink>
        ))}
      </nav>
      <main className="office-shell-main" data-view={secao} aria-label={titulo}>
        {secao !== "planta" && (
          <div className="office-section-heading">
            <p>JULIANA ARAÚJO · ESCRITÓRIO VIRTUAL</p>
            <h2>{titulo}</h2>
            <span>
              {secao === "chat"
                ? "Um canal para acompanhar e conversar com os agentes."
                : secao === "equipe"
                  ? "Pessoas virtuais, funções e rotinas do escritório."
                  : secao === "entregas"
                    ? "Resultados que precisam da sua decisão."
                    : secao === "historico"
                      ? "Execuções e passos registrados pelos agentes."
                      : "Saúde das rotinas e consumo de inteligência artificial."}
            </span>
          </div>
        )}
        {children}
      </main>
      <footer className="office-shell-status">
        <span>
          <i />
          {atualizadoEm
            ? `Última atualização ${new Date(atualizadoEm).toLocaleTimeString("pt-BR", { timeZone: "America/Cuiaba", hour: "2-digit", minute: "2-digit" })}`
            : "Consultando registros…"}
        </span>
        <span>Atividade baseada nas execuções reais · America/Cuiaba</span>
      </footer>
    </div>
  );
}
