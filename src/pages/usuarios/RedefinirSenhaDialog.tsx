import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { UsuarioRow } from "./types";

interface Props {
  usuario: UsuarioRow | null;
  onOpenChange: (o: boolean) => void;
}

export function RedefinirSenhaDialog({ usuario, onOpenChange }: Props) {
  const [forcarTroca, setForcarTroca] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [senha, setSenha] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const close = (o: boolean) => {
    if (!o) { setSenha(null); setCopiado(false); setForcarTroca(true); }
    onOpenChange(o);
  };

  if (!usuario) return null;

  const submit = async () => {
    setSalvando(true);
    const { data, error } = await supabase.functions.invoke("admin-usuarios", {
      body: { action: "redefinir_senha", user_id: usuario.id, forcarTroca },
    });
    setSalvando(false);
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Erro");
      return;
    }
    setSenha(data.senha_temporaria);
    toast.success("Senha redefinida");
  };

  const copiar = async () => {
    if (!senha) return;
    await navigator.clipboard.writeText(senha);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <Dialog open={!!usuario} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Redefinir senha</DialogTitle>
          <DialogDescription>{usuario.nome} — {usuario.email}</DialogDescription>
        </DialogHeader>

        {senha ? (
          <div className="space-y-4">
            <div className="rounded-lg border-2 border-gold bg-gold/10 p-4">
              <p className="text-xs uppercase tracking-wider text-gold font-semibold mb-2">Nova senha temporária</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-lg bg-background rounded px-3 py-2 border">{senha}</code>
                <Button onClick={copiar} variant="outline" size="icon">
                  {copiado ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Esta senha não será mostrada novamente.</p>
            </div>
            <DialogFooter><Button onClick={() => close(false)}>Concluído</Button></DialogFooter>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="text-sm">Forçar troca no próximo login</Label>
                <p className="text-xs text-muted-foreground">O usuário será obrigado a definir uma nova senha.</p>
              </div>
              <Switch checked={forcarTroca} onCheckedChange={setForcarTroca} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)}>Cancelar</Button>
              <Button onClick={submit} disabled={salvando}>
                {salvando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Gerar nova senha
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
