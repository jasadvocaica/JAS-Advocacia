import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, ArrowLeft } from "lucide-react";

export default function EsqueciSenha() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await resetPassword(email);
    setLoading(false);
    if (error) toast.error(error);
    else {
      setEnviado(true);
      toast.success("E-mail enviado!");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="w-full max-w-md p-8 brand-shadow">
        <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-2 mb-6">
          <ArrowLeft className="w-4 h-4" /> Voltar para login
        </Link>
        <h2 className="text-3xl font-display mb-2">Recuperar senha</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Informe seu e-mail e enviaremos um link para redefinir sua senha.
        </p>
        {enviado ? (
          <div className="p-4 bg-success/10 text-success-foreground rounded-md border border-success/30">
            <p className="text-sm text-foreground">
              Se houver uma conta vinculada a <strong>{email}</strong>, você receberá um e-mail com instruções.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <Button type="submit" variant="gold" size="lg" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar link"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
