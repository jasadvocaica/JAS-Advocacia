// Tela de boas-vindas no primeiro acesso ao Portal do Cliente.
// Apresenta um tutorial rápido em etapas. NÃO força troca de senha —
// o cliente pode trocar quando quiser em "Trocar senha".
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Loader2, Sparkles, Briefcase, Folder, Wallet, MessageCircle, Bell, ArrowRight, ArrowLeft, CheckCircle2, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { usePortalCliente } from "../usePortalCliente";
import { BrandLogo } from "@/components/BrandLogo";

interface Etapa {
  icon: any;
  titulo: string;
  descricao: string;
}

export default function BemVindoCliente() {
  const { vinculoId, primeiroAcesso, clienteNome, mostrarFinanceiro } = usePortalCliente();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  const etapas: Etapa[] = [
    {
      icon: Briefcase,
      titulo: "Acompanhe seus processos",
      descricao: "Veja em tempo real o andamento de cada processo, partes envolvidas, prazos e o histórico completo de movimentações.",
    },
    {
      icon: Bell,
      titulo: "Receba atualizações",
      descricao: "Toda vez que houver uma novidade relevante no seu caso, você verá um aviso aqui no portal.",
    },
    {
      icon: Folder,
      titulo: "Documentos sempre à mão",
      descricao: "Procurações, contratos, petições e documentos importantes ficam organizados e disponíveis para download.",
    },
    ...(mostrarFinanceiro
      ? [{
          icon: Wallet,
          titulo: "Financeiro transparente",
          descricao: "Consulte boletos, parcelas pagas, em aberto e o histórico financeiro do seu contrato.",
        }]
      : []),
    {
      icon: MessageCircle,
      titulo: "Fale com o escritório",
      descricao: "Use a aba Mensagens para tirar dúvidas diretamente com a equipe responsável pelo seu atendimento.",
    },
  ];

  const totalSteps = etapas.length;
  const progresso = ((step + 1) / totalSteps) * 100;
  const ehUltimo = step === etapas.length - 1;

  const concluir = async () => {
    setLoading(true);
    if (primeiroAcesso && vinculoId) {
      await supabase.from("cliente_usuarios").update({ primeiro_acesso: false }).eq("id", vinculoId);
    }
    setLoading(false);
    toast.success("Tudo pronto! Bem-vindo(a) ao portal.");
    navigate("/portal-cliente", { replace: true });
    window.location.reload();
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center -m-4 sm:-m-6 p-4 sm:p-6 bg-gradient-to-br from-background via-background to-gold/5">
      <Card className="w-full max-w-2xl p-6 sm:p-10 space-y-6 shadow-xl border-border/60">
        <div className="flex items-center justify-between">
          <BrandLogo variant="light" size="h-9" />
          <span className="text-xs text-muted-foreground">Etapa {step + 1} de {totalSteps}</span>
        </div>
        <Progress value={progresso} className="h-1.5" />

        <div className="rounded-xl border border-gold/30 bg-gold/5 p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-gold/15 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-gold-dark" />
          </div>
          <div className="text-sm leading-relaxed">
            <p className="font-medium text-foreground">Seu acesso ao portal foi liberado ✅</p>
            <p className="text-muted-foreground mt-0.5">
              Em até <strong>48 horas</strong> nossas informações terminam de sincronizar e seus processos, documentos e atualizações começam a aparecer aqui. Se algo ainda estiver em branco depois desse prazo, fale com a equipe pela aba <strong>Mensagens</strong>.
            </p>
          </div>
        </div>


        <div className="space-y-6 text-center sm:text-left">
          {step === 0 && (
            <div className="flex items-center gap-3 justify-center sm:justify-start">
              <div className="w-12 h-12 rounded-full bg-gold/10 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-gold-dark" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Olá,</p>
                <h1 className="font-display text-2xl sm:text-3xl">{clienteNome}</h1>
              </div>
            </div>
          )}

          {(() => {
            const e = etapas[step];
            const Icon = e.icon;
            return (
              <div className="space-y-4 py-4">
                <div className="w-16 h-16 rounded-2xl bg-gold/10 flex items-center justify-center mx-auto sm:mx-0">
                  <Icon className="w-8 h-8 text-gold-dark" />
                </div>
                <h2 className="font-display text-2xl">{e.titulo}</h2>
                <p className="text-muted-foreground leading-relaxed">{e.descricao}</p>
              </div>
            );
          })()}
        </div>

        <div className="flex items-center justify-between pt-2 gap-3">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || loading}
          >
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Button>

          {!ehUltimo ? (
            <Button variant="gold" onClick={() => setStep((s) => s + 1)}>
              Próximo <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button variant="gold" onClick={concluir} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Entrar no portal <CheckCircle2 className="w-4 h-4" /></>}
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center pt-2">
          Você pode trocar sua senha quando quiser em <strong>Trocar senha</strong>.
        </p>
      </Card>
    </div>
  );
}
