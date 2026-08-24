import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/layout/PageHeader";
import { Plus, Search, FileSignature, Library } from "lucide-react";
import { CATEGORIAS_LABEL, DocPeca, DocPecaStatus, STATUS_COR, STATUS_LABEL } from "./types";
import { toast } from "@/hooks/use-toast";

interface PecaComRel extends DocPeca {
  cliente?: { nome: string } | null;
  processo?: { numero_cnj: string | null; numero_cnj_limpo: string | null } | null;
}

export default function PecasList() {
  const { hasPermission } = useAuth();
  const podeCriar = hasPermission("documentos", "criar");

  const [pecas, setPecas] = useState<PecaComRel[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("doc_pecas")
        .select("*, cliente:clientes(nome), processo:processos(numero_cnj, numero_cnj_limpo)")
        .order("atualizado_em", { ascending: false });
      if (error) {
        toast({ title: "Erro ao carregar peças", description: error.message, variant: "destructive" });
      } else {
        setPecas((data ?? []) as any);
      }
      setCarregando(false);
    })();
  }, []);

  const filtradas = pecas.filter((p) => {
    if (filtroStatus !== "todos" && p.status !== filtroStatus) return false;
    if (busca) {
      const t = `${p.titulo} ${p.cliente?.nome ?? ""} ${p.processo?.numero_cnj ?? ""}`.toLowerCase();
      if (!t.includes(busca.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Produção Jurídica"
        description="Petições, contratos e documentos elaborados a partir dos modelos"
      >
        <Button asChild variant="outline">
          <Link to="/documentos/modelos">
            <Library className="w-4 h-4 mr-2" /> Modelos
          </Link>
        </Button>
        {podeCriar && (
          <Button asChild>
            <Link to="/documentos/pecas/novo">
              <Plus className="w-4 h-4 mr-2" /> Nova peça
            </Link>
          </Button>
        )}
      </PageHeader>

      <Card className="p-4 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por título, cliente ou processo..." className="pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="md:w-56"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos status</SelectItem>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>

      {carregando ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : filtradas.length === 0 ? (
        <Card className="p-12 text-center">
          <FileSignature className="w-12 h-12 mx-auto text-muted-foreground/40" />
          <p className="mt-3 text-muted-foreground">
            {pecas.length === 0 ? "Nenhuma peça produzida ainda." : "Nenhuma peça corresponde aos filtros."}
          </p>
          {podeCriar && pecas.length === 0 && (
            <Button asChild className="mt-4">
              <Link to="/documentos/pecas/novo"><Plus className="w-4 h-4 mr-2" /> Criar primeira peça</Link>
            </Button>
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y">
            {filtradas.map((p) => (
              <Link
                key={p.id}
                to={`/documentos/pecas/${p.id}`}
                className="grid grid-cols-12 gap-3 p-4 hover:bg-muted/40 transition-colors"
              >
                <div className="col-span-12 md:col-span-5 min-w-0">
                  <div className="font-medium truncate">{p.titulo}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {p.cliente?.nome ?? "—"} · {CATEGORIAS_LABEL[p.categoria]}
                  </div>
                </div>
                <div className="col-span-6 md:col-span-3 text-sm text-muted-foreground truncate self-center font-mono">
                  {p.processo?.numero_cnj ?? p.processo?.numero_cnj_limpo ?? "—"}
                </div>
                <div className="col-span-3 md:col-span-2 self-center">
                  <Badge className={STATUS_COR[p.status as DocPecaStatus]} variant="outline">
                    {STATUS_LABEL[p.status as DocPecaStatus]}
                  </Badge>
                </div>
                <div className="col-span-3 md:col-span-2 text-xs text-muted-foreground self-center text-right">
                  v{p.versao_atual} · {new Date(p.atualizado_em).toLocaleDateString("pt-BR")}
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
