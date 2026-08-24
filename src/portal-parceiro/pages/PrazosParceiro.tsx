import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Calendar, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatDate } from "@/lib/format";
import type { PortalParceiroContext } from "../PortalParceiroLayout";

export default function PrazosParceiro() {
  const { parceiro } = useOutletContext<PortalParceiroContext>();
  const [prazos, setPrazos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: vinculos } = await supabase
        .from("processo_parceiros").select("processo_id")
        .eq("parceiro_id", parceiro.id).eq("ativo", true);
      const ids = ((vinculos as any[]) ?? []).map((v) => v.processo_id);
      if (ids.length === 0) { setPrazos([]); setLoading(false); return; }

      const { data } = await supabase
        .from("controladoria_itens")
        .select("id, titulo, data_vencimento, tipo, status, processo_id, processos:processo_id(numero_cnj, nb_inss), clientes:cliente_id(nome)")
        .in("processo_id", ids)
        .in("tipo", ["prazo_fatal", "prazo_processual"])
        .neq("status", "concluido")
        .order("data_vencimento", { ascending: true });

      setPrazos((data as any[]) ?? []);
      setLoading(false);
    })();
  }, [parceiro.id]);

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  // Agrupar por dia
  const grupos = new Map<string, any[]>();
  prazos.forEach((p) => {
    const dia = p.data_vencimento.slice(0, 10);
    if (!grupos.has(dia)) grupos.set(dia, []);
    grupos.get(dia)!.push(p);
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Prazos" description="Vencimentos pendentes" />
      {prazos.length === 0 ? (
        <Card className="p-12 text-center">
          <Calendar className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">Sem prazos pendentes.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {Array.from(grupos.entries()).map(([dia, itens]) => {
            const dDays = Math.ceil((new Date(dia).getTime() - Date.now()) / 86400000);
            const venceu = dDays < 0;
            return (
              <Card key={dia} className={`overflow-hidden ${venceu ? "border-destructive/40" : ""}`}>
                <div className={`px-4 py-2 flex items-center justify-between ${venceu ? "bg-destructive/10" : "bg-muted/30"}`}>
                  <span className="font-medium text-sm">{formatDate(dia)}</span>
                  <Badge variant={venceu ? "destructive" : "outline"}>
                    {venceu ? `Vencido há ${Math.abs(dDays)}d` : dDays === 0 ? "Hoje" : `em ${dDays}d`}
                  </Badge>
                </div>
                <div className="divide-y">
                  {itens.map((p) => (
                    <Link key={p.id} to={`../processos/${p.processo_id}`} className="p-3 flex items-center gap-3 hover:bg-muted/40">
                      {p.tipo === "prazo_fatal" && <AlertTriangle className="w-4 h-4 text-destructive" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.titulo}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {p.processos?.numero_cnj ?? p.processos?.nb_inss} · {p.clientes?.nome}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[10px]">{p.tipo.replace("_", " ")}</Badge>
                    </Link>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
