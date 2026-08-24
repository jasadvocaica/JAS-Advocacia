import { useMemo, useState } from "react";
import { BRASIL_UF_PATHS, BRASIL_VIEWBOX, UF_NOMES } from "./brasil-uf-paths";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Globe2, TrendingUp } from "lucide-react";

export interface ClienteEstadoData {
  uf: string;
  totalClientes?: number;
  total?: number;
  estado?: string;
}

export interface UfTotal {
  estado: string;
  total: number;
}

export interface MapaBrasilClientesProps {
  dados?: (UfTotal | ClienteEstadoData | any)[];
  dadosEstados?: (UfTotal | ClienteEstadoData | any)[];
  totalGeralClientes?: number;
  onSelectUf?: (uf: string) => void;
  className?: string;
  exibirCard?: boolean;
}

/**
 * Mapa do Brasil vetorial em SVG puro com distribuição geográfica de clientes.
 * Suporta múltiplos formatos de entrada e proteção rigorosa contra dados nulos/indefinidos.
 */
export function MapaBrasilClientes({
  dados,
  dadosEstados,
  totalGeralClientes,
  onSelectUf,
  className,
  exibirCard = true,
}: MapaBrasilClientesProps) {
  const [hover, setHover] = useState<string | null>(null);

  // Normaliza a lista de entrada seja por `dadosEstados` ou `dados`
  const listaEntrada = useMemo(() => {
    const raw = dadosEstados ?? dados;
    if (!raw || !Array.isArray(raw)) return [];
    return raw;
  }, [dadosEstados, dados]);

  const { mapa, max, totalMapeados, rankingEstados } = useMemo(() => {
    const m = new Map<string, number>();
    let mx = 0;
    let tt = 0;

    for (const d of listaEntrada) {
      if (!d) continue;
      const rawUf = (d.uf || d.estado || "").toString().trim().toUpperCase();
      if (!rawUf) continue;

      // Normaliza casos de 2 letras
      const uf = rawUf.length > 2 ? rawUf.slice(0, 2) : rawUf;
      if (!BRASIL_UF_PATHS[uf]) continue;

      const qtd = Number(d.totalClientes ?? d.total ?? 1);
      const atual = (m.get(uf) ?? 0) + (isNaN(qtd) ? 0 : qtd);
      m.set(uf, atual);
    }

    for (const v of m.values()) {
      mx = Math.max(mx, v);
      tt += v;
    }

    const ranking = Array.from(m.entries())
      .map(([uf, total]) => ({
        uf,
        nome: UF_NOMES[uf] ?? uf,
        total,
        pct: tt > 0 ? (total / tt) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    return { mapa: m, max: mx, totalMapeados: tt, rankingEstados: ranking };
  }, [listaEntrada]);

  const totalExibicao = totalGeralClientes !== undefined ? totalGeralClientes : totalMapeados;
  const ufAtiva = hover ? { uf: hover, nome: UF_NOMES[hover] ?? hover, qtd: mapa.get(hover) ?? 0 } : null;

  const content = (
    <div className={cn("space-y-4", className)}>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Mapa SVG */}
        <div className="lg:col-span-7 flex flex-col items-center justify-center relative">
          {/* Tooltip central flutuante */}
          <div className="min-h-[44px] flex items-center justify-center mb-2">
            <div className="rounded-xl border border-border bg-card/95 px-4 py-1.5 text-center shadow-sm backdrop-blur-sm transition-all duration-200">
              {ufAtiva ? (
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
                  <span className="text-xs font-semibold text-foreground">{ufAtiva.nome} ({ufAtiva.uf})</span>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-xs font-bold text-primary tabular-nums">
                    {ufAtiva.qtd} cliente{ufAtiva.qtd === 1 ? "" : "s"}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Globe2 className="w-3.5 h-3.5 text-primary" />
                  <span>Passe o cursor sobre os estados para ver detalhes</span>
                </div>
              )}
            </div>
          </div>

          <svg
            viewBox={BRASIL_VIEWBOX}
            className="w-full max-w-[420px] h-auto drop-shadow-sm transition-all"
            role="img"
            aria-label="Mapa do Brasil com distribuição de clientes por estado"
          >
            {Object.entries(BRASIL_UF_PATHS).map(([uf, d]) => {
              const qtd = mapa.get(uf) ?? 0;
              const intensidade = max > 0 && qtd > 0 ? 0.2 + (qtd / max) * 0.75 : 0;
              const ativo = hover === uf;

              return (
                <path
                  key={uf}
                  d={d}
                  tabIndex={qtd > 0 ? 0 : -1}
                  role={qtd > 0 ? "button" : undefined}
                  aria-label={`${UF_NOMES[uf] ?? uf}: ${qtd} cliente${qtd === 1 ? "" : "s"}`}
                  onMouseEnter={() => setHover(uf)}
                  onMouseLeave={() => setHover((h) => (h === uf ? null : h))}
                  onFocus={() => setHover(uf)}
                  onBlur={() => setHover((h) => (h === uf ? null : h))}
                  onClick={() => qtd > 0 && onSelectUf?.(uf)}
                  className={cn(
                    "outline-none transition-all duration-200",
                    qtd > 0 ? "cursor-pointer hover:opacity-90" : "opacity-40"
                  )}
                  style={{
                    fill:
                      qtd > 0
                        ? `hsl(var(--primary) / ${intensidade})`
                        : "hsl(var(--muted-foreground) / 0.15)",
                    stroke: ativo ? "hsl(var(--gold, 43 96% 56%))" : "hsl(var(--background))",
                    strokeWidth: ativo ? 3.5 : 1.5,
                    strokeLinejoin: "round",
                  }}
                />
              );
            })}
          </svg>
        </div>

        {/* Detalhamento e Ranking lateral */}
        <div className="lg:col-span-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg border border-border bg-muted/20">
              <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider block">
                Cobertura
              </span>
              <span className="text-xl font-bold font-display text-foreground tabular-nums">
                {mapa.size}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  de 27 UFs
                </span>
              </span>
            </div>
            <div className="p-3 rounded-lg border border-border bg-muted/20">
              <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider block">
                Mapeados
              </span>
              <span className="text-xl font-bold font-display text-primary tabular-nums">
                {totalMapeados}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  clientes
                </span>
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>Top Estados com Clientes</span>
              <span>Clientes (%)</span>
            </div>

            {rankingEstados.length === 0 ? (
              <div className="p-4 rounded-lg bg-muted/30 text-center text-xs text-muted-foreground">
                Nenhum cliente com estado preenchido no momento.
              </div>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {rankingEstados.slice(0, 6).map((item) => (
                  <div
                    key={item.uf}
                    className={cn(
                      "p-2 rounded-md border text-xs transition-colors flex items-center justify-between gap-3",
                      hover === item.uf
                        ? "border-primary/50 bg-primary/10"
                        : "border-border/60 bg-card/60 hover:bg-muted/40"
                    )}
                    onMouseEnter={() => setHover(item.uf)}
                    onMouseLeave={() => setHover((h) => (h === item.uf ? null : h))}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="outline" className="text-[10px] font-bold px-1.5 py-0 h-5 shrink-0">
                        {item.uf}
                      </Badge>
                      <span className="truncate font-medium text-foreground">{item.nome}</span>
                    </div>

                    <div className="text-right shrink-0 flex items-center gap-2">
                      <span className="font-semibold tabular-nums text-foreground">{item.total}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">({item.pct.toFixed(0)}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (!exibirCard) return content;

  return (
    <Card className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <h3 className="font-display text-2xl flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" /> Distribuição geográfica de clientes
          </h3>
          <p className="text-sm text-muted-foreground">
            Presença nacional e base de clientes por estado
          </p>
        </div>
        <Badge variant="outline" className="self-start sm:self-auto text-xs px-2.5 py-1">
          <TrendingUp className="w-3.5 h-3.5 text-primary mr-1.5" />
          {mapa.size} estados ativos
        </Badge>
      </div>

      {content}
    </Card>
  );
}
