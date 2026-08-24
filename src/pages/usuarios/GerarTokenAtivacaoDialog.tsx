import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Copy, Loader2, KeyRound, Check } from "lucide-react";
import { UsuarioRow } from "./types";

interface Props {
  usuario: UsuarioRow | null;
  onOpenChange: (open: boolean) => void;
}

export function GerarTokenAtivacaoDialog({ usuario, onOpenChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [observacao, setObservacao] = useState("");
  const [codigo, setCodigo] = useState<string | null>(null);
  const [expira, setExpira] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const open = !!usuario;

  const reset = () => {
    setObservacao("");
    setCodigo(null);
    setExpira(null);
    setCopiado(false);
    setLoading(false);
  };

  const handleClose = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const gerar = async () => {
    if (!usuario) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("gerar_token_ativacao", {
      _user_id: usuario.id,
      _observacao: observacao || null,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    setCodigo(row?.codigo ?? null);
    setExpira(row?.expira_em ?? null);
    toast.success("Código gerado");
  };

  const copiar = async () => {
    if (!codigo) return;
    await navigator.clipboard.writeText(codigo);
    setCopiado(true);
    toast.success("Código copiado");
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5" /> Gerar token de ativação
          </DialogTitle>
          <DialogDescription>
            Gere um código de 6 dígitos para que <strong>{usuario?.nome}</strong> ative a própria
            conta na tela de "Conta inativa". Envie por WhatsApp, e-mail ou pessoalmente.
          </DialogDescription>
        </DialogHeader>

        {!codigo ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="obs">Observação (opcional)</Label>
              <Input
                id="obs"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex.: enviado por WhatsApp"
                maxLength={120}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              O código expira em 7 dias. Tokens anteriores não usados serão invalidados.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-6 text-center space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                Código de ativação
              </p>
              <p className="text-4xl font-mono font-bold tracking-[0.4em]">{codigo}</p>
              {expira && (
                <p className="text-xs text-muted-foreground">
                  Válido até {new Date(expira).toLocaleString("pt-BR")}
                </p>
              )}
            </div>
            <Button onClick={copiar} className="w-full" variant="outline">
              {copiado ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
              {copiado ? "Copiado!" : "Copiar código"}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Anote ou copie agora — por segurança, ele não será exibido novamente.
            </p>
          </div>
        )}

        <DialogFooter>
          {!codigo ? (
            <>
              <Button variant="outline" onClick={() => handleClose(false)} disabled={loading}>
                Cancelar
              </Button>
              <Button onClick={gerar} disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Gerar código
              </Button>
            </>
          ) : (
            <Button onClick={() => handleClose(false)} className="w-full">
              Concluir
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
