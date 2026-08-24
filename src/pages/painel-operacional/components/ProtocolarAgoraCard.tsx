import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import type { MeuItem } from "../hooks/useMeusItens";

function tempoRelativo(dataIso: string) {
  const diff = Date.now() - new Date(dataIso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 60) return `há ${min}min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.round(h / 24);
  return `há ${d}d`;
}

export function ProtocolarAgoraCard({ pecas }: { pecas: MeuItem[] }) {
  return (
    <Card className="border-emerald-500/30 bg-emerald-500/5 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-foreground">
        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        Protocolar agora · {pecas.length}
      </h3>
      {!pecas.length ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-center text-xs text-muted-foreground">
          Sem peças aprovadas pendentes
        </div>
      ) : (
        <ul className="space-y-2">
          {pecas.map((p) => (
            <li
              key={p.id}
              className="rounded-md border border-emerald-500/20 bg-card px-3 py-2 text-sm"
            >
              <div className="font-medium text-foreground">{p.titulo}</div>
              <div className="text-xs text-muted-foreground">
                {p.cliente?.nome ?? p.processo?.numero_cnj} · aprovada {tempoRelativo(p.data_vencimento)}
              </div>
              {p.descricao && (
                <p className="mt-1 text-xs italic text-muted-foreground">"{p.descricao}"</p>
              )}
              <div className="mt-2">
                <Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                  <Link to={`/controladoria?item=${p.id}`}>Protocolar</Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
