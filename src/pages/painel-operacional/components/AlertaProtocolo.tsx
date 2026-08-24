import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { MeuItem } from "../hooks/useMeusItens";

export function AlertaProtocolo({ pecas }: { pecas: MeuItem[] }) {
  if (!pecas.length) return null;
  const p = pecas[0];
  const cliente = p.cliente?.nome ?? p.processo?.numero_cnj ?? "cliente";
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 border-emerald-500/40 bg-emerald-500/10 p-4">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        <div className="text-sm">
          <strong className="text-foreground">{p.titulo}</strong> — {cliente} foi aprovada pela
          Dra. Juliana. Pode protocolar agora.
          {pecas.length > 1 && (
            <span className="ml-1 text-xs text-muted-foreground">
              (+{pecas.length - 1} aguardando)
            </span>
          )}
        </div>
      </div>
      <Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-700">
        <Link to={`/controladoria?item=${p.id}`}>Protocolar agora</Link>
      </Button>
    </Card>
  );
}
