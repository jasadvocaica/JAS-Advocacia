import { useMemo, useState } from "react";
import { BRASIL_UF_PATHS, BRASIL_VIEWBOX, UF_NOMES } from "./brasil-uf-paths";
import { cn } from "@/lib/utils";

export interface UfTotal {
  estado: string;
  total: number;
}

interface Props {
  dados: UfTotal[];
  onSelectUf?: (uf: string) => void;
  className?: string;
}

/**
 * Mapa do Brasil em SVG puro (sem API key / sem dependência externa).
 * A intensidade da cor é proporcional ao número de clientes na UF.
 */
export function MapaBrasilClientes({ dados, onSelectUf, className }: Props) {
  const [hover, setHover] = useState<string | null>(null);

  const { mapa, max, total } = useMemo(() => {
    const m = new Map<string, number>();
    let mx = 0;
    let tt = 0;
    for (const d of dados) {
      const uf = d.estado.trim().toUpperCase();
      if (!BRASIL_UF_PATHS[uf]) continue;
      m.set(uf, (m.get(uf) ?? 0) + d.total);
    }
    for (const v of m.values()) {
      mx = Math.max(mx, v);
      tt += v;
    }
    return { mapa: m, max: mx, total: tt };
  }, [dados]);

  const ufAtiva = hover ? { uf: hover, qtd: mapa.get(hover) ?? 0 } : null;

  return (
    <div className={cn("relative", className)}>
      <svg
        viewBox={BRASIL_VIEWBOX}
        className="mt-9 h-auto w-full"
        role="img"
        aria-label="Mapa do Brasil com distribuição de clientes por estado"
      >
        {Object.entries(BRASIL_UF_PATHS).map(([uf, d]) => {
          const qtd = mapa.get(uf) ?? 0;
          const intensidade = max > 0 && qtd > 0 ? 0.16 + (qtd / max) * 0.74 : 0;
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
                "outline-none transition-[fill,stroke] duration-200",
                qtd > 0 && "cursor-pointer",
              )}
              style={{
                fill:
                  qtd > 0
                    ? `hsl(var(--primary) / ${intensidade})`
                    : "hsl(var(--muted))",
                stroke: ativo ? "hsl(var(--champagne))" : "hsl(var(--card))",
                strokeWidth: ativo ? 3.5 : 2,
                strokeLinejoin: "round",
              }}
            />
          );
        })}
      </svg>

      <div className="pointer-events-none absolute -top-1 left-1/2 min-w-[150px] -translate-x-1/2 rounded-xl border border-border bg-card/95 px-3 py-1.5 text-center shadow-sm backdrop-blur-sm">
        {ufAtiva ? (
          <>
            <p className="text-xs font-medium text-foreground">
              {UF_NOMES[ufAtiva.uf] ?? ufAtiva.uf}{" "}
              <span className="text-muted-foreground">({ufAtiva.uf})</span>
            </p>
            <p className="text-sm font-semibold tabular-nums text-primary">
              {ufAtiva.qtd} cliente{ufAtiva.qtd === 1 ? "" : "s"}
            </p>
          </>
        ) : (
          <>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Clientes mapeados
            </p>
            <p className="text-sm font-semibold tabular-nums text-foreground">
              {total} em {mapa.size} UF{mapa.size === 1 ? "" : "s"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
