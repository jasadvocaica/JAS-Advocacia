import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Loader2, Folder } from "lucide-react";
import { usePortalCliente } from "../usePortalCliente";

export default function DocumentosCliente() {
  const { clienteId } = usePortalCliente();
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("cliente_portal_documentos").select("*")
        .eq("cliente_id", clienteId).order("liberado_em", { ascending: false });
      setDocs((data as any[]) ?? []); setLoading(false);
    })();
  }, [clienteId]);
  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="font-display text-2xl">Documentos</h1>
      {docs.length === 0
        ? <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum documento liberado.</Card>
        : <Card className="divide-y divide-border/40">
          {docs.map(d => (
            <div key={d.id} className="p-4 flex items-center gap-3">
              <Folder className="w-5 h-5 text-muted-foreground" />
              <div className="flex-1"><p className="text-sm">{d.nome_exibicao}</p>
                <p className="text-xs text-muted-foreground">Liberado em {new Date(d.liberado_em).toLocaleDateString("pt-BR")}</p></div>
            </div>
          ))}
        </Card>}
    </div>
  );
}
