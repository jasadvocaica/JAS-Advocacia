import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface MetricaTopo {
  label: string;
  valor: number | string;
  icon: LucideIcon;
  tone?: "default" | "destructive" | "success" | "warning";
  hint?: string;
}

const TONE: Record<NonNullable<MetricaTopo["tone"]>, string> = {
  default: "border-border",
  destructive: "border-destructive/40 bg-destructive/5",
  success: "border-emerald-500/40 bg-emerald-500/5",
  warning: "border-amber-500/40 bg-amber-500/5",
};

export function CardsMetricasTopo({ metricas }: { metricas: MetricaTopo[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {metricas.map((m) => {
        const Icon = m.icon;
        return (
          <Card key={m.label} className={cn("p-4", TONE[m.tone ?? "default"])}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {m.label}
              </span>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-2 text-2xl font-semibold text-foreground">{m.valor}</div>
            {m.hint && <div className="mt-1 text-xs text-muted-foreground">{m.hint}</div>}
          </Card>
        );
      })}
    </div>
  );
}
