// Layout do Portal do Cliente — sidebar simples + header + outlet
import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePreviewMode } from "@/contexts/PreviewModeContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/BrandLogo";
import { PreviewBanner } from "@/components/PreviewBanner";
import { cn } from "@/lib/utils";
import {
  Home, Briefcase, Folder, Wallet, MessageCircle, Bell, User, LogOut, Loader2, Info,
} from "lucide-react";

import { AvisoSincronizacao } from "./components/AvisoSincronizacao";

interface PortalClienteCtx {
  clienteId: string;
  clienteNome: string;
  mostrarFinanceiro: boolean;
  primeiroAcesso: boolean;
  vinculoId: string;
  liberadoEm: string | null;
}

export default function PortalClienteLayout() {
  const { user, signOut, isGestor } = useAuth();
  const { preview } = usePreviewMode();
  const navigate = useNavigate();
  const [ctx, setCtx] = useState<PortalClienteCtx | null>(null);
  const [loading, setLoading] = useState(true);

  const previewAtivo = isGestor && preview?.tipo === "cliente";
  const previewClienteId = previewAtivo ? preview!.id : null;

  useEffect(() => {
    if (!user) return;
    (async () => {
      // Modo preview do gestor: monta um contexto simulado a partir do cliente escolhido
      if (previewClienteId) {
        const { data } = await supabase
          .from("clientes")
          .select("id, nome")
          .eq("id", previewClienteId)
          .maybeSingle();
        if (data) {
          setCtx({
            clienteId: (data as any).id,
            clienteNome: (data as any).nome ?? "Cliente",
            mostrarFinanceiro: true,
            primeiroAcesso: false,
            vinculoId: "preview",
            liberadoEm: null,
          });
        }
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("cliente_usuarios")
        .select("id, cliente_id, mostrar_financeiro, primeiro_acesso, criado_em, clientes(nome)")
        .eq("user_id", user.id)
        .eq("ativo", true)
        .maybeSingle();
      if (data) {
        setCtx({
          clienteId: (data as any).cliente_id,
          clienteNome: (data as any).clientes?.nome ?? "Cliente",
          mostrarFinanceiro: (data as any).mostrar_financeiro,
          primeiroAcesso: (data as any).primeiro_acesso,
          vinculoId: (data as any).id,
          liberadoEm: (data as any).criado_em ?? null,
        });
        // marca último acesso
        await supabase
          .from("cliente_usuarios")
          .update({ ultimo_acesso: new Date().toISOString() })
          .eq("id", (data as any).id);

        const pathAtual = window.location.pathname;
        const naRaiz = pathAtual === "/portal-cliente" || pathAtual === "/portal-cliente/";

        // Primeiro acesso → tela de boas-vindas (apenas se entrar na raiz)
        if ((data as any).primeiro_acesso && naRaiz) {
          navigate("/portal-cliente/bem-vindo", { replace: true });
        } else if (!(data as any).primeiro_acesso && naRaiz) {
          // Após o onboarding inicial, mostra "Sobre o portal" 1x
          try {
            const visto = localStorage.getItem("portal-cliente:sobre-visto");
            if (!visto) {
              navigate("/portal-cliente/sobre", { replace: true });
            }
          } catch {}
        }
      }
      setLoading(false);
    })();
  }, [user, navigate, previewClienteId]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-gold" /></div>;
  }
  if (!ctx) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center max-w-md space-y-3">
          <h1 className="font-display text-2xl">Acesso não disponível</h1>
          <p className="text-sm text-muted-foreground">Seu acesso ao portal está suspenso ou ainda não foi ativado. Entre em contato com o escritório.</p>
          <Button variant="outline" onClick={() => signOut()}>Sair</Button>
        </div>
      </div>
    );
  }

  const itens = [
    { to: "/portal-cliente", label: "Início", icon: Home, end: true },
    { to: "/portal-cliente/processos", label: "Meus processos", icon: Briefcase },
    { to: "/portal-cliente/atualizacoes", label: "Atualizações", icon: Bell },
    { to: "/portal-cliente/documentos", label: "Documentos", icon: Folder },
    ...(ctx.mostrarFinanceiro
      ? [{ to: "/portal-cliente/financeiro", label: "Financeiro", icon: Wallet }]
      : []),
    { to: "/portal-cliente/mensagens", label: "Mensagens", icon: MessageCircle },
    { to: "/portal-cliente/perfil", label: "Perfil", icon: User },
    { to: "/portal-cliente/sobre", label: "Sobre o portal", icon: Info },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PreviewBanner />
      <div className="flex flex-1 min-h-0">
      {/* Sidebar */}
      <aside className="hidden md:flex md:flex-col w-64 border-r border-border/60 bg-card">
        <div className="p-6 border-b border-border/40">
          <BrandLogo variant="light" size="h-10" />
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {itens.map((it) => {
            const Icon = it.icon;
            return (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                    isActive
                      ? "bg-gold/10 text-gold-dark font-medium"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )
                }
              >
                <Icon className="w-4 h-4" /> {it.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="p-3 border-t border-border/40">
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => signOut()}>
            <LogOut className="w-4 h-4" /> Sair
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border/60 px-6 flex items-center justify-between bg-card/60">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Bem-vindo(a)</p>
            <p className="font-display text-lg leading-tight">{ctx.clienteNome}</p>
          </div>
          {/* mobile bottom nav substitui a sidebar */}
          <Button variant="ghost" size="sm" className="md:hidden" onClick={() => signOut()}>
            <LogOut className="w-4 h-4" />
          </Button>
        </header>

        <main className="flex-1 p-4 sm:p-6 overflow-auto">
          <AvisoSincronizacao liberadoEm={ctx.liberadoEm} />
          <Outlet context={ctx satisfies PortalClienteCtx} />
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden grid grid-cols-5 border-t border-border/60 bg-card">
          {itens.slice(0, 5).map((it) => {
            const Icon = it.icon;
            return (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.end}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center gap-1 py-2 text-[10px]",
                    isActive ? "text-gold-dark" : "text-muted-foreground",
                  )
                }
              >
                <Icon className="w-4 h-4" />
                {it.label.split(" ")[0]}
              </NavLink>
            );
          })}
        </nav>
      </div>
      </div>
    </div>
  );
}
