import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Briefcase, Plus, ExternalLink } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface Processo {
  id: string;
  numero_cnj: string | null;
  area_direito: string | null;
  status: string;
  tipo: string;
  tipo_acao: string | null;
}

export default function ProcessosTab({ processos, clienteId }: { processos: Processo[]; clienteId: string }) {
  const { hasPermission } = useAuth();
  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg">Processos vinculados</h3>
        {hasPermission("processos", "criar") && (
          <Button size="sm" variant="outline" asChild>
            <Link to={`/processos/novo?cliente=${clienteId}`}><Plus className="w-4 h-4" /> Novo processo</Link>
          </Button>
        )}
      </div>
      {processos.length === 0 ? (
        <p className="text-center py-10 text-muted-foreground text-sm">Nenhum processo vinculado.</p>
      ) : (
        <div className="space-y-2">
          {processos.map((p) => (
            <Link key={p.id} to={`/processos/${p.id}`}
              className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/40 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <Briefcase className="w-4 h-4 text-gold shrink-0" />
                <div className="min-w-0">
                  <p className="font-mono text-sm font-medium truncate">{p.numero_cnj ?? p.tipo_acao ?? "Sem identificação"}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.area_direito ?? "—"} • {p.tipo}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className="capitalize">{p.status}</Badge>
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
