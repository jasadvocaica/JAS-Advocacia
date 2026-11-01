import { CalendarClock, AlertTriangle, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  LABEL_CARGO_AGENTE,
  LABEL_STATUS_AGENTE,
  type AgentePainel,
  type StatusAgente,
} from "../types";

const ESTILO_STATUS: Record<StatusAgente, { className: string; dot: string }> = {
  sobrecarregado: {
    className: "bg-destructive/15 text-destructive border-destructive/30",
    dot: "bg-destructive",
  },
  ativo: {
    className: "bg-info/15 text-info border-info/30",
    dot: "bg-info",
  },
  tranquilo: {
    className: "bg-success/15 text-success border-success/30",
    dot: "bg-success",
  },
  ocioso: {
    className: "bg-muted text-muted-foreground border-border",
    dot: "bg-muted-foreground",
  },
  ausente: {
    className: "bg-warning/15 text-warning border-warning/30",
    dot: "bg-warning",
  },
};

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function formatarPrazo(iso: string): string {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  const dias = Math.round((d.getTime() - hoje.getTime()) / 86_400_000);

  if (dias < 0) return `${Math.abs(dias)}d em atraso`;
  if (dias === 0) return "Hoje";
  if (dias === 1) return "Amanhã";
  if (dias <= 7) return `Em ${dias} dias`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

interface Props {
  agente: AgentePainel;
  maxCarga: number;
  onAbrir: (agente: AgentePainel) => void;
}

export function AgenteCard({ agente, maxCarga, onAbrir }: Props) {
  const estilo = ESTILO_STATUS[agente.status];
  const percentualCarga = maxCarga > 0 ? Math.min(100, Math.round((agente.carga / maxCarga) * 100)) : 0;
  const top3 = agente.itens.slice(0, 3);

  return (
    <button
      type="button"
      onClick={() => onAbrir(agente)}
      className={cn(
        "group flex w-full flex-col gap-3 rounded-lg border bg-card p-4 text-left transition",
        "hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
      aria-label={`Ver detalhes de ${agente.nome}`}
    >
      <div className="flex items-start gap-3">
        <div className="relative">
          <Avatar className="h-10 w-10">
            {agente.avatarUrl ? <AvatarImage src={agente.avatarUrl} alt="" /> : null}
            <AvatarFallback className="text-xs font-medium">{iniciais(agente.nome)}</AvatarFallback>
          </Avatar>
          <span
            className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-card", estilo.dot)}
            aria-hidden
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight">{agente.nome}</p>
          <p className="truncate text-xs text-muted-foreground">
            {agente.cargo ? LABEL_CARGO_AGENTE[agente.cargo] : "Sem cargo definido"}
          </p>
        </div>

        <Badge variant="outline" className={cn("shrink-0 text-[10px] font-medium", estilo.className)}>
          {LABEL_STATUS_AGENTE[agente.status]}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md bg-muted/50 py-1.5">
          <p className="text-sm font-semibold tabular-nums leading-tight">{agente.totalItens}</p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">abertos</p>
        </div>
        <div className={cn("rounded-md py-1.5", agente.atrasados > 0 ? "bg-destructive/10" : "bg-muted/50")}>
          <p
            className={cn(
              "text-sm font-semibold tabular-nums leading-tight",
              agente.atrasados > 0 && "text-destructive",
            )}
          >
            {agente.atrasados}
          </p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">atrasos</p>
        </div>
        <div className={cn("rounded-md py-1.5", agente.hoje > 0 ? "bg-warning/10" : "bg-muted/50")}>
          <p
            className={cn(
              "text-sm font-semibold tabular-nums leading-tight",
              agente.hoje > 0 && "text-warning",
            )}
          >
            {agente.hoje}
          </p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">hoje</p>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Carga de trabalho</span>
          <span className="tabular-nums">{percentualCarga}%</span>
        </div>
        <Progress
          value={percentualCarga}
          className={cn(
            "h-1.5",
            agente.status === "sobrecarregado" && "[&>div]:bg-destructive",
            agente.status === "ativo" && "[&>div]:bg-info",
            agente.status === "tranquilo" && "[&>div]:bg-success",
          )}
        />
      </div>

      {top3.length > 0 ? (
        <ul className="space-y-1 border-t pt-2">
          {top3.map((item) => {
            const atrasado = new Date(item.data_vencimento) < new Date(new Date().setHours(0, 0, 0, 0));
            return (
              <li key={item.id} className="flex items-center gap-1.5 text-xs">
                {atrasado ? (
                  <AlertTriangle className="h-3 w-3 shrink-0 text-destructive" aria-hidden />
                ) : (
                  <CalendarClock className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <span className="truncate text-muted-foreground">{item.titulo}</span>
                <span
                  className={cn(
                    "ml-auto shrink-0 text-[10px] tabular-nums",
                    atrasado ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {formatarPrazo(item.data_vencimento)}
                </span>
              </li>
            );
          })}
          {agente.totalItens > 3 ? (
            <li className="flex items-center justify-end gap-0.5 pt-0.5 text-[10px] text-muted-foreground">
              +{agente.totalItens - 3} mais
              <ChevronRight className="h-3 w-3" aria-hidden />
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="border-t pt-2 text-xs text-muted-foreground">Nenhuma demanda em aberto.</p>
      )}
    </button>
  );
}

export { formatarPrazo, iniciais };
