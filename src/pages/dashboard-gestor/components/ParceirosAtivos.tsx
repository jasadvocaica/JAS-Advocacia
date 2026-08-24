import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { ParceiroAtivo } from "../hooks/useDashboardGestorData";

const CORES = [
  "bg-primary/15 text-primary",
  "bg-success/15 text-success",
  "bg-warning/15 text-warning",
  "bg-primary/15 text-primary",
  "bg-accent text-accent-foreground",
];

function iniciais(nome: string) {
  return nome.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

interface Props {
  parceiros: ParceiroAtivo[];
  totalEstados: number;
}

export function ParceirosAtivos({ parceiros, totalEstados }: Props) {
  return (
    <Card className="flex h-full flex-col p-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground">Parceiros ativos</h3>
      {parceiros.length === 0 ? (
        <p className="my-auto text-center text-sm text-muted-foreground">
          Nenhum parceiro ativo cadastrado
        </p>
      ) : (
        <ul className="space-y-2">
          {parceiros.slice(0, 8).map((p, idx) => (
            <li key={p.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
              <Avatar className="h-9 w-9">
                <AvatarFallback className={CORES[idx % CORES.length]}>{iniciais(p.nome)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">{p.nome}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {p.oab ? `OAB ${p.oab}` : ""}
                  {p.estado ? ` · ${p.estado}` : ""}
                </div>
              </div>
              <Badge variant="outline" className="text-[10px] capitalize">
                {p.tipo}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
        {parceiros.length} {parceiros.length === 1 ? "parceiro" : "parceiros"} em {totalEstados}{" "}
        {totalEstados === 1 ? "estado" : "estados"}
      </div>
    </Card>
  );
}
