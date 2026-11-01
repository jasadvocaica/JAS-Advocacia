import { useNavigate } from "react-router-dom";
import { AlertTriangle, ExternalLink } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { LABEL_CARGO_AGENTE, LABEL_STATUS_AGENTE, type AgentePainel } from "../types";
import { formatarPrazo } from "./AgenteCard";

const LABEL_PRIORIDADE: Record<string, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

const ESTILO_PRIORIDADE: Record<string, string> = {
  baixa: "bg-muted text-muted-foreground",
  media: "bg-info/15 text-info",
  alta: "bg-warning/15 text-warning",
  urgente: "bg-destructive/15 text-destructive",
};

interface Props {
  agente: AgentePainel | null;
  onOpenChange: (aberto: boolean) => void;
}

export function AgenteDetalheSheet({ agente, onOpenChange }: Props) {
  const navigate = useNavigate();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const atrasados = agente?.itens.filter((i) => new Date(i.data_vencimento) < hoje) ?? [];
  const demais = agente?.itens.filter((i) => new Date(i.data_vencimento) >= hoje) ?? [];

  return (
    <Sheet open={!!agente} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        {agente ? (
          <>
            <SheetHeader className="border-b pb-3">
              <SheetTitle className="text-base">{agente.nome}</SheetTitle>
              <SheetDescription className="text-xs">
                {agente.cargo ? LABEL_CARGO_AGENTE[agente.cargo] : "Sem cargo definido"}
                {agente.email ? ` · ${agente.email}` : ""}
              </SheetDescription>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Badge variant="outline" className="text-[10px]">
                  {LABEL_STATUS_AGENTE[agente.status]}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {agente.totalItens} abertas
                </Badge>
                {agente.atrasados > 0 ? (
                  <Badge variant="outline" className="border-destructive/30 text-[10px] text-destructive">
                    {agente.atrasados} em atraso
                  </Badge>
                ) : null}
              </div>
            </SheetHeader>

            <ScrollArea className="flex-1 px-4">
              {agente.itens.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma demanda em aberto no momento.
                </p>
              ) : (
                <div className="space-y-4 pb-4 pt-3">
                  {atrasados.length > 0 ? (
                    <Secao
                      titulo="Em atraso"
                      itens={atrasados}
                      onAbrir={() => navigate("/controladoria")}
                      destaque
                    />
                  ) : null}
                  {demais.length > 0 ? (
                    <Secao titulo="Próximas demandas" itens={demais} onAbrir={() => navigate("/controladoria")} />
                  ) : null}
                </div>
              )}
            </ScrollArea>

            <div className="border-t p-3">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  onOpenChange(false);
                  navigate("/controladoria");
                }}
              >
                Ver na Controladoria
                <ExternalLink className="ml-2 h-3.5 w-3.5" />
              </Button>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Secao({
  titulo,
  itens,
  onAbrir,
  destaque,
}: {
  titulo: string;
  itens: AgentePainel["itens"];
  onAbrir: () => void;
  destaque?: boolean;
}) {
  return (
    <section className="space-y-1.5">
      <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{titulo}</h4>
      <ul className="space-y-1.5">
        {itens.map((item) => {
          const atrasado = new Date(item.data_vencimento) < new Date(new Date().setHours(0, 0, 0, 0));
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={onAbrir}
                className={cn(
                  "w-full rounded-md border p-2.5 text-left transition hover:border-primary/40 hover:bg-muted/40",
                  destaque && "border-destructive/25 bg-destructive/5",
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium leading-snug">{item.titulo}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {item.cliente?.nome ?? item.processo?.numero_cnj ?? item.tipo}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                      ESTILO_PRIORIDADE[item.prioridade] ?? "bg-muted text-muted-foreground",
                    )}
                  >
                    {LABEL_PRIORIDADE[item.prioridade] ?? item.prioridade}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1">
                  {atrasado ? <AlertTriangle className="h-3 w-3 text-destructive" aria-hidden /> : null}
                  <span
                    className={cn(
                      "text-[10px] tabular-nums",
                      atrasado ? "font-medium text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {formatarPrazo(item.data_vencimento)}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
