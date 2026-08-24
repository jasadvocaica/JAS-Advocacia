import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type LogRow = Tables<"pje_sync_log">;

export interface UltimaSyncPanelProps {
  ultima: LogRow | null;
  onVerHistorico?: () => void;
}

function formatarDataHora(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function formatarDuracao(ms: number | null | undefined): string | null {
  if (!ms || ms <= 0) return null;
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 100) / 10;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return `${m}m ${r}s`;
}

export function UltimaSyncPanel({ ultima, onVerHistorico }: UltimaSyncPanelProps) {
  if (!ultima) {
    return (
      <Card className="p-4 border-dashed">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Clock className="w-4 h-4 opacity-60" />
          <div>
            <p className="font-medium text-foreground">Última sincronização</p>
            <p className="text-xs">
              Nenhuma execução registrada ainda. Clique em <strong>Sincronizar agora</strong> para começar.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const consultadas = ultima.total_consultadas ?? 0;
  const novas = ultima.total_novas ?? 0;
  const vinculadas = ultima.total_vinculadas ?? 0;
  const erros = ultima.total_erros ?? 0;
  const duracao = formatarDuracao(ultima.duracao_ms);

  const status = ultima.status ?? "—";
  const isErro = status === "erro";
  const isExecutando = status === "executando" || status === "iniciado";
  const isOk = status === "concluido";

  const StatusIcon = isErro ? AlertCircle : isExecutando ? Loader2 : CheckCircle2;
  const statusClass = isErro
    ? "border-destructive/40 text-destructive"
    : isExecutando
      ? "border-muted-foreground/40 text-muted-foreground"
      : "border-gold/40 text-gold";

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Última sincronização
            </p>
            <p className="text-sm font-medium">
              {formatarDataHora(ultima.iniciado_em)}
              {duracao && (
                <span className="text-xs text-muted-foreground ml-2">· {duracao}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] uppercase">
            {ultima.modo}
          </Badge>
          <Badge variant="outline" className={`gap-1 ${statusClass}`}>
            <StatusIcon
              className={`w-3 h-3 ${isExecutando ? "animate-spin" : ""}`}
            />
            {status}
          </Badge>
          {onVerHistorico && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={onVerHistorico}
            >
              Ver histórico →
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Metric label="Consultadas" value={consultadas} />
        <Metric label="Novas" value={novas} accent="gold" />
        <Metric label="Vinculadas" value={vinculadas} />
        <Metric label="Erros" value={erros} accent={erros > 0 ? "destructive" : "muted"} />
      </div>

      {ultima.mensagem && (
        <p
          className={`text-xs ${isErro ? "text-destructive" : "text-muted-foreground"}`}
        >
          {ultima.mensagem}
        </p>
      )}
    </Card>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "gold" | "destructive" | "muted";
}) {
  const cls =
    accent === "gold"
      ? "text-gold"
      : accent === "destructive"
        ? "text-destructive"
        : accent === "muted"
          ? "text-muted-foreground"
          : "text-foreground";
  return (
    <div className="rounded-md border border-border/60 p-2">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className={`text-2xl font-serif tabular-nums ${cls}`}>{value}</p>
    </div>
  );
}
