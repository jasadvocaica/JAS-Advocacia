import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { ItemAtrasado } from "../hooks/useDashboardGestorData";

function formatarData(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function AlertaControladoria({ itens }: { itens: ItemAtrasado[] }) {
  if (!itens.length) {
    return (
      <Card className="flex items-center gap-3 border-success/40 bg-success/10 p-4">
        <CheckCircle2 className="h-5 w-5 text-success" />
        <div className="text-sm font-medium text-foreground">
          Nenhum item atrasado — escritório em dia ✓
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-destructive/40 bg-destructive/5 p-4">
      <div className="mb-3 flex items-center gap-2 text-destructive">
        <AlertTriangle className="h-5 w-5" />
        <h2 className="text-sm font-semibold uppercase tracking-wide">
          Atenção imediata · {itens.length} {itens.length === 1 ? "item atrasado" : "itens atrasados"}
        </h2>
      </div>
      <ul className="space-y-2">
        {itens.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/20 bg-card px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">{item.titulo}</div>
              <div className="truncate text-xs text-muted-foreground">
                {item.cliente_nome ?? "—"} · venceu {formatarData(item.data_vencimento)}
              </div>
            </div>
            <Button asChild size="sm" variant="destructive">
              <Link to={`/controladoria?item=${item.id}`}>Resolver</Link>
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
