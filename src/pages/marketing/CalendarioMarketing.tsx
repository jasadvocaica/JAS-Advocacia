import { useState } from "react";
import {
  addDays,
  addMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  format,
  isSameMonth,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { STATUS, diaLocal, type Item } from "./model";
export default function CalendarioMarketing({
  itens,
  onOpen,
}: {
  itens: Item[];
  onOpen: (i: Item) => void;
}) {
  const [data, setData] = useState(new Date());
  const [modo, setModo] = useState("mes");
  const inicio =
    modo === "mes"
      ? startOfWeek(startOfMonth(data), { weekStartsOn: 1 })
      : modo === "semana"
        ? startOfWeek(data, { weekStartsOn: 1 })
        : data;
  const fim =
    modo === "mes"
      ? endOfWeek(endOfMonth(data), { weekStartsOn: 1 })
      : modo === "semana"
        ? endOfWeek(data, { weekStartsOn: 1 })
        : data;
  const dias = [];
  for (let d = inicio; d <= fim; d = addDays(d, 1)) dias.push(d);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          onClick={() =>
            setData(
              modo === "mes"
                ? addMonths(data, -1)
                : addDays(data, modo === "semana" ? -7 : -1),
            )
          }
        >
          Anterior
        </Button>
        <Button variant="outline" onClick={() => setData(new Date())}>
          Hoje
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            setData(
              modo === "mes"
                ? addMonths(data, 1)
                : addDays(data, modo === "semana" ? 7 : 1),
            )
          }
        >
          Próximo
        </Button>
        <h3 className="font-semibold flex-1 capitalize">
          {format(data, "MMMM yyyy", { locale: ptBR })}
        </h3>
        {["mes", "semana", "dia"].map((m) => (
          <Button
            key={m}
            size="sm"
            variant={modo === m ? "default" : "outline"}
            onClick={() => setModo(m)}
          >
            {m === "mes" ? "Mês" : m === "semana" ? "Semana" : "Dia"}
          </Button>
        ))}
      </div>
      <div
        className={`grid gap-2 ${modo === "dia" ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-7"}`}
      >
        {dias.map((d) => (
          <div
            key={format(d, "yyyy-MM-dd")}
            className={`rounded-lg border p-2 min-h-32 ${isSameMonth(d, data) ? "bg-card" : "bg-muted/40"}`}
          >
            <p className="text-xs font-semibold mb-2">
              {format(d, "EEE, dd/MM", { locale: ptBR })}
            </p>
            <div className="space-y-2">
              {itens
                .filter(
                  (i) => diaLocal(i.data_prevista) === format(d, "yyyy-MM-dd"),
                )
                .map((i) => (
                  <button
                    key={i.id}
                    className="w-full rounded bg-muted p-2 text-left text-xs hover:bg-accent"
                    onClick={() => onOpen(i)}
                  >
                    <p className="font-medium break-words">{i.titulo}</p>
                    <p>{i.canal}</p>
                    <Badge variant="outline" className="text-[10px] mt-1">
                      {STATUS[i.status]}
                    </Badge>
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
