import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw, Clock } from "lucide-react";

interface Props {
  ultimaCarga: Date | null;
  onRefresh: () => void;
  loading?: boolean;
  /** Chave para persistir o intervalo escolhido por painel */
  storageKey?: string;
  className?: string;
  compact?: boolean;
}

const OPCOES: { label: string; value: string; ms: number }[] = [
  { label: "Desligado", value: "off", ms: 0 },
  { label: "30s", value: "30", ms: 30_000 },
  { label: "1 min", value: "60", ms: 60_000 },
  { label: "5 min", value: "300", ms: 300_000 },
];

function formatHora(d: Date | null) {
  if (!d) return "—";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function AutoRefreshControl({
  ultimaCarga,
  onRefresh,
  loading,
  storageKey = "auto-refresh-interval",
  className,
  compact,
}: Props) {
  const [intervalo, setIntervalo] = useState<string>(() => {
    if (typeof window === "undefined") return "off";
    return localStorage.getItem(storageKey) ?? "off";
  });
  const [contagem, setContagem] = useState(0);
  const [tick, setTick] = useState(0); // re-render p/ "há Xs"
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    localStorage.setItem(storageKey, intervalo);
  }, [intervalo, storageKey]);

  useEffect(() => {
    const ms = OPCOES.find((o) => o.value === intervalo)?.ms ?? 0;
    if (!ms) return;
    const id = setInterval(() => {
      onRefreshRef.current();
      setContagem((c) => c + 1);
    }, ms);
    return () => clearInterval(id);
  }, [intervalo]);

  // ticker para "há Xs" — atualiza a cada 10s
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  const handleManual = () => {
    onRefresh();
    setContagem((c) => c + 1);
  };

  const segundos = ultimaCarga ? Math.max(0, Math.floor((Date.now() - ultimaCarga.getTime()) / 1000)) : null;
  const haQuanto =
    segundos === null
      ? "—"
      : segundos < 60
      ? `há ${segundos}s`
      : segundos < 3600
      ? `há ${Math.floor(segundos / 60)}min`
      : `há ${Math.floor(segundos / 3600)}h`;
  void tick;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        <span className="tabular-nums">
          {compact ? haQuanto : `Atualizado às ${formatHora(ultimaCarga)} (${haQuanto})`}
        </span>
        {contagem > 0 && (
          <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
            {contagem} {contagem === 1 ? "refresh" : "refreshes"}
          </span>
        )}
      </div>
      <Select value={intervalo} onValueChange={setIntervalo}>
        <SelectTrigger className="h-8 w-[120px] text-xs">
          <SelectValue placeholder="Auto" />
        </SelectTrigger>
        <SelectContent>
          {OPCOES.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">
              Auto: {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="outline" size="sm" onClick={handleManual} disabled={loading}>
        <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        Atualizar
      </Button>
    </div>
  );
}
