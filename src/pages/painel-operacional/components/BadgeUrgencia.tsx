import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function calcularUrgencia(dataVencimento: string) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const venc = new Date(dataVencimento);
  venc.setHours(0, 0, 0, 0);
  const diff = Math.ceil((venc.getTime() - hoje.getTime()) / 86400000);
  if (diff < 0) return { label: `Atrasado ${Math.abs(diff)}d`, tone: "destructive" as const, diff };
  if (diff === 0) return { label: "Hoje", tone: "destructive" as const, diff };
  if (diff === 1) return { label: "Amanhã", tone: "warning" as const, diff };
  if (diff <= 3) return { label: `${diff} dias`, tone: "warning" as const, diff };
  if (diff <= 7) return { label: `${diff} dias`, tone: "info" as const, diff };
  return { label: `${diff} dias`, tone: "muted" as const, diff };
}

const TONE_CLASSES: Record<string, string> = {
  destructive: "bg-destructive/15 text-destructive border-destructive/30",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  info: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  muted: "bg-muted text-muted-foreground border-border",
};

export function BadgeUrgencia({ data }: { data: string }) {
  const u = calcularUrgencia(data);
  return (
    <Badge variant="outline" className={cn("font-medium", TONE_CLASSES[u.tone])}>
      {u.label}
    </Badge>
  );
}
