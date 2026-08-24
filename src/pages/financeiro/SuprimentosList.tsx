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
import { Plus, Loader2, Package, ArrowLeft, Trash2, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatBRL } from "@/lib/format";
import { toast } from "sonner";

type Suprimento = {
  id: string;
  nome: string;
  tipo: string;
  fornecedor: string | null;
  recorrencia: "unico" | "mensal" | "parcelado";
  valor_total: number | null;
  valor_parcela: number | null;
  parcelas_total: number | null;
  parcelas_pagas: number;
  data_inicio: string | null;
  data_fim: string | null;
  dia_vencimento: number | null;
  ativo: boolean;
  observacao: string | null;
};

const TIPOS = ["produto", "equipamento", "servico", "assinatura", "outro"];

export default function SuprimentosList() {
  const { hasPermission } = useAuth();
  const podeCriar = hasPermission("financeiro", "criar");
  const podeEditar = hasPermission("financeiro", "editar");
  const podeExcluir = hasPermission("financeiro", "excluir");
  const [loading, setLoading] = useState(true);
  const [itens, setItens] = useState<Suprimento[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    nome: "", tipo: "produto", fornecedor: "", recorrencia: "unico" as "unico" | "mensal" | "parcelado",
    valor_total: "", valor_parcela: "", parcelas_total: "", data_inicio: "", data_fim: "",
    dia_vencimento: "", observacao: "",
  });

  async function carregar() {
    setLoading(true);
    const { data } = await supabase.from("financeiro_suprimentos").select("*").order("ativo", { ascending: false }).order("created_at", { ascending: false });
    setItens((data ?? []) as any);
    setLoading(false);
  }
  useEffect(() => { carregar(); }, []);

  const totalRecorrenteMensal = itens
    .filter(i => i.ativo && (i.recorrencia === "mensal" || i.recorrencia === "parcelado"))
    .reduce((s, i) => s + Number(i.valor_parcela ?? 0), 0);

  async function salvar() {
    if (!form.nome) { toast.error("Informe o nome"); return; }
    const payload: any = {
      nome: form.nome,
      tipo: form.tipo,
      fornecedor: form.fornecedor || null,
      recorrencia: form.recorrencia,
      valor_total: form.valor_total ? Number(form.valor_total) : null,
      valor_parcela: form.valor_parcela ? Number(form.valor_parcela) : null,
      parcelas_total: form.parcelas_total ? Number(form.parcelas_total) : null,
      data_inicio: form.data_inicio || null,
      data_fim: form.data_fim || null,
      dia_vencimento: form.dia_vencimento ? Number(form.dia_vencimento) : null,
      observacao: form.observacao || null,
    };
    const { error } = await supabase.from("financeiro_suprimentos").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Suprimento cadastrado");
    setOpen(false);
    setForm({ ...form, nome: "", fornecedor: "", valor_total: "", valor_parcela: "", parcelas_total: "", observacao: "" });
    carregar();
  }

  async function alternarAtivo(s: Suprimento) {
    const { error } = await supabase.from("financeiro_suprimentos").update({ ativo: !s.ativo }).eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    carregar();
  }

  async function excluir(id: string) {
    if (!confirm("Excluir este suprimento? As saídas vinculadas serão preservadas.")) return;
    const { error } = await supabase.from("financeiro_suprimentos").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Excluído");
    carregar();
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Suprimentos" description="Itens recorrentes ou parcelados (limpeza, equipamentos, serviços)">
        <Button asChild variant="ghost" size="sm">
          <Link to="/financeiro"><ArrowLeft className="w-4 h-4" /> Financeiro</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/financeiro/saidas"><Wallet className="w-4 h-4" /> Saídas</Link>
        </Button>
        {podeCriar && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="gold"><Plus className="w-4 h-4" /> Novo suprimento</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Novo suprimento</DialogTitle></DialogHeader>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <Label>Nome *</Label>
                  <Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Produtos de limpeza, Notebook Dell..." />
                </div>
                <div>
                  <Label>Tipo</Label>
                  <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TIPOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Recorrência</Label>
                  <Select value={form.recorrencia} onValueChange={v => setForm({ ...form, recorrencia: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unico">Único</SelectItem>
                      <SelectItem value="mensal">Mensal</SelectItem>
                      <SelectItem value="parcelado">Parcelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Fornecedor</Label>
                  <Input value={form.fornecedor} onChange={e => setForm({ ...form, fornecedor: e.target.value })} />
                </div>
                <div>
                  <Label>Dia do vencimento</Label>
                  <Input type="number" min={1} max={31} value={form.dia_vencimento} onChange={e => setForm({ ...form, dia_vencimento: e.target.value })} />
                </div>
                <div>
                  <Label>Valor total (R$)</Label>
                  <Input type="number" step="0.01" value={form.valor_total} onChange={e => setForm({ ...form, valor_total: e.target.value })} />
                </div>
                <div>
                  <Label>Valor da parcela (R$)</Label>
                  <Input type="number" step="0.01" value={form.valor_parcela} onChange={e => setForm({ ...form, valor_parcela: e.target.value })} />
                </div>
                <div>
                  <Label>Nº de parcelas</Label>
                  <Input type="number" value={form.parcelas_total} onChange={e => setForm({ ...form, parcelas_total: e.target.value })} />
                </div>
                <div>
                  <Label>Início</Label>
                  <Input type="date" value={form.data_inicio} onChange={e => setForm({ ...form, data_inicio: e.target.value })} />
                </div>
                <div>
                  <Label>Fim</Label>
                  <Input type="date" value={form.data_fim} onChange={e => setForm({ ...form, data_fim: e.target.value })} />
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

      <Card className="p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <Package className="w-3.5 h-3.5 text-gold" /> Compromisso recorrente / parcelado mensal
        </div>
        <p className="font-display text-2xl mt-1">{formatBRL(totalRecorrenteMensal)}</p>
      </Card>

      <Card className="p-4">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : itens.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhum suprimento cadastrado.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Recorrência</TableHead>
                <TableHead className="text-right">Parcela</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Progresso</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.map(i => (
                <TableRow key={i.id} className={!i.ativo ? "opacity-60" : ""}>
                  <TableCell className="font-medium">{i.nome}</TableCell>
                  <TableCell className="capitalize">{i.tipo}</TableCell>
                  <TableCell>{i.fornecedor ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{i.recorrencia}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">{i.valor_parcela ? formatBRL(Number(i.valor_parcela)) : "—"}</TableCell>
                  <TableCell className="text-right font-mono">{i.valor_total ? formatBRL(Number(i.valor_total)) : "—"}</TableCell>
                  <TableCell>
                    {i.parcelas_total ? `${i.parcelas_pagas}/${i.parcelas_total}` : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {(podeEditar || podeExcluir) && (
                      <>
                        {podeEditar && (
                          <Button size="sm" variant="ghost" onClick={() => alternarAtivo(i)}>
                            {i.ativo ? "Inativar" : "Ativar"}
                          </Button>
                        )}
                        {podeExcluir && (
                          <Button size="sm" variant="ghost" onClick={() => excluir(i.id)}>
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        )}
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
