import { useEffect, useRef } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useUserPortais, PortalInfo } from "@/hooks/useUserPortais";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Briefcase, Users, Building2, LogOut, ChevronRight } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { registrarEventoLogin } from "@/lib/auth-audit";

const ICONES: Record<PortalInfo["tipo"], typeof Building2> = {
  interno: Building2,
  parceiro: Briefcase,
  cliente: Users,
};

export default function SelecionarPortal() {
  const { user, signOut, loading: authLoading } = useAuth();
  const { portais, motivo, loading } = useUserPortais();
  const navigate = useNavigate();
  const eventoRegistradoRef = useRef(false);

  // Registra evento de auditoria assim que detectarmos o resultado da seleção
  useEffect(() => {
    if (authLoading || loading || !user || eventoRegistradoRef.current) return;
    eventoRegistradoRef.current = true;

    if (portais.length === 0) {
      void registrarEventoLogin({
        evento: "sem_vinculo",
        email: user.email ?? null,
        userId: user.id,
        motivo: motivo || "nenhum vínculo detectado para o e-mail",
      });
    } else if (portais.length === 1) {
      void registrarEventoLogin({
        evento: "redirect_portal",
        email: user.email ?? null,
        userId: user.id,
        portal: portais[0].tipo,
        rotaDestino: portais[0].rota,
        motivo: motivo || "redirecionamento automático (vínculo único)",
      });
    } else {
      void registrarEventoLogin({
        evento: "redirect_portal",
        email: user.email ?? null,
        userId: user.id,
        portal: "auto",
        motivo: motivo || "múltiplos vínculos — exibida tela de escolha",
        contexto: { vinculos: portais.map((p) => p.tipo) },
      });
    }
  }, [authLoading, loading, user, portais, motivo]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-gold" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Sem vínculos detectados: oferece tentativa manual em vez de redirecionar direto
  const semVinculos = portais.length === 0;

  // Único vínculo: redireciona direto
  if (portais.length === 1) {
    return <Navigate to={portais[0].rota} replace />;
  }

  // Lista para exibir: detectados OU todas as opções (se nenhum detectado)
  const opcoes: PortalInfo[] = semVinculos
    ? [
        { tipo: "interno", nome: "Sistema interno", descricao: "Equipe do escritório", rota: "/" },
        { tipo: "parceiro", nome: "Portal do Parceiro", descricao: "Acesso de advogados parceiros", rota: "/portal-parceiro" },
        { tipo: "cliente", nome: "Portal do Cliente", descricao: "Acompanhamento de processos", rota: "/portal-cliente" },
      ]
    : portais;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center space-y-3">
          <BrandLogo variant="light" size="h-20" className="justify-center" />
          <h1 className="text-3xl font-display">
            {semVinculos ? "Como você quer entrar?" : "Onde você quer entrar?"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {semVinculos
              ? "Não conseguimos identificar automaticamente seu tipo de acesso. Escolha abaixo para tentar manualmente."
              : "Sua conta tem acesso a mais de uma área. Escolha como deseja continuar."}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {opcoes.map((p) => {
            const Icon = ICONES[p.tipo];
            return (
              <Card
                key={p.tipo}
                onClick={() => {
                  void registrarEventoLogin({
                    evento: "escolha_manual",
                    email: user.email ?? null,
                    userId: user.id,
                    portal: p.tipo,
                    rotaDestino: p.rota,
                    motivo: semVinculos
                      ? "tentativa manual sem vínculo detectado"
                      : "escolha entre múltiplos vínculos",
                  });
                  navigate(p.rota, { replace: true });
                }}
                className="p-6 cursor-pointer hover:border-gold hover:shadow-lg transition-all group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-gold/10 text-gold flex items-center justify-center shrink-0 group-hover:bg-gold group-hover:text-sidebar transition-colors">
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display text-lg leading-tight">{p.nome}</h3>
                    <p className="text-sm text-muted-foreground truncate mt-1">{p.descricao}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-gold group-hover:translate-x-1 transition-all shrink-0" />
                </div>
              </Card>
            );
          })}
        </div>

        <div className="text-center">
          <Button variant="ghost" size="sm" onClick={() => signOut()}>
            <LogOut className="w-4 h-4 mr-2" /> Sair
          </Button>
        </div>
      </div>
    </div>
  );
}
