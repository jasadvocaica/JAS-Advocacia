import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { usePortalCliente } from "../usePortalCliente";

export default function TrocarSenhaCliente() {
  const { vinculoId, primeiroAcesso } = usePortalCliente();
  const navigate = useNavigate();
  const [s1, setS1] = useState("");
  const [s2, setS2] = useState("");
  const [loading, setLoading] = useState(false);

  const trocar = async () => {
    if (s1.length < 6) { toast.error("A nova senha deve ter ao menos 6 caracteres"); return; }
    if (s1 !== s2) { toast.error("As senhas não conferem"); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: s1 });
    if (error) { toast.error(error.message); setLoading(false); return; }
    if (primeiroAcesso) {
      await supabase.from("cliente_usuarios").update({ primeiro_acesso: false }).eq("id", vinculoId);
    }
    setLoading(false);
    toast.success("Senha alterada!");
    navigate("/portal-cliente", { replace: true });
    // força recarregar contexto
    window.location.reload();
  };

  return (
    <div className="max-w-md mx-auto pt-8">
      <Card className="p-6 space-y-4">
        <div>
          <h1 className="font-display text-2xl flex items-center gap-2"><KeyRound className="w-5 h-5" /> {primeiroAcesso ? "Crie sua nova senha" : "Alterar senha"}</h1>
          {primeiroAcesso && <p className="text-sm text-muted-foreground mt-1">Por segurança, defina uma senha pessoal antes de continuar.</p>}
        </div>
        <div><Label>Nova senha</Label><Input type="password" value={s1} onChange={e => setS1(e.target.value)} autoFocus /></div>
        <div><Label>Confirmar nova senha</Label><Input type="password" value={s2} onChange={e => setS2(e.target.value)} /></div>
        <Button variant="gold" className="w-full" onClick={trocar} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar nova senha"}
        </Button>
      </Card>
    </div>
  );
}
