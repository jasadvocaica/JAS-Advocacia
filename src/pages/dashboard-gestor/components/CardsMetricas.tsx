import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Briefcase, DollarSign, Clock, Target, Pencil, Check } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import type { MetricasGerais } from "../hooks/useDashboardGestorData";

const fmtBR = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  metricas: MetricasGerais;
  meta: number;
  onSalvarMeta: (v: number) => Promise<boolean>;
}

export function CardsMetricas({ metricas, meta, onSalvarMeta }: Props) {
  const [editando, setEditando] = useState(false);
  const [valorMeta, setValorMeta] = useState(String(meta));
  const [salvando, setSalvando] = useState(false);

  const pctMeta = meta > 0 ? Math.min(100, (metricas.recebidoMes / meta) * 100) : 0;
  const corMeta =
    pctMeta < 50 ? "text-destructive" : pctMeta < 80 ? "text-warning" : "text-success";

  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        icon={<Briefcase className="h-4 w-4" />}
        label="Casos ativos"
        valor={String(metricas.casosAtivos)}
        sub={<span className="text-success">carteira ativa</span>}
      />
      <MetricCard
        icon={<DollarSign className="h-4 w-4" />}
        label="Recebido no mês"
        valor={fmtBR(metricas.recebidoMes)}
        sub={
          <span className="text-muted-foreground">
            {metricas.qtdPagamentosMes} {metricas.qtdPagamentosMes === 1 ? "pagamento" : "pagamentos"}
          </span>
        }
      />
      <MetricCard
        icon={<Clock className="h-4 w-4" />}
        label="Pendente no mês"
        valor={fmtBR(metricas.pendenteMes)}
        valorClass="text-warning"
        sub={
          <span className={metricas.pendenteMes > 5000 ? "text-destructive" : "text-muted-foreground"}>
            a receber
          </span>
        }
      />
      <Card className="bg-muted/40 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Target className="h-4 w-4" />
            Meta mensal
          </div>
          {!editando ? (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => {
                setValorMeta(String(meta));
                setEditando(true);
              }}
            >
              <Pencil className="h-3 w-3" />
            </Button>
          ) : (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              disabled={salvando}
              onClick={async () => {
                const num = Number(valorMeta);
                if (!Number.isFinite(num) || num <= 0) return;
                setSalvando(true);
                const ok = await onSalvarMeta(num);
                setSalvando(false);
                if (ok) setEditando(false);
              }}
            >
              <Check className="h-3 w-3" />
            </Button>
          )}
        </div>
        <div className={`mt-2 text-2xl font-bold tabular-nums ${corMeta}`}>
          {pctMeta.toFixed(0)}%
        </div>
        {editando ? (
          <div className="mt-2 flex items-center gap-1 text-xs">
            <span className="text-muted-foreground">R$</span>
            <Input
              value={valorMeta}
              onChange={(e) => setValorMeta(e.target.value)}
              type="number"
              className="h-7 px-2"
            />
          </div>
        ) : (
          <div className="mt-1 text-xs text-muted-foreground">
            {fmtBR(metricas.recebidoMes)} de {fmtBR(meta)}
          </div>
        )}
      </Card>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  valor,
  sub,
  valorClass,
}: {
  icon: React.ReactNode;
  label: string;
  valor: string;
  sub: React.ReactNode;
  valorClass?: string;
}) {
  return (
    <Card className="bg-muted/40 p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={`mt-2 text-2xl font-bold tabular-nums text-foreground ${valorClass ?? ""}`}>
        {valor}
      </div>
      <div className="mt-1 text-xs">{sub}</div>
    </Card>
  );
}
