import { Card } from "@/components/ui/card";
import { CheckCircle2, FileCheck2 } from "lucide-react";
import type { RevisaoItem, ProtocoloItem } from "../hooks/useDashboardGestorData";

function tempoDecorrido(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "agora";
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

interface Props {
  revisoes: RevisaoItem[];
  protocolo: ProtocoloItem[];
}

export function RevisoesProtocolo({ revisoes, protocolo }: Props) {
  return (
    <Card className="flex h-full flex-col p-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground">Revisões & protocolo</h3>

      <div className="mb-4">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Aguardando revisão
        </div>
        {revisoes.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" />
            Nenhuma peça aguardando revisão
          </div>
        ) : (
          <ul className="space-y-1.5">
            {revisoes.slice(0, 4).map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground">{r.titulo}</div>
                  <div className="truncate text-muted-foreground">
                    {r.responsavel_nome ?? "—"} · {tempoDecorrido(r.desde)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-border pt-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <FileCheck2 className="h-3.5 w-3.5" />
          Fila de protocolo
        </div>
        {protocolo.length === 0 ? (
          <div className="text-sm text-muted-foreground">Nenhum item aguardando protocolo</div>
        ) : (
          <ul className="space-y-1.5">
            {protocolo.slice(0, 4).map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground">{p.titulo}</div>
                  <div className="truncate text-muted-foreground">
                    {p.processo_cnj ?? "—"} · {p.responsavel_nome ?? "—"}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
