// Tela "Sobre o portal" do Cliente — estilo do parceiro: explica o que ele vê e o que NÃO vê.
// Abre automaticamente 1x após o onboarding (controlado via localStorage) e fica acessível pelo menu.
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Briefcase, MessageSquare, Folder, Bell, Wallet,
  Eye, EyeOff, ShieldCheck, ArrowRight, Sparkles,
} from "lucide-react";
import { usePortalCliente } from "../usePortalCliente";

const PODE_VER = [
  {
    icon: Briefcase,
    titulo: "Seus processos",
    descricao: "Acompanhe os processos em que você é parte, com informações organizadas em linguagem clara.",
  },
  {
    icon: Bell,
    titulo: "Atualizações do seu caso",
    descricao: "Receba notícias importantes do seu processo de forma simples, escritas pela equipe pensando em você.",
  },
  {
    icon: Folder,
    titulo: "Seus documentos",
    descricao: "Procurações, contratos e peças disponibilizados pelo escritório ficam aqui, prontos para download.",
  },
  {
    icon: Wallet,
    titulo: "Financeiro do seu contrato",
    descricao: "Quando aplicável ao seu caso, acompanhe contratos, parcelas e pagamentos.",
  },
  {
    icon: MessageSquare,
    titulo: "Mensagens com o escritório",
    descricao: "Use o chat para tirar dúvidas. As conversas ficam registradas para histórico.",
  },
];

const NAO_VE = [
  "Outros clientes ou processos do escritório",
  "Estratégias internas e anotações da equipe",
  "Documentos e valores de terceiros",
];

export default function SobrePortalCliente() {
  const { clienteNome } = usePortalCliente();
  const navigate = useNavigate();

  const continuar = () => {
    try { localStorage.setItem(`portal-cliente:sobre-visto`, "1"); } catch {}
    navigate("/portal-cliente", { replace: true });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Bem-vindo(a)</p>
        <h1 className="font-display text-3xl">{clienteNome.split(" ")[0]}, este é o seu portal.</h1>
        <p className="text-muted-foreground mt-1">
          Um resumo rápido do que você encontra aqui — para acompanhar seu caso com clareza, sem ruídos.
        </p>
      </div>

      {/* Hero */}
      <Card className="p-6 bg-gradient-to-br from-sidebar to-sidebar/80 text-sidebar-foreground border-gold/30">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-gold/20 flex items-center justify-center shrink-0">
            <Sparkles className="w-6 h-6 text-gold" />
          </div>
          <div className="space-y-2">
            <Badge className="bg-gold text-sidebar-primary-foreground">Espaço exclusivo</Badge>
            <h2 className="font-display text-2xl">Acompanhe seu caso com clareza.</h2>
            <p className="text-sm text-sidebar-foreground/80 max-w-2xl">
              As informações deste portal são apresentadas em linguagem simples, sempre que possível,
              para que você entenda cada etapa do seu caso sem ruídos.
            </p>
          </div>
        </div>
      </Card>

      {/* O que você vê */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-gold" />
          <h3 className="font-display text-lg">O que você encontra aqui</h3>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {PODE_VER.map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.titulo} className="p-4 hover:border-gold/40 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-md bg-gold/10 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-gold" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{item.titulo}</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.descricao}</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* O que NÃO vê */}
      <Card className="p-5 border-dashed">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center shrink-0">
            <EyeOff className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">O que não aparece aqui</p>
            <p className="text-xs text-muted-foreground mt-1">
              Para preservar o sigilo profissional e manter seu portal focado no seu caso, não são exibidos:
            </p>
            <ul className="mt-3 grid sm:grid-cols-2 gap-x-4 gap-y-1.5">
              {NAO_VE.map((t) => (
                <li key={t} className="text-xs text-muted-foreground flex items-start gap-2">
                  <span className="mt-1 w-1 h-1 rounded-full bg-muted-foreground/60 shrink-0" />
                  {t}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground mt-3">
              Se ficar com dúvida sobre algo do seu caso, fale com a equipe pela aba <strong>Mensagens</strong>.
            </p>
          </div>
        </div>
      </Card>

      {/* Privacidade */}
      <Card className="p-4 bg-primary/5 border-primary/20">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium">Seus dados estão protegidos</p>
            <p className="text-xs text-muted-foreground mt-1">
              O acesso é pessoal e intransferível. Recomendamos manter sua senha em segredo e trocá-la
              periodicamente em <strong>Perfil → Trocar senha</strong>.
            </p>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-3 justify-end pt-2">
        <Button variant="outline" onClick={() => navigate("/portal-cliente/perfil")}>
          Ver meu perfil
        </Button>
        <Button onClick={continuar} variant="gold">
          Ir para o meu painel
          <ArrowRight className="w-4 h-4 ml-1.5" />
        </Button>
      </div>
    </div>
  );
}
