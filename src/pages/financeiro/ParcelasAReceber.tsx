import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Loader2, Search, Wallet, ExternalLink, CheckCircle2, FileDown, FileText } from "lucide-react";
import { exportarCsv, exportarPdf } from "./exportar-financeiro";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatBRL, formatDate } from "@/lib/format";
import { toast } from "sonner";

interface Parcela {
  id: string;
  numero_parcela: number;
  valor: number;
  data_vencimento: string;
  status: string;
  contrato_id: string;
  cliente_id: string;
  cliente_nome?: string;
}

export default function ParcelasAReceber() {
  const { user, hasPermission } = useAuth();
  const podeRegistrar = hasPermission("financeiro", "criar");
  const [rows, setRows] = useState<Parcela[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("todos");
  const [periodo, setPeriodo] = useState("365");
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [refreshKey, setRefreshKey] = useState(0);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    data_pagamento: new Date().toISOString().slice(0, 10),
    forma_pagamento: "pix",
    tipo_pagamento: "regular",
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const hojeIso = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("honorarios_parcelas")
        .select("id, numero_parcela, valor, data_vencimento, status, contrato_id, cliente_id, clientes:cliente_id(nome)")
        .or(`status.eq.atrasado,and(status.eq.pendente,data_vencimento.lte.${new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10)})`)
        .order("data_vencimento", { ascending: true })
        .limit(500);
      if (!alive) return;
      const list = ((data as any[]) ?? []).map(r => ({
        ...r,
        cliente_nome: r.clientes?.nome,
        status: r.status === "pendente" && r.data_vencimento < hojeIso ? "atrasado" : r.status,
      }));
      setRows(list);
      setSelecionadas(new Set());
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [refreshKey]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const limite = periodo === "todos"
      ? null
      : new Date(Date.now() + parseInt(periodo) * 24 * 3600 * 1000).toISOString().slice(0, 10);
    return rows.filter(r => {
      if (status !== "todos" && r.status !== status) return false;
      if (q && !r.cliente_nome?.toLowerCase().includes(q)) return false;
      if (limite && r.data_vencimento > limite) return false;
      return true;
    });
  }, [rows, search, status, periodo]);

  const totalSelecionado = useMemo(
    () => filtered.filter(p => selecionadas.has(p.id)).reduce((s, p) => s + Number(p.valor), 0),
    [filtered, selecionadas]
  );

  const toggle = (id: string) => {
    setSelecionadas(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const toggleAll = () => {
    if (filtered.every(p => selecionadas.has(p.id))) setSelecionadas(new Set());
    else setSelecionadas(new Set(filtered.map(p => p.id)));
  };

  async function darBaixaSelecionadas() {
    const alvos = filtered.filter(p => selecionadas.has(p.id));
    if (!alvos.length) return;
    setSaving(true);
    const payload = alvos.map(p => ({
      contrato_id: p.contrato_id,
      cliente_id: p.cliente_id,
      parcela_id: p.id,
      valor_recebido: Number(p.valor),
      data_pagamento: form.data_pagamento,
      forma_pagamento: form.forma_pagamento,
      tipo_pagamento: form.tipo_pagamento,
      observacao: `Baixa em lote (${alvos.length} parcelas)`,
      registrado_por: user?.id,
    }));
    const { error } = await supabase.from("honorarios_pagamentos").insert(payload);
    setSaving(false);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success(`${alvos.length} parcela${alvos.length !== 1 ? "s" : ""} baixada${alvos.length !== 1 ? "s" : ""}.`);
    setDialogOpen(false);
    setRefreshKey(k => k + 1);
  }

  const allChecked = filtered.length > 0 && filtered.every(p => selecionadas.has(p.id));
  const totalFiltrado = filtered.reduce((s, r) => s + Number(r.valor), 0);

  const headersExp = ["Vencimento", "Cliente", "Parcela #", "Status", "Valor (R$)"];
  function linhasExport() {
    return filtered.map(r => [
      formatDate(r.data_vencimento),
      r.cliente_nome ?? "",
      r.numero_parcela,
      r.status,
      Number(r.valor).toFixed(2).replace(".", ","),
    ]);
  }
  function exportCsv() {
    exportarCsv(`parcelas-${new Date().toISOString().slice(0,10)}`, headersExp, linhasExport());
  }
  async function exportPdf() {
    const periodoLabel = ({
      "30": "Próximos 30 dias", "90": "Próximos 90 dias", "180": "Próximos 180 dias",
      "365": "Próximo ano", "todos": "Todos",
    } as Record<string, string>)[periodo];
    await exportarPdf({
      titulo: "Parcelas a receber",
      subtitulo: `Status: ${status} · Período: ${periodoLabel}`,
      headers: headersExp,
      rows: linhasExport(),
      filename: `parcelas-${new Date().toISOString().slice(0,10)}`,
      totalLabel: `Total (${filtered.length} parcela${filtered.length !== 1 ? "s" : ""})`,
      totalValor: totalFiltrado,
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Parcelas a receber" description="Selecione várias parcelas para dar baixa de uma só vez">
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
            <Input placeholder="Buscar por cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="pendente">Pendentes</SelectItem>
              <SelectItem value="atrasado">Atrasadas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Próximos 30 dias</SelectItem>
              <SelectItem value="90">Próximos 90 dias</SelectItem>
              <SelectItem value="180">Próximos 180 dias</SelectItem>
              <SelectItem value="365">Próximo ano</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm text-muted-foreground">
          {selecionadas.size > 0
            ? <><strong className="text-foreground">{selecionadas.size}</strong> selecionada{selecionadas.size !== 1 ? "s" : ""} · {formatBRL(totalSelecionado)}</>
            : <>{filtered.length} parcela{filtered.length !== 1 ? "s" : ""}</>}
        </div>
        {podeRegistrar && (
          <Button variant="gold" disabled={selecionadas.size === 0} onClick={() => setDialogOpen(true)}>
            <CheckCircle2 className="w-4 h-4" /> Dar baixa nas selecionadas
          </Button>
        )}
      </Card>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Wallet className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">Nenhuma parcela pendente.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <Checkbox checked={allChecked} onCheckedChange={toggleAll} aria-label="Selecionar todas" />
              <span>Selecionar todas ({filtered.length})</span>
            </div>
            <div className="divide-y">
              {filtered.map((p) => {
                const checked = selecionadas.has(p.id);
                const atrasado = p.status === "atrasado";
                return (
                  <div key={p.id} className="flex items-center gap-3 p-4 hover:bg-muted/40 transition-colors">
                    <Checkbox checked={checked} onCheckedChange={() => toggle(p.id)} aria-label="Selecionar" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{p.cliente_nome ?? "—"}</span>
                        <Badge
                          variant="outline"
                          className={atrasado
                            ? "bg-destructive/10 text-destructive border-destructive/30"
                            : "bg-amber-500/15 text-amber-600 border-amber-500/30"}
                        >
                          {atrasado ? "atrasado" : "pendente"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Parc. #{p.numero_parcela} · venc. {formatDate(p.data_vencimento)}
                      </p>
                    </div>
                    <span className="font-mono font-medium shrink-0">{formatBRL(Number(p.valor))}</span>
                    <Link to={`/financeiro/contratos/${p.contrato_id}`} title="Abrir contrato">
                      <ExternalLink className="w-4 h-4 text-muted-foreground" />
                    </Link>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Dar baixa em {selecionadas.size} parcela{selecionadas.size !== 1 ? "s" : ""}</DialogTitle>
            <DialogDescription>
              Total: <strong>{formatBRL(totalSelecionado)}</strong>. Cada parcela será registrada como paga pelo seu valor original.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <Label>Data *</Label>
                <Input type="date" value={form.data_pagamento} onChange={(e) => setForm(f => ({ ...f, data_pagamento: e.target.value }))} />
              </div>
              <div>
                <Label>Forma</Label>
                <Select value={form.forma_pagamento} onValueChange={(v) => setForm(f => ({ ...f, forma_pagamento: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="transferencia">Transferência</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="cartao">Cartão</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={form.tipo_pagamento} onValueChange={(v) => setForm(f => ({ ...f, tipo_pagamento: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="regular">Regular</SelectItem>
                    <SelectItem value="exito">Êxito</SelectItem>
                    <SelectItem value="adiantamento">Adiantamento</SelectItem>
                    <SelectItem value="acordo">Acordo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button variant="gold" onClick={darBaixaSelecionadas} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Confirmar baixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
