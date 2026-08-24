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
import { ArrowLeft, Loader2, Search, Wallet, ExternalLink, Trash2, FileDown, FileText } from "lucide-react";
import { exportarCsv, exportarPdf } from "./exportar-financeiro";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatBRL, formatDate } from "@/lib/format";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Row {
  id: string;
  data_pagamento: string;
  valor_recebido: number;
  forma_pagamento: string;
  tipo_pagamento: string;
  contrato_id: string;
  cliente_id: string;
  observacao: string | null;
  cliente_nome?: string;
}

export default function PagamentosList() {
  const { hasPermission } = useAuth();
  const podeExcluir = hasPermission("financeiro", "excluir");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tipo, setTipo] = useState("todos");
  const [periodo, setPeriodo] = useState("90");
  const [refreshKey, setRefreshKey] = useState(0);

  async function excluirPagamento(p: Row) {
    // Tenta reverter parcela vinculada para "pendente"
    if (p.contrato_id) {
      const { data: parc } = await supabase
        .from("honorarios_pagamentos").select("parcela_id").eq("id", p.id).maybeSingle();
      const parcelaId = (parc as any)?.parcela_id;
      if (parcelaId) {
        await supabase.from("honorarios_parcelas").update({ status: "pendente" }).eq("id", parcelaId);
      }
    }
    const { data: removido, error } = await supabase
      .from("honorarios_pagamentos")
      .delete()
      .eq("id", p.id)
      .select("id")
      .maybeSingle();
    if (error) { toast.error(error.message); return; }
    if (!removido) { toast.error("Pagamento não removido. Verifique se seu perfil tem permissão para excluir no Financeiro."); return; }
    toast.success("Pagamento excluído. Parcela reaberta e repasses vinculados removidos.");
    setRefreshKey(k => k + 1);
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      let q = supabase
        .from("honorarios_pagamentos")
        .select("id, data_pagamento, valor_recebido, forma_pagamento, tipo_pagamento, contrato_id, cliente_id, observacao, clientes:cliente_id(nome)")
        .order("data_pagamento", { ascending: false })
        .limit(500);
      if (periodo !== "todos") {
        const dias = parseInt(periodo);
        const desde = new Date(Date.now() - dias * 24 * 3600 * 1000).toISOString().slice(0, 10);
        q = q.gte("data_pagamento", desde);
      }
      const { data } = await q;
      if (!alive) return;
      setRows(((data as any[]) ?? []).map(r => ({ ...r, cliente_nome: r.clientes?.nome })));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [periodo, refreshKey]);

  const filtered = useMemo(() => {
    const qstr = search.toLowerCase().trim();
    return rows.filter(r => {
      if (tipo !== "todos" && r.tipo_pagamento !== tipo) return false;
      if (qstr && !r.cliente_nome?.toLowerCase().includes(qstr)) return false;
      return true;
    });
  }, [rows, search, tipo]);

  const total = filtered.reduce((s, r) => s + Number(r.valor_recebido), 0);

  const periodoLabel = ({
    "30": "Últimos 30 dias", "90": "Últimos 90 dias", "180": "Últimos 180 dias",
    "365": "Último ano", "todos": "Todos os períodos",
  } as Record<string, string>)[periodo];

  function linhasExport() {
    return filtered.map(r => [
      formatDate(r.data_pagamento),
      r.cliente_nome ?? "",
      r.tipo_pagamento ?? "",
      r.forma_pagamento ?? "",
      Number(r.valor_recebido).toFixed(2).replace(".", ","),
      r.observacao ?? "",
    ]);
  }
  const headersExp = ["Data", "Cliente", "Tipo", "Forma", "Valor (R$)", "Observação"];

  function exportCsv() {
    exportarCsv(`pagamentos-${new Date().toISOString().slice(0,10)}`, headersExp, linhasExport());
  }
  async function exportPdf() {
    await exportarPdf({
      titulo: "Pagamentos recebidos",
      subtitulo: `Período: ${periodoLabel} · Tipo: ${tipo === "todos" ? "todos" : tipo}`,
      headers: headersExp,
      rows: linhasExport(),
      filename: `pagamentos-${new Date().toISOString().slice(0,10)}`,
      totalLabel: `Total (${filtered.length} registro${filtered.length !== 1 ? "s" : ""})`,
      totalValor: total,
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Pagamentos recebidos" description="Histórico de todos os pagamentos do escritório">
        <Button asChild variant="ghost" size="sm">
          <Link to="/financeiro"><ArrowLeft className="w-4 h-4" /> Voltar</Link>
        </Button>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
          <FileDown className="w-4 h-4 mr-1" /> CSV
        </Button>
        <Button variant="outline" size="sm" onClick={exportPdf} disabled={filtered.length === 0}>
          <FileText className="w-4 h-4 mr-1" /> PDF
        </Button>
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
              <SelectItem value="regular">Regular</SelectItem>
              <SelectItem value="exito">Êxito</SelectItem>
              <SelectItem value="adiantamento">Adiantamento</SelectItem>
              <SelectItem value="acordo">Acordo</SelectItem>
            </SelectContent>
          </Select>
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
              <SelectItem value="180">Últimos 180 dias</SelectItem>
              <SelectItem value="365">Último ano</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="p-4 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {filtered.length} pagamento{filtered.length !== 1 ? "s" : ""}
        </div>
        <div>
          <span className="text-xs text-muted-foreground mr-2">Total:</span>
          <span className="font-display text-xl text-success">{formatBRL(total)}</span>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Wallet className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum pagamento no período.</p>
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-4 gap-3 hover:bg-muted/40 transition-colors">
                <Link to={`/financeiro/contratos/${p.contrato_id}`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{p.cliente_nome ?? "—"}</span>
                    <Badge variant="outline">{p.tipo_pagamento}</Badge>
                    <Badge variant="outline" className="text-[10px]">{p.forma_pagamento}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{formatDate(p.data_pagamento)}</p>
                </Link>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-medium text-success">{formatBRL(Number(p.valor_recebido))}</span>
                  <Link to={`/financeiro/contratos/${p.contrato_id}`}>
                    <ExternalLink className="w-4 h-4 text-muted-foreground" />
                  </Link>
                  {podeExcluir && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8" title="Excluir pagamento">
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir pagamento?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta ação remove o pagamento de <strong>{formatBRL(Number(p.valor_recebido))}</strong> de{" "}
                            <strong>{p.cliente_nome ?? "—"}</strong> em {formatDate(p.data_pagamento)}.
                            <br /><br />
                            A parcela vinculada será reaberta como <strong>pendente</strong> e os repasses gerados a partir
                            deste pagamento serão removidos automaticamente. Use somente para corrigir lançamentos duplicados.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => excluirPagamento(p)} className="bg-destructive hover:bg-destructive/90">
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
