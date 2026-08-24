import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, HandCoins, ExternalLink, CheckCircle2, Users, FileDown, FileText } from "lucide-react";
import { exportarCsv, exportarPdf } from "./exportar-financeiro";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatBRL, formatDate } from "@/lib/format";
import { toast } from "sonner";

interface Row {
  id: string;
  valor_repasse: number;
  status: string;
  data_repasse: string | null;
  base_calculo: string | null;
  percentual_aplicado: number | null;
  contrato_id: string;
  parceiro_id: string;
  cliente_id: string;
  criado_em: string;
  parceiro_nome?: string;
  cliente_nome?: string;
}

export default function RepassesList() {
  const { isGestor } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("pendente");
  const [parceiro, setParceiro] = useState("todos");
  const [periodo, setPeriodo] = useState("90");
  const [parceiros, setParceiros] = useState<{ id: string; nome: string }[]>([]);
  const [marcandoPago, setMarcandoPago] = useState<Row | null>(null);
  const [formPagar, setFormPagar] = useState({ data_repasse: new Date().toISOString().slice(0,10), forma_repasse: "pix" });

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("honorarios_repasses")
      .select("id, valor_repasse, status, data_repasse, base_calculo, percentual_aplicado, contrato_id, parceiro_id, cliente_id, criado_em, parceiros:parceiro_id(nome), clientes:cliente_id(nome)")
      .order("criado_em", { ascending: false });
    setRows(((data as any[]) ?? []).map(r => ({
      ...r,
      parceiro_nome: r.parceiros?.nome,
      cliente_nome: r.clientes?.nome,
    })));
    setLoading(false);
  };

  useEffect(() => {
    load();
    supabase.from("parceiros").select("id, nome").eq("ativo", true).order("nome")
      .then(({ data }) => setParceiros((data as any[]) ?? []));
  }, []);

  const filtered = useMemo(() => {
    const desde = periodo === "todos"
      ? null
      : new Date(Date.now() - parseInt(periodo) * 24 * 3600 * 1000).toISOString();
    return rows.filter(r => {
      if (status !== "todos" && r.status !== status) return false;
      if (parceiro !== "todos" && r.parceiro_id !== parceiro) return false;
      if (desde) {
        const ref = r.data_repasse ? new Date(r.data_repasse).toISOString() : r.criado_em;
        if (ref < desde) return false;
      }
      return true;
    });
  }, [rows, status, parceiro, periodo]);

  const totalPendente = rows.filter(r => r.status === "pendente").reduce((s, r) => s + Number(r.valor_repasse), 0);
  const totalFiltrado = filtered.reduce((s, r) => s + Number(r.valor_repasse), 0);

  const marcarPago = async () => {
    if (!marcandoPago) return;
    const { error } = await supabase.from("honorarios_repasses").update({
      status: "pago",
      data_repasse: formPagar.data_repasse,
      forma_repasse: formPagar.forma_repasse,
    }).eq("id", marcandoPago.id);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success("Repasse marcado como pago");
    setMarcandoPago(null);
    load();
  };

  const headersExp = ["Data", "Parceiro", "Cliente", "Status", "Base", "% / fixo", "Valor (R$)"];
  function linhasExport() {
    return filtered.map(r => [
      r.data_repasse ? formatDate(r.data_repasse) : formatDate(r.criado_em.slice(0, 10)),
      r.parceiro_nome ?? "",
      r.cliente_nome ?? "",
      r.status,
      r.base_calculo ?? "",
      r.percentual_aplicado != null ? `${r.percentual_aplicado}%` : "fixo",
      Number(r.valor_repasse).toFixed(2).replace(".", ","),
    ]);
  }
  function exportCsv() {
    exportarCsv(`repasses-${new Date().toISOString().slice(0,10)}`, headersExp, linhasExport());
  }
  async function exportPdf() {
    const periodoLabel = ({
      "30": "Últimos 30 dias", "90": "Últimos 90 dias", "180": "Últimos 180 dias",
      "365": "Último ano", "todos": "Todos",
    } as Record<string, string>)[periodo];
    await exportarPdf({
      titulo: "Repasses a parceiros",
      subtitulo: `Status: ${status} · Período: ${periodoLabel}`,
      headers: headersExp,
      rows: linhasExport(),
      filename: `repasses-${new Date().toISOString().slice(0,10)}`,
      totalLabel: `Total (${filtered.length} registro${filtered.length !== 1 ? "s" : ""})`,
      totalValor: totalFiltrado,
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Repasses a parceiros" description="Comissões geradas automaticamente a partir dos pagamentos">
        <Button asChild variant="ghost" size="sm">
          <Link to="/financeiro"><ArrowLeft className="w-4 h-4" /> Voltar</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/financeiro/repasses/por-parceiro">
            <Users className="w-4 h-4 mr-1" /> Resumo por parceiro
          </Link>
        </Button>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
          <FileDown className="w-4 h-4 mr-1" /> CSV
        </Button>
        <Button variant="outline" size="sm" onClick={exportPdf} disabled={filtered.length === 0}>
          <FileText className="w-4 h-4 mr-1" /> PDF
        </Button>
      </PageHeader>

      <div className="grid sm:grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Pendente total</div>
          <p className="font-display text-2xl text-amber-600">{formatBRL(totalPendente)}</p>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Filtro atual</div>
          <p className="font-display text-2xl">{formatBRL(totalFiltrado)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{filtered.length} registros</p>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="pendente">Pendentes</SelectItem>
              <SelectItem value="pago">Pagos</SelectItem>
              <SelectItem value="cancelado">Cancelados</SelectItem>
            </SelectContent>
          </Select>
          <Select value={parceiro} onValueChange={setParceiro}>
            <SelectTrigger className="sm:w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os parceiros</SelectItem>
              {parceiros.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
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

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <HandCoins className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum repasse encontrado.</p>
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((r) => (
              <div key={r.id} className="flex items-center justify-between p-4 gap-3 hover:bg-muted/40 transition-colors">
                <Link to={`/financeiro/contratos/${r.contrato_id}`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{r.parceiro_nome ?? "—"}</span>
                    <Badge variant="outline" className={
                      r.status === "pago" ? "bg-success/15 text-success border-success/30" :
                      r.status === "pendente" ? "bg-amber-500/15 text-amber-600 border-amber-500/30" :
                      "bg-muted text-muted-foreground"
                    }>{r.status}</Badge>
                    <span className="text-xs text-muted-foreground">cliente: {r.cliente_nome ?? "—"}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {r.percentual_aplicado != null ? `${r.percentual_aplicado}%` : "valor fixo"} · {r.base_calculo}
                    {r.data_repasse && <> · pago em {formatDate(r.data_repasse)}</>}
                  </p>
                </Link>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono font-medium">{formatBRL(Number(r.valor_repasse))}</span>
                  {r.status === "pendente" && isGestor && (
                    <Button size="sm" variant="outline" onClick={() => setMarcandoPago(r)}>
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Marcar pago
                    </Button>
                  )}
                  <Link to={`/financeiro/contratos/${r.contrato_id}`}>
                    <ExternalLink className="w-4 h-4 text-muted-foreground" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={!!marcandoPago} onOpenChange={(v) => !v && setMarcandoPago(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar repasse como pago</DialogTitle>
          </DialogHeader>
          {marcandoPago && (
            <div className="space-y-3">
              <p className="text-sm">
                <span className="text-muted-foreground">Parceiro:</span> {marcandoPago.parceiro_nome}
                <br />
                <span className="text-muted-foreground">Valor:</span> <span className="font-mono font-medium">{formatBRL(Number(marcandoPago.valor_repasse))}</span>
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label>Data do repasse</Label>
                  <Input type="date" value={formPagar.data_repasse} onChange={(e) => setFormPagar(f => ({ ...f, data_repasse: e.target.value }))} />
                </div>
                <div>
                  <Label>Forma</Label>
                  <Select value={formPagar.forma_repasse} onValueChange={(v) => setFormPagar(f => ({ ...f, forma_repasse: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="transferencia">Transferência</SelectItem>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMarcandoPago(null)}>Cancelar</Button>
            <Button variant="gold" onClick={marcarPago}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
