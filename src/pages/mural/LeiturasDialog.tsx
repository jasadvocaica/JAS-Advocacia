import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Check, X } from "lucide-react";
import type { MuralAviso } from "@/hooks/useMuralAvisos";

interface Props {
  aviso: MuralAviso | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

interface Pessoa { user_id: string; nome: string }

function iniciais(nome: string): string {
  return nome.split(" ").map((n) => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

export function LeiturasDialog({ aviso, open, onOpenChange }: Props) {
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);

  useEffect(() => {
    if (!open || !aviso) return;
    void (async () => {
      // resolve nomes via equipe_membros (todas as estagiárias se destinatarias = [])
      const { data: estag } = await supabase
        .from("equipe_membros")
        .select("id, nome, user_id, cargo, status")
        .eq("status", "ativo")
        .eq("cargo", "estagiario");
      let lista = (estag ?? []) as any[];
      if (aviso.destinatarias.length) {
        lista = lista.filter((m) => aviso.destinatarias.includes(m.id));
      }
      setPessoas(lista.filter((m) => m.user_id).map((m) => ({ user_id: m.user_id, nome: m.nome })));
    })();
  }, [open, aviso]);

  if (!aviso) return null;
  const lidoPor = new Set(aviso.leituras.map((l) => l.user_id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Leituras — {aviso.titulo}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {pessoas.map((p) => {
            const leu = lidoPor.has(p.user_id);
            return (
              <div key={p.user_id} className="flex items-center gap-3 p-2 rounded border">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs bg-primary/10 text-primary">{iniciais(p.nome)}</AvatarFallback>
                </Avatar>
                <span className="flex-1 text-sm">{p.nome}</span>
                {leu ? (
                  <Check className="h-4 w-4 text-success" />
                ) : (
                  <X className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            );
          })}
          {!pessoas.length && (
            <p className="text-sm text-muted-foreground text-center py-4">Sem destinatárias mapeadas.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
