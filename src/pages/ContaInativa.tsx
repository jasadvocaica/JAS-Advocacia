import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ShieldOff, LogOut, KeyRound, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

type Estado =
  | { tipo: "form" }
  | { tipo: "sucesso" }
  | { tipo: "erro"; mensagem: string };

export default function ContaInativa() {
  const { signOut, profile, refresh } = useAuth();
  const navigate = useNavigate();
  const [codigo, setCodigo] = useState("");
  const [loading, setLoading] = useState(false);
  const [estado, setEstado] = useState<Estado>({ tipo: "form" });

  const onlyDigits = (s: string) => s.replace(/\D/g, "").slice(0, 6);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const codigoLimpo = onlyDigits(codigo);
    if (codigoLimpo.length !== 6) {
      setEstado({ tipo: "erro", mensagem: "Digite o código de 6 dígitos." });
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc("confirmar_ativacao_conta", {
      _codigo: codigoLimpo,
    });
    setLoading(false);
    if (error) {
      const msg = error.message?.includes("expirado")
        ? "Código expirado. Solicite um novo ao Gestor."
        : error.message?.includes("inválido")
        ? "Código inválido. Verifique os dígitos e tente novamente."
        : error.message ?? "Não foi possível ativar a conta.";
      setEstado({ tipo: "erro", mensagem: msg });
      return;
    }
    setEstado({ tipo: "sucesso" });
    toast.success("Conta ativada com sucesso!");
    // Recarrega o perfil e redireciona
    await refresh();
    setTimeout(() => navigate("/", { replace: true }), 1200);
    // garante reload caso o ProtectedRoute não recalcule a tempo
    setTimeout(() => {
      if (window.location.pathname === "/conta-inativa") {
        window.location.replace("/");
      }
    }, 2000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-warning/10 flex items-center justify-center">
            <ShieldOff className="w-8 h-8 text-warning" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-display">Conta aguardando ativação</h1>
            <p className="text-muted-foreground">
              Olá {profile?.nome}, sua conta foi criada mas ainda não foi ativada pelo Gestor do
              escritório. Se você já recebeu um <strong>código de ativação</strong>, informe abaixo
              para liberar seu acesso.
            </p>
          </div>
        </div>

        {estado.tipo === "sucesso" ? (
          <div className="rounded-lg border border-success/30 bg-success/10 p-6 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-success mx-auto" />
            <div>
              <p className="font-semibold text-success">Conta ativada!</p>
              <p className="text-sm text-muted-foreground mt-1">
                Você será redirecionado em instantes…
              </p>
            </div>
            <Loader2 className="w-4 h-4 animate-spin mx-auto text-muted-foreground" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border bg-card p-6">
            <div className="space-y-2">
              <Label htmlFor="codigo" className="flex items-center gap-2">
                <KeyRound className="w-4 h-4" /> Código de ativação
              </Label>
              <Input
                id="codigo"
                value={codigo}
                onChange={(e) => {
                  setCodigo(onlyDigits(e.target.value));
                  if (estado.tipo === "erro") setEstado({ tipo: "form" });
                }}
                placeholder="000000"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="text-center text-2xl font-mono tracking-[0.4em] h-14"
                disabled={loading}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                6 dígitos fornecidos pelo Gestor do escritório.
              </p>
            </div>

            {estado.tipo === "erro" && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{estado.mensagem}</span>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading || codigo.length !== 6}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Ativar conta
            </Button>
          </form>
        )}

        <div className="text-center">
          <Button variant="ghost" onClick={signOut} size="sm">
            <LogOut className="w-4 h-4 mr-2" /> Sair
          </Button>
        </div>
      </div>
    </div>
  );
}
