import { Card } from "@/components/ui/card";
import { MapPin, Calendar } from "lucide-react";
import { Link } from "react-router-dom";
import type { MeuItem } from "../hooks/useMeusItens";

interface Props {
  item?: MeuItem | null;
  titulo?: string;
  vazio?: string;
}

export function ProximaDiligenciaCard({
  item,
  titulo = "Próxima diligência",
  vazio = "Nenhuma diligência futura",
}: Props) {
  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground">
        {titulo}
      </h3>
      {!item ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-center text-xs text-muted-foreground">
          {vazio}
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <Link
            to={`/controladoria?item=${item.id}`}
            className="block font-medium text-foreground hover:underline"
          >
            {item.titulo}
          </Link>
          {item.local && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              {item.local}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            {new Date(item.data_vencimento).toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
          {(item.cliente || item.processo) && (
            <div className="text-xs text-muted-foreground">
              {item.processo?.numero_cnj ?? item.cliente?.nome}
            </div>
          )}
          {item.descricao && (
            <p className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
              <strong className="text-foreground">O que levar:</strong> {item.descricao}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
