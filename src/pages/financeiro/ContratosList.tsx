import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Loader2, FileText, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatBRL, formatDate } from "@/lib/format";

const TIPO_LABEL: Record<string, string> = {
  fixo: "Fixo", exito: "Êxito", misto: "Misto", mensalidade: "Mensalidade",
};

const STATUS_CLASS: Record<string, string> = {
  ativo: "bg-success/15 text-success border-success/30",
  quitado: "bg-muted text-muted-foreground border-muted-foreground/30",
  inadimplente: "bg-destructive/10 text-destructive border-destructive/30",
  cancelado: "bg-muted text-muted-foreground border-muted-foreground/30",
  suspenso: "bg-amber-500/15 text-amber-600 border-amber-500/30",
};

interface Row {
  id: string;
  tipo: string;
  status: string;
  valor_fixo: number | null;
  percentual_exito: number | null;
  total_parcelas: number | null;
  data_assinatura: string | null;
  cliente_id: string;
  processo_id: string | null;
  cliente_nome?: string;
}

export default function ContratosList() {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tipo, setTipo] = useState<string>("todos");
  const [status, setStatus] = useState<string>("todos");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("honorarios_contratos")
        .select("id, tipo, status, valor_fixo, percentual_exito, total_parcelas, data_assinatura, cliente_id, processo_id, clientes:cliente_id(nome)")
        .order("criado_em", { ascending: false });
      if (!alive) return;
      setRows(((data as any[]) ?? []).map(r => ({ ...r, cliente_nome: r.clientes?.nome })));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return rows.filter(r => {
      if (tipo !== "todos" && r.tipo !== tipo) return false;
      if (status !== "todos" && r.status !== status) return false;
      if (q && !r.cliente_nome?.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, tipo, status]);

  return (
    <div className="space-y-6">
      <PageHeader title="Contratos de honorários" description="Gestão de todos os contratos do escritório">
        <Button asChild variant="ghost" size="sm">
          <Link to="/financeiro">← Voltar</Link>
        </Button>
        {hasPermission("financeiro", "criar") && (
          <Button asChild variant="gold">
            <Link to="/financeiro/contratos/novo">
              <Plus className="w-4 h-4" /> Novo
            </Link>
          </Button>
        )}
      </PageHeader>

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              <SelectItem value="fixo">Fixo</SelectItem>
              <SelectItem value="exito">Êxito</SelectItem>
              <SelectItem value="misto">Misto</SelectItem>
              <SelectItem value="mensalidade">Mensalidade</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="ativo">Ativo</SelectItem>
              <SelectItem value="quitado">Quitado</SelectItem>
              <SelectItem value="inadimplente">Inadimplente</SelectItem>
              <SelectItem value="suspenso">Suspenso</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum contrato encontrado.</p>
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((c) => (
              <Link
                key={c.id}
                to={`/financeiro/contratos/${c.id}`}
                className="flex items-center justify-between p-4 gap-4 hover:bg-muted/40 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{c.cliente_nome ?? "—"}</span>
                    <Badge variant="outline" className={STATUS_CLASS[c.status] ?? ""}>{c.status}</Badge>
                    <Badge variant="outline">{TIPO_LABEL[c.tipo] ?? c.tipo}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {c.valor_fixo != null && <>Valor: {formatBRL(Number(c.valor_fixo))} · </>}
                    {c.percentual_exito != null && <>Êxito: {Number(c.percentual_exito)}% · </>}
                    {c.total_parcelas != null && c.total_parcelas > 1 && <>{c.total_parcelas}x · </>}
                    Assinado em {formatDate(c.data_assinatura)}
                  </p>
                </div>
                <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
