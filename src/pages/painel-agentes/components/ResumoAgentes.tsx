import { Users, AlertTriangle, CalendarClock, Flame, UserMinus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Props {
  resumo: {
    totalPessoas: number;
    totalItens: number;
    atrasados: number;
    hoje: number;
    proximos7: number;
    sobrecarregados: number;
    ociosos: number;
  };
}

export function ResumoAgentes({ resumo }: Props) {
  const cards = [
    {
      label: "Pessoas ativas",
      valor: resumo.totalPessoas,
      detalhe: `${resumo.totalItens} demandas abertas`,
      icone: Users,
      tom: "text-foreground",
    },
    {
      label: "Em atraso",
      valor: resumo.atrasados,
      detalhe: resumo.atrasados > 0 ? "Exige atenção imediata" : "Nenhum prazo perdido",
      icone: AlertTriangle,
      tom: resumo.atrasados > 0 ? "text-destructive" : "text-foreground",
    },
    {
      label: "Vencem hoje",
      valor: resumo.hoje,
      detalhe: `${resumo.proximos7} nos próximos 7 dias`,
      icone: CalendarClock,
      tom: resumo.hoje > 0 ? "text-warning" : "text-foreground",
    },
    {
      label: "Sobrecarregados",
      valor: resumo.sobrecarregados,
      detalhe: `${resumo.ociosos} sem demandas`,
      icone: resumo.ociosos > 0 ? UserMinus : Flame,
      tom: resumo.sobrecarregados > 0 ? "text-destructive" : "text-foreground",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => {
        const Icone = c.icone;
        return (
          <Card key={c.label} className="border-border/60">
            <CardContent className="flex items-start gap-3 p-4">
              <div className="rounded-md bg-muted/60 p-2">
                <Icone className={cn("h-4 w-4", c.tom)} aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className={cn("text-2xl font-semibold tabular-nums leading-tight", c.tom)}>{c.valor}</p>
                <p className="truncate text-[11px] text-muted-foreground">{c.detalhe}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
