import { Card } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { BadgeUrgencia } from "./BadgeUrgencia";
import type { MeuItem } from "../hooks/useMeusItens";

export function PesquisasAbertasCard({ itens }: { itens: MeuItem[] }) {
  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground">
        Pesquisas em aberto · {itens.length}
      </h3>
      {!itens.length ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-center text-xs text-muted-foreground">
          Nenhuma pesquisa pendente
        </div>
      ) : (
        <ul className="space-y-2">
          {itens.map((p) => (
            <li
              key={p.id}
              className="flex items-start justify-between gap-2 rounded-md border bg-card px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <Link
                  to={`/controladoria?item=${p.id}`}
                  className="block truncate text-sm font-medium text-foreground hover:underline"
                >
                  {p.titulo}
                </Link>
                <div className="text-xs text-muted-foreground">
                  {p.cliente?.nome ?? p.processo?.numero_cnj ?? "—"}
                  {p.criador_nome && ` · pedida por ${p.criador_nome}`}
                </div>
              </div>
              <BadgeUrgencia data={p.data_vencimento} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
