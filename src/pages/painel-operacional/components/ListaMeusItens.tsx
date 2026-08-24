import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { BadgeUrgencia, calcularUrgencia } from "./BadgeUrgencia";
import { TIPO_LABELS, TIPO_CLASS } from "@/pages/controladoria/types";
import type { MeuItem } from "../hooks/useMeusItens";
import { cn } from "@/lib/utils";

interface Props {
  itens: MeuItem[];
  titulo?: string;
  mostrarSolicitante?: boolean;
  destacarAtrasados?: boolean;
  vazioMsg?: string;
}

export function ListaMeusItens({
  itens,
  titulo = "Tudo atribuído a mim",
  mostrarSolicitante,
  destacarAtrasados,
  vazioMsg = "Nada atribuído. Aproveite para revisar processos.",
}: Props) {
  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground">
        {titulo} · {itens.length}
      </h2>
      {!itens.length ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          {vazioMsg}
        </div>
      ) : (
        <ul className="space-y-2">
          {itens.map((item) => {
            const u = calcularUrgencia(item.data_vencimento);
            const atrasado = u.diff < 0;
            const tipoLabel = TIPO_LABELS[item.tipo as keyof typeof TIPO_LABELS] ?? item.tipo;
            const link = item.processo
              ? `/processos/${item.processo.id}`
              : item.cliente
              ? `/clientes/${item.cliente.id}`
              : `/controladoria?item=${item.id}`;
            const vinculo = item.processo
              ? item.processo.numero_cnj ?? "Processo"
              : item.cliente?.nome ?? "Sem vínculo";
            return (
              <li
                key={item.id}
                className={cn(
                  "rounded-md border bg-card px-3 py-2 transition-colors hover:bg-accent/40",
                  destacarAtrasados && atrasado && "border-l-4 border-l-destructive"
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/controladoria?item=${item.id}`}
                      className="block truncate text-sm font-medium text-foreground hover:underline"
                    >
                      {item.titulo}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Link to={link} className="rounded bg-muted px-1.5 py-0.5 hover:underline">
                        {vinculo}
                      </Link>
                      {mostrarSolicitante && item.criador_nome && (
                        <span>· Solicitado por {item.criador_nome}</span>
                      )}
                      <span>
                        · vence{" "}
                        {new Date(item.data_vencimento).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <BadgeUrgencia data={item.data_vencimento} />
                    <Badge
                      variant="outline"
                      className={cn("text-[10px]", TIPO_CLASS[item.tipo as keyof typeof TIPO_CLASS])}
                    >
                      {tipoLabel}
                    </Badge>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
