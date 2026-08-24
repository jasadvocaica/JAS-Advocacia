import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import {
  Building2,
  Users,
  Globe,
  Briefcase,
  ClipboardCheck,
  DollarSign,
  FileText,
  Plug,
  Settings as SettingsIcon,
  Info,
  Sparkles,
  Mail,
  ShieldAlert,
  BookMarked,

} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

interface SecaoNav {
  to: string;
  label: string;
  icon: typeof Building2;
  descricao: string;
}

const SECOES: SecaoNav[] = [
  { to: "/configuracoes/escritorio", label: "Escritório", icon: Building2, descricao: "Dados, logo e assinatura" },
  { to: "/configuracoes/usuarios", label: "Usuários", icon: Users, descricao: "Equipe interna e permissões" },
  { to: "/configuracoes/portais", label: "Portais", icon: Globe, descricao: "Parceiros e clientes" },
  { to: "/configuracoes/processos", label: "Processos", icon: Briefcase, descricao: "Status, áreas e tipos de ação" },
  { to: "/configuracoes/catalogo", label: "Catálogo de Serviços", icon: BookMarked, descricao: "Serviços, triagem e documentos" },

  { to: "/configuracoes/controladoria", label: "Controladoria", icon: ClipboardCheck, descricao: "Prazos, feriados, alertas" },
  { to: "/configuracoes/financeiro", label: "Financeiro", icon: DollarSign, descricao: "Inadimplência, índices, banco" },
  { to: "/configuracoes/documentos", label: "Documentos", icon: FileText, descricao: "Formatação e categorias" },
  { to: "/configuracoes/integracoes", label: "Integrações", icon: Plug, descricao: "Calendar, DataJud, e-mail" },
  { to: "/configuracoes/email", label: "Email (Resend)", icon: Mail, descricao: "Chave do Resend, remetente e log" },
  { to: "/configuracoes/bia", label: "Bia (IA)", icon: Sparkles, descricao: "Autonomia e estilo da assistente" },
  { to: "/configuracoes/sistema", label: "Sistema", icon: SettingsIcon, descricao: "Fuso, notificações, sobre" },
  { to: "/configuracoes/seguranca", label: "Segurança", icon: ShieldAlert, descricao: "Monitoramento e alertas" },
];

/**
 * Layout do módulo Configurações.
 * Sidebar lateral com seções + Outlet para o conteúdo.
 * Acesso restrito a gestores.
 */
export default function ConfiguracoesLayout() {
  const { isGestor, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="p-6 text-muted-foreground">Carregando…</div>;
  }
  if (!isGestor) {
    return <Navigate to="/sem-permissao" replace />;
  }

  // Redireciona /configuracoes (sem subseção) para a primeira seção
  if (location.pathname === "/configuracoes" || location.pathname === "/configuracoes/") {
    return <Navigate to="/configuracoes/escritorio" replace />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Central de configurações do sistema · acesso exclusivo de gestores
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        {/* Sidebar das seções */}
        <Card className="p-2 h-fit lg:sticky lg:top-20">
          <nav className="space-y-0.5">
            {SECOES.map((s) => {
              const Icon = s.icon;
              const ativa = location.pathname.startsWith(s.to);
              return (
                <NavLink
                  key={s.to}
                  to={s.to}
                  className={cn(
                    "flex items-start gap-3 px-3 py-2.5 rounded-md text-sm transition-colors",
                    ativa
                      ? "bg-primary/10 text-primary border-l-2 border-gold"
                      : "text-foreground/80 hover:bg-muted",
                  )}
                >
                  <Icon className="w-4 h-4 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium">{s.label}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{s.descricao}</div>
                  </div>
                </NavLink>
              );
            })}
          </nav>
        </Card>

        {/* Conteúdo da seção */}
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
