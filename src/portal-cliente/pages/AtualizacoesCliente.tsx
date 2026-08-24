// Atualizações publicadas (todas)
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { usePortalCliente } from "../usePortalCliente";

export default function AtualizacoesCliente() {
  const { clienteId } = usePortalCliente();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("cliente_portal_atualizacoes").select("*")
        .eq("cliente_id", clienteId).eq("publicado", true).order("publicado_em", { ascending: false });
      setItems((data as any[]) ?? []); setLoading(false);
    })();
  }, [clienteId]);
  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="font-display text-2xl">Atualizações</h1>
      {items.length === 0
        ? <Card className="p-8 text-center text-sm text-muted-foreground">Sem novidades por enquanto.</Card>
        : items.map(a => (
          <Card key={a.id} className="p-5 space-y-2">
            <p className="text-xs text-muted-foreground">{a.publicado_em && new Date(a.publicado_em).toLocaleString("pt-BR")}</p>
            <h3 className="font-display text-lg">{a.titulo}</h3>
            <p className="text-sm whitespace-pre-wrap">{a.texto_simples}</p>
            {a.proximos_passos && <p className="text-sm pt-2 border-t border-border/40"><strong>Próximos passos:</strong> {a.proximos_passos}</p>}
          </Card>
        ))}
    </div>
  );
}
