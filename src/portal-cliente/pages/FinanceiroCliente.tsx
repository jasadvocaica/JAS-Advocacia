import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { usePortalCliente } from "../usePortalCliente";

export default function FinanceiroCliente() {
  const { clienteId } = usePortalCliente();
  const [contratos, setContratos] = useState<any[]>([]);
  const [parcelas, setParcelas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const { data: c } = await supabase.from("honorarios_contratos").select("*").eq("cliente_id", clienteId);
      const ids = (c as any[] ?? []).map(x => x.id);
      const { data: p } = ids.length
        ? await supabase.from("honorarios_parcelas").select("*").in("contrato_id", ids).order("data_vencimento")
        : { data: [] };
      setContratos((c as any[]) ?? []); setParcelas((p as any[]) ?? []); setLoading(false);
    })();
  }, [clienteId]);
  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  const fmt = (n: number | null) => n ? `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—";
  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="font-display text-2xl">Financeiro</h1>
      {contratos.length === 0
        ? <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum contrato disponível.</Card>
        : contratos.map(c => (
          <Card key={c.id} className="p-5 space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-muted-foreground uppercase">Contrato {c.tipo}</p>
                <p className="font-display text-lg">{fmt(c.valor_fixo)}</p>
              </div>
              <Badge variant="outline" className="capitalize">{c.status}</Badge>
            </div>
            <div className="space-y-1">
              {parcelas.filter(p => p.contrato_id === c.id).map(p => (
                <div key={p.id} className="flex justify-between text-sm py-1.5 border-b border-border/30 last:border-0">
                  <span>Parcela {p.numero_parcela} · venc. {new Date(p.data_vencimento).toLocaleDateString("pt-BR")}</span>
                  <span className="flex items-center gap-2">{fmt(p.valor)}<Badge variant={p.status === "pago" ? "default" : p.status === "atrasado" ? "destructive" : "secondary"} className="text-xs capitalize">{p.status}</Badge></span>
                </div>
              ))}
            </div>
          </Card>
        ))}
    </div>
  );
}
