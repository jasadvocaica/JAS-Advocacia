import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { MESES, type LancamentoFolha, type LancamentoNatureza } from "../types";

interface Props { membroId: string; }

const ANOS = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 2 + i);

const VAZIO = {
  mes: new Date().getMonth() + 1,
  ano: new Date().getFullYear(),
  natureza: "bonus" as LancamentoNatureza,
  motivo: "",
  valor: "",
  observacao: "",
};

export function LancamentosTabEdit({ membroId }: Props) {
  const [items, setItems] = useState<LancamentoFolha[]>([]);
  const [filtroAno, setFiltroAno] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(VAZIO);
  const [saving, setSaving] = useState(false);

  const carregar = async () => {
    setLoading(true);
    const { data } = await supabase.from("equipe_lancamentos_folha").select("*")
      .eq("membro_id", membroId).eq("ano", filtroAno)
      .order("mes", { ascending: false }).order("criado_em", { ascending: false });
    setItems((data ?? []) as any);
    setLoading(false);
  };
  useEffect(() => { carregar(); }, [membroId, filtroAno]);

  const abrirNovo = () => { setEditingId(null); setForm(VAZIO); setOpen(true); };
  const abrirEdicao = (l: LancamentoFolha) => {
    setEditingId(l.id);
    setForm({
      mes: l.mes, ano: l.ano, natureza: l.natureza,
      motivo: l.motivo, valor: String(l.valor), observacao: l.observacao ?? "",
    });
    setOpen(true);
  };

  const salvar = async () => {
    if (!form.motivo || !form.valor) { toast.error("Informe motivo e valor"); return; }
    const payload: any = {
      membro_id: membroId, mes: form.mes, ano: form.ano,
      natureza: form.natureza, motivo: form.motivo,
      valor: Number(form.valor.replace(",", ".")),
      observacao: form.observacao || null,
    };
    setSaving(true);
    const { error } = editingId
      ? await supabase.from("equipe_lancamentos_folha").update(payload).eq("id", editingId)
      : await supabase.from("equipe_lancamentos_folha").insert(payload);
    setSaving(false);
    if (error) toast.error("Erro", { description: error.message });
    else { toast.success(editingId ? "Atualizado" : "Lançamento criado"); setOpen(false); carregar(); }
  };

  const remover = async (id: string) => {
    const { error } = await supabase.from("equipe_lancamentos_folha").delete().eq("id", id);
    if (error) toast.error("Erro", { description: error.message });
    else { toast.success("Removido"); carregar(); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-semibold">Bônus e descontos avulsos</h3>
          <p className="text-xs text-muted-foreground">Lançamentos pontuais que entram na folha do mês informado.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(filtroAno)} onValueChange={(v) => setFiltroAno(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{ANOS.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}</SelectContent>
          </Select>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm" variant="gold" onClick={abrirNovo}><Plus className="w-4 h-4" /> Novo</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{editingId ? "Editar lançamento" : "Novo lançamento"}</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Natureza *</Label>
                  <Select value={form.natureza} onValueChange={(v) => setForm({ ...form, natureza: v as LancamentoNatureza })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bonus">Bônus (+)</SelectItem>
                      <SelectItem value="desconto">Desconto (−)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Valor (R$) *</Label>
                  <Input inputMode="decimal" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} placeholder="0,00" />
                </div>
                <div>
                  <Label>Mês *</Label>
                  <Select value={String(form.mes)} onValueChange={(v) => setForm({ ...form, mes: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{MESES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Ano *</Label>
                  <Select value={String(form.ano)} onValueChange={(v) => setForm({ ...form, ano: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ANOS.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>Motivo *</Label>
                  <Input value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} placeholder="Ex.: Bônus por meta atingida, adiantamento, falta..." />
                </div>
                <div className="col-span-2">
                  <Label>Observação</Label>
                  <Textarea rows={2} value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button variant="gold" onClick={salvar} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Carregando...</p>
        : items.length === 0 ? <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Nenhum lançamento em {filtroAno}.</CardContent></Card>
        : (
        <div className="space-y-2">
          {items.map((l) => (
            <Card key={l.id}><CardContent className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={l.natureza === "bonus" ? "bg-success/15 text-success border-success/30" : "bg-destructive/15 text-destructive border-destructive/30"}>
                      {l.natureza === "bonus" ? "+" : "−"} {formatBRL(l.valor)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{MESES[l.mes - 1]}/{l.ano}</span>
                    {l.aplicado_folha && <Badge variant="outline" className="bg-muted text-muted-foreground text-xs">já em folha</Badge>}
                  </div>
                  <p className="text-sm font-medium pt-1">{l.motivo}</p>
                  {l.observacao && <p className="text-xs text-muted-foreground italic">{l.observacao}</p>}
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => abrirEdicao(l)} disabled={l.aplicado_folha}><Pencil className="w-4 h-4" /></Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button size="icon" variant="ghost" disabled={l.aplicado_folha}><Trash2 className="w-4 h-4 text-destructive" /></Button></AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Remover lançamento?</AlertDialogTitle></AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remover(l.id)}>Remover</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </CardContent></Card>
          ))}
        </div>
      )}
    </div>
  );
}
