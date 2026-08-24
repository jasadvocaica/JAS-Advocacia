import { Card } from "@/components/ui/card";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { Progress } from "@/components/ui/progress";
import type { FaturamentoMes } from "../hooks/useDashboardGestorData";

const fmtR$k = (v: number) => (v >= 1000 ? `R$ ${(v / 1000).toFixed(0)}k` : `R$ ${v}`);
const fmtBR = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

interface Props {
  faturamento: FaturamentoMes[];
  meta: number;
  recebidoMes: number;
}

export function GraficoFaturamento({ faturamento, meta, recebidoMes }: Props) {
  const pct = meta > 0 ? Math.min(100, (recebidoMes / meta) * 100) : 0;
  const faltam = Math.max(0, meta - recebidoMes);

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Faturamento — últimos 6 meses</h3>
        <span className="text-xs text-muted-foreground">Meta: {fmtBR(meta)}</span>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={faturamento} margin={{ top: 16, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtR$k} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} width={50} />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v: number) => fmtBR(v)}
            />
            <ReferenceLine y={meta} stroke="hsl(var(--gold))" strokeDasharray="4 4" />
            <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
              {faturamento.map((e) => (
                <Cell key={e.mes} fill={e.ehAtual ? "hsl(var(--gold))" : "hsl(var(--sidebar-header))"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 space-y-1">
        <div className="flex justify-between text-xs">
          <span className="font-medium text-foreground">Meta mensal: {fmtBR(meta)}</span>
          <span className="text-muted-foreground">
            {pct.toFixed(0)}% atingido · faltam {fmtBR(faltam)}
          </span>
        </div>
        <Progress value={pct} className="h-2" />
      </div>
    </Card>
  );
}
