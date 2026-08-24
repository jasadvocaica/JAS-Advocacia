import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, CheckCircle2, AlertCircle } from "lucide-react";
import { addDays, isWithinInterval, startOfDay } from "date-fns";
import { ControladoriaItem, TIPOS_EVENTO, TIPO_LABELS, TIPO_ICON } from "./types";

interface Props {
  itens: ControladoriaItem[];
  onSelecionar: (id: string) => void;
}

export function EventosSemanaCard({ itens, onSelecionar }: Props) {
  const eventos = useMemo(() => {
    const inicio = startOfDay(new Date());
    const fim = addDays(inicio, 7);
    return itens
      .filter((i) =>
        TIPOS_EVENTO.includes(i.tipo) &&
        i.status !== "concluido" && i.status !== "cancelado" &&
        isWithinInterval(new Date(i.data_vencimento), { start: inicio, end: fim })
      )
      .sort((a, b) => new Date(a.data_vencimento).getTime() - new Date(b.data_vencimento).getTime());
  }, [itens]);

  if (eventos.length === 0) return null;

  const naoConfirmados = eventos.filter((e) => !e.cliente_confirmado).length;

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">
          Eventos desta semana
        </h3>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{eventos.length}</Badge>
          {naoConfirmados > 0 && (
            <Badge className="bg-warning/15 text-warning border-warning/30">
              {naoConfirmados} sem confirmação
            </Badge>
          )}
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {eventos.map((ev) => {
          const Icone = TIPO_ICON[ev.tipo];
          return (
            <button
              key={ev.id}
              onClick={() => onSelecionar(ev.id)}
              className="group flex flex-col gap-1.5 rounded-md border border-border bg-card p-3 text-left transition hover:border-primary hover:shadow-sm"
            >
              <div className="flex items-start gap-2">
                <Icone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                    {ev.titulo}
                  </div>
                  <Badge variant="outline" className="mt-1 text-[10px]">{TIPO_LABELS[ev.tipo]}</Badge>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                {new Date(ev.data_vencimento).toLocaleString("pt-BR", {
                  weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                })}
              </div>
              {ev.local && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{ev.local}</span>
                </div>
              )}
              {ev.responsavel?.nome && (
                <div className="text-xs text-muted-foreground truncate">
                  {ev.responsavel.nome}
                </div>
              )}
              <div className={`mt-1 flex items-center gap-1 text-[11px] ${
                ev.cliente_confirmado ? "text-success" : "text-warning"
              }`}>
                {ev.cliente_confirmado
                  ? <><CheckCircle2 className="h-3 w-3" />Cliente confirmado</>
                  : <><AlertCircle className="h-3 w-3" />Sem confirmação</>}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
