import { Card } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import type { CarteiraArea } from "../hooks/useDashboardGestorData";

export function CarteiraPorArea({ areas, total }: { areas: CarteiraArea[]; total: number }) {
  const naoDef = areas.find((a) => a.area === "Não definido");
  const alertar = naoDef && naoDef.percentual > 20;
  const top = areas.slice(0, 8);
  const max = Math.max(1, ...top.map((a) => a.total));

  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground">Carteira por área</h3>
      {alertar && naoDef && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>{naoDef.total}</strong> processos sem área — corrigir cadastro
          </span>
        </div>
      )}
      <ul className="space-y-2">
        {top.map((a) => {
          const isUndef = a.area === "Não definido";
          const w = (a.total / max) * 100;
          return (
            <li key={a.area} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className={isUndef ? "font-medium text-destructive" : "text-foreground"}>
                  {a.area}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {a.total} ({a.percentual.toFixed(0)}%)
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${w}%`,
                    background: isUndef ? "hsl(var(--destructive))" : "hsl(var(--sidebar-header))",
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 text-xs text-muted-foreground">Total: {total} processos ativos</div>
    </Card>
  );
}
