import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Scale } from "lucide-react";
import { formatBRL, formatCNJ } from "@/lib/format";
import type { ProcessoListItem, ProcessoStatus } from "./types";

interface Props {
  processos: ProcessoListItem[];
  statusList: ProcessoStatus[];
}

export function ProcessosKanban({ processos, statusList }: Props) {
  // Agrupa pelos status ativos; processos com status fora da lista vão em "Outros"
  const colunas = statusList.map((s) => ({
    id: s.nome,
    nome: s.nome,
    cor: s.cor,
    items: processos.filter((p) => p.status === s.nome),
  }));
  const usados = new Set(statusList.map((s) => s.nome));
  const outros = processos.filter((p) => !usados.has(p.status));
  if (outros.length) colunas.push({ id: "__outros", nome: "Outros", cor: "#888780", items: outros });

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-3 min-w-max">
        {colunas.filter((c) => c.items.length > 0).map((col) => (
          <div key={col.id} className="w-72 shrink-0">
            <div className="flex items-center justify-between mb-2 px-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: col.cor }} />
                <span className="text-sm font-medium">{col.nome}</span>
              </div>
              <Badge variant="outline" className="text-[10px]">{col.items.length}</Badge>
            </div>
            <div className="space-y-2">
              {col.items.map((p: any) => (
                <Link key={p.id} to={`/processos/${p.id}`}>
                  <Card className="p-3 hover:border-gold/40 hover:shadow-sm transition-all space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Scale className="w-3 h-3 text-primary shrink-0" />
                      <span className="font-mono text-[11px] truncate">
                        {p.numero_cnj ? formatCNJ(p.numero_cnj) : (p.nb_inss ? `NB ${p.nb_inss}` : "Sem nº")}
                      </span>
                    </div>
                    <div className="text-sm font-medium truncate">{p.clientes?.nome ?? "—"}</div>
                    <div className="text-xs text-muted-foreground truncate">{p.tipo_acao ?? p.area_direito ?? p.tipo}</div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-muted-foreground">{p.tribunal_sigla ?? "—"}</span>
                      {p.valor_causa ? <span className="text-[11px] font-medium">{formatBRL(p.valor_causa)}</span> : null}
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
