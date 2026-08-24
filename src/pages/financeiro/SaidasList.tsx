import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, Package, CheckCircle2, XCircle, Clock, ArrowLeft, Trash2, Wallet, HandCoins, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatBRL, formatDate } from "@/lib/format";
import { toast } from "sonner";

type Saida = {
  id: string;
  descricao: string;
  categoria: string;
  valor: number;
  data_competencia: string;
  data_pagamento: string | null;
  forma_pagamento: string | null;
  status: "pendente" | "pago" | "cancelado";
  fornecedor: string | null;
  suprimento_id: string | null;
  observacao: string | null;
  origem: "manual" | "repasse" | "comissao";
  origem_id: string | null;
};

const CATEGORIAS = [
  "suprimentos","equipamentos","aluguel","servicos","impostos","salarios",
  "marketing","tecnologia","viagem","manutencao","outros",
];

const STATUS_BADGE: Record<string, string> = {
  pendente: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  pago: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  cancelado: "bg-muted text-muted-foreground border-border",
};

export default function SaidasList() {
  const { hasPermission } = useAuth();
  const podeCriar = hasPermission("financeiro", "criar");
  const podeEditar = hasPermission("financeiro", "editar");
  const podeExcluir = hasPermission("financeiro", "excluir");
  const [loading, setLoading] = useState(true);
  const [saidas, setSaidas] = useState<Saida[]>([]);
  const [suprimentos, setSuprimentos] = useState<{ id: string; nome: string }[]>([]);
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [filtroOrigem, setFiltroOrigem] = useState<string>("todos");
  const [filtroMes, setFiltroMes] = useState<string>(new Date().toISOString().slice(0, 7));
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    descricao: "", categoria: "suprimentos", valor: "", data_competencia: new Date().toISOString().slice(0, 10),
    data_pagamento: "", forma_pagamento: "", status: "pendente", fornecedor: "", suprimento_id: "", observacao: "",
  });

  async function carregar() {
    setLoading(true);
    const inicio = `${filtroMes}-01`;
    const [yyyy, mm] = filtroMes.split("-").map(Number);
    const fim = new Date(yyyy, mm, 0).toISOString().slice(0, 10);
    let q = supabase.from("financeiro_saidas").select("*")
      .gte("data_competencia", inicio).lte("data_competencia", fim)
      .order("data_competencia", { ascending: false });
    if (filtroStatus !== "todos") q = q.eq("status", filtroStatus as any);
    if (filtroOrigem !== "todos") q = q.eq("origem", filtroOrigem as any);
    const { data } = await q;
    setSaidas((data ?? []) as any);
    const { data: sups } = await supabase.from("financeiro_suprimentos").select("id, nome").eq("ativo", true);
    setSuprimentos(sups ?? []);
    setLoading(false);
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [filtroStatus, filtroOrigem, filtroMes]);

  const total = saidas.reduce((s, x) => s + Number(x.valor), 0);
  const totalPago = saidas.filter(s => s.status === "pago").reduce((s, x) => s + Number(x.valor), 0);
  const totalPendente = saidas.filter(s => s.status === "pendente").reduce((s, x) => s + Number(x.valor), 0);
  const totalManual = saidas.filter(s => s.origem === "manual").reduce((s, x) => s + Number(x.valor), 0);
  const totalRepasses = saidas.filter(s => s.origem === "repasse").reduce((s, x) => s + Number(x.valor), 0);
  const totalComissoes = saidas.filter(s => s.origem === "comissao").reduce((s, x) => s + Number(x.valor), 0);

  async function salvar() {
    if (!form.descricao || !form.valor) {
      toast.error("Descrição e valor são obrigatórios");
      return;
    }
    const payload: any = {
      descricao: form.descricao,
      categoria: form.categoria,
      valor: Number(form.valor),
      data_competencia: form.data_competencia,
      data_pagamento: form.data_pagamento || null,
      forma_pagamento: form.forma_pagamento || null,
      status: form.status,
      fornecedor: form.fornecedor || null,
      suprimento_id: form.suprimento_id || null,
      observacao: form.observacao || null,
    };
    const { error } = await supabase.from("financeiro_saidas").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Saída registrada");
    setOpen(false);
    setForm({ ...form, descricao: "", valor: "", observacao: "", fornecedor: "" });
    carregar();
  }

  async function marcarPago(id: string) {
    const { error } = await supabase.from("financeiro_saidas")
      .update({ status: "pago", data_pagamento: new Date().toISOString().slice(0, 10) })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Marcado como pago");
    carregar();
  }

  async function excluir(id: string) {
    if (!confirm("Excluir esta saída?")) return;
    const { error } = await supabase.from("financeiro_saidas").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Saída excluída");
    carregar();
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Saídas" description="Despesas e pagamentos do escritório">
        <Button asChild variant="ghost" size="sm">
          <Link to="/financeiro"><ArrowLeft className="w-4 h-4" /> Financeiro</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/financeiro/suprimentos"><Package className="w-4 h-4" /> Suprimentos</Link>
        </Button>
        {podeCriar && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="gold"><Plus className="w-4 h-4" /> Nova saída</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Nova saída</DialogTitle></DialogHeader>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <Label>Descrição *</Label>
                  <Input value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} />
                </div>
                <div>
                  <Label>Categoria</Label>
                  <Select value={form.categoria} onValueChange={v => setForm({ ...form, categoria: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Valor (R$) *</Label>
                  <Input type="number" step="0.01" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} />
                </div>
                <div>
                  <Label>Data competência</Label>
                  <Input type="date" value={form.data_competencia} onChange={e => setForm({ ...form, data_competencia: e.target.value })} />
                </div>
                <div>
                  <Label>Data pagamento</Label>
                  <Input type="date" value={form.data_pagamento} onChange={e => setForm({ ...form, data_pagamento: e.target.value })} />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="pago">Pago</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Forma de pagamento</Label>
                  <Input value={form.forma_pagamento} onChange={e => setForm({ ...form, forma_pagamento: e.target.value })} placeholder="PIX, débito..." />
                </div>
                <div>
                  <Label>Fornecedor</Label>
                  <Input value={form.fornecedor} onChange={e => setForm({ ...form, fornecedor: e.target.value })} />
                </div>
                <div>
                  <Label>Vincular a suprimento</Label>
                  <Select value={form.suprimento_id || "_none"} onValueChange={v => setForm({ ...form, suprimento_id: v === "_none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Nenhum</SelectItem>
                      {suprimentos.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label>Observação</Label>
                  <Textarea value={form.observacao} onChange={e => setForm({ ...form, observacao: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button variant="gold" onClick={salvar}>Salvar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiCard icon={<Clock className="w-3.5 h-3.5 text-amber-600" />} label="Pendente" value={formatBRL(totalPendente)} />
        <KpiCard icon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />} label="Pago" value={formatBRL(totalPago)} />
        <KpiCard icon={<XCircle className="w-3.5 h-3.5 text-gold" />} label="Total" value={formatBRL(total)} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard icon={<Wallet className="w-3.5 h-3.5 text-muted-foreground" />} label="Manuais" value={formatBRL(totalManual)} />
        <KpiCard icon={<HandCoins className="w-3.5 h-3.5 text-gold-dark" />} label="Repasses (parceiros)" value={formatBRL(totalRepasses)} />
        <KpiCard icon={<Users className="w-3.5 h-3.5 text-primary" />} label="Comissões (equipe)" value={formatBRL(totalComissoes)} />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-end mb-4">
          <div>
            <Label className="text-xs">Mês de competência</Label>
            <Input type="month" value={filtroMes} onChange={e => setFiltroMes(e.target.value)} className="w-44" />
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Origem</Label>
            <Select value={filtroOrigem} onValueChange={setFiltroOrigem}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="repasse">Repasses</SelectItem>
                <SelectItem value="comissao">Comissões</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : saidas.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhuma saída no período.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Competência</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {saidas.map(s => {
                const espelhada = s.origem !== "manual";
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span>{s.descricao}</span>
                        {s.origem === "repasse" && (
                          <Badge variant="outline" className="bg-gold/10 text-gold-dark border-gold/30 text-[10px]">repasse</Badge>
                        )}
                        {s.origem === "comissao" && (
                          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[10px]">comissão</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="capitalize">{s.categoria}</TableCell>
                    <TableCell>{s.fornecedor ?? "—"}</TableCell>
                    <TableCell>{formatDate(s.data_competencia)}</TableCell>
                    <TableCell className="text-right font-mono">{formatBRL(Number(s.valor))}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_BADGE[s.status]}>{s.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {espelhada ? (
                        <span className="text-[11px] text-muted-foreground">editar na origem</span>
                      ) : (
                        <>
                          {podeEditar && s.status === "pendente" && (
                            <Button size="sm" variant="ghost" onClick={() => marcarPago(s.id)}>
                              <CheckCircle2 className="w-3.5 h-3.5" /> Pagar
                            </Button>
                          )}
                          {podeExcluir && (
                            <Button size="sm" variant="ghost" onClick={() => excluir(s.id)}>
                              <Trash2 className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          )}
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <p className="font-display text-2xl mt-1">{value}</p>
    </Card>
  );
}
