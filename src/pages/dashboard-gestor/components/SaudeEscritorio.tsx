import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { SaudeEscritorio } from "../hooks/useDashboardGestorData";

function rotuloScore(s: number) {
  if (s <= 40) return { txt: "precisa de atenção", cor: "text-destructive" };
  if (s <= 70) return { txt: "em desenvolvimento", cor: "text-warning" };
  if (s <= 90) return { txt: "bom", cor: "text-primary" };
  return { txt: "excelente", cor: "text-success" };
}

export function SaudeEscritorioCard({ saude }: { saude: SaudeEscritorio }) {
  const { txt, cor } = rotuloScore(saude.score);
  return (
    <Card className="flex h-full flex-col p-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground">Saúde do escritório</h3>
      <div className="mb-4 text-center">
        <div className={`text-5xl font-bold tabular-nums ${cor}`}>{saude.score}</div>
        <div className={`mt-1 text-xs font-medium uppercase tracking-wide ${cor}`}>{txt}</div>
      </div>
      <div className="space-y-3 text-xs">
        <Linha label="Processos com tarefa ativa" valor={saude.componentes.processosComTarefa} />
        <Linha label="Financeiro em dia" valor={saude.componentes.parcelasEmDia} />
        <Linha label="Áreas cadastradas" valor={saude.componentes.processosComArea} />
        <Linha label="Prazos cumpridos no mês" valor={saude.componentes.prazosCumpridos} />
      </div>
    </Card>
  );
}

function Linha({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums text-foreground">{valor}%</span>
      </div>
      <Progress value={valor} className="h-1.5" />
    </div>
  );
}
