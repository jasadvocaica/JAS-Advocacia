// Lista de processos do cliente — apenas os visíveis
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Briefcase, ChevronRight } from "lucide-react";
import { usePortalCliente } from "../usePortalCliente";
import { maskCnj } from "@/lib/mask-cnj";

interface Processo {
  id: string;
  numero_cnj: string | null;
  tipo_acao: string | null;
  area_direito: string | null;
  status: string;
  fase_atual: string | null;
}

export default function ProcessosCliente() {
  const { clienteId } = usePortalCliente();
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: procs } = await supabase
        .from("processos")
        .select("id, numero_cnj, tipo_acao, area_direito, status, fase_atual")
        .eq("cliente_id", clienteId)
        .order("criado_em", { ascending: false });

      // filtra pelos que estão visíveis (RLS + tabela liberação)
      const { data: libs } = await supabase
        .from("cliente_portal_processos")
        .select("processo_id, visivel")
        .eq("cliente_id", clienteId);
      const oculto = new Set((libs as any[] ?? []).filter(l => !l.visivel).map(l => l.processo_id));
      setProcessos((procs as any[] ?? []).filter(p => !oculto.has(p.id)));
      setLoading(false);
    })();
  }, [clienteId]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="font-display text-2xl">Meus processos</h1>
      {processos.length === 0
        ? <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum processo disponível no momento.</Card>
        : <div className="space-y-2">
            {processos.map(p => (
              <Link key={p.id} to={`/portal-cliente/processos/${p.id}`}>
                <Card className="p-4 hover:border-gold/40 hover:shadow-sm transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center">
                      <Briefcase className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-sm truncate">{maskCnj(p.numero_cnj)}</p>
                      <p className="text-xs text-muted-foreground truncate">{p.tipo_acao || p.area_direito || "—"}</p>
                    </div>
                    <Badge variant="outline" className="capitalize">{p.status.replace(/_/g, " ")}</Badge>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>}
    </div>
  );
}
