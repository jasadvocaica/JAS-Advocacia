import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import type { HonorarioPendente } from "../hooks/useDashboardGestorData";

const fmtBR = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s: string) =>
  new Date(s + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

function diasAte(s: string) {
  const d = new Date(s + "T00:00:00");
  return Math.floor((d.getTime() - Date.now()) / 86_400_000);
}

interface Props {
  itens: HonorarioPendente[];
  total: number;
}

export function HonorariosPendentes({ itens, total }: Props) {
  return (
    <Card className="flex h-full flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Honorários pendentes — top 5</h3>
        <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
          <Link to="/financeiro/pagamentos?status=pendente">Ver todos</Link>
        </Button>
      </div>
      {itens.length === 0 ? (
        <p className="my-auto text-center text-sm text-muted-foreground">
          Sem honorários pendentes neste mês
        </p>
      ) : (
        <ul className="space-y-2">
          {itens.map((i) => {
            const d = diasAte(i.data_vencimento);
            const variant: "destructive" | "outline" = d <= 3 ? "destructive" : "outline";
            return (
              <li key={i.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{i.cliente}</div>
                  <div className="text-xs text-muted-foreground">vence {fmtData(i.data_vencimento)}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-sm font-semibold tabular-nums text-foreground">{fmtBR(i.valor)}</span>
                  <Badge variant={variant} className={d > 3 ? "border-warning/40 bg-warning/10 text-warning" : ""}>
                    {d < 0 ? `venceu há ${-d}d` : d === 0 ? "vence hoje" : `em ${d}d`}
                  </Badge>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-3 flex justify-between border-t border-border pt-3 text-xs">
        <span className="font-medium text-foreground">Total pendente do mês</span>
        <span className="font-semibold tabular-nums text-foreground">{fmtBR(total)}</span>
      </div>
    </Card>
  );
}
