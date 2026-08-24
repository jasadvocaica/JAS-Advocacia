import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Loader2, FileBadge } from "lucide-react";
import { formatBRL, formatDate } from "@/lib/format";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  TIPO_BENEFICIO_OPTS, STATUS_BENEFICIO_OPTS, STATUS_BENEFICIO_CLASS, BeneficioInss,
} from "../types";

interface Props { clienteId: string }

export default function BeneficiosInssCard({ clienteId }: Props) {
  const { hasPermission } = useAuth();
  const podeEditar = hasPermission("clientes", "editar");
  const podeExcluir = hasPermission("clientes", "excluir");

  const [list, setList] = useState<BeneficioInss[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<BeneficioInss> | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("cliente_beneficios_inss")
      .select("*")
      .eq("cliente_id", clienteId)
      .order("criado_em", { ascending: false });
    setList((data ?? []) as BeneficioInss[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, [clienteId]);

  async function save() {
    if (!editing?.nb || !editing?.tipo_beneficio) {
      toast.error("NB e tipo são obrigatórios");
      return;
    }
    const payload: any = {
      cliente_id: clienteId,
      nb: editing.nb,
      tipo_beneficio: editing.tipo_beneficio,
      der: editing.der || null,
      dib: editing.dib || null,
      competencia_inicio: editing.competencia_inicio || null,
      valor_mensal: editing.valor_mensal != null && editing.valor_mensal !== ("" as any)
        ? Number(String(editing.valor_mensal).replace(",", "."))
        : null,
      status: editing.status || "ativo",
      observacao: editing.observacao || null,
    };
    const { error } = editing.id
      ? await supabase.from("cliente_beneficios_inss").update(payload).eq("id", editing.id)
      : await supabase.from("cliente_beneficios_inss").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Benefício salvo");
    setEditing(null);
    load();
  }

  async function excluir() {
    if (!deleteId) return;
    const { error } = await supabase.from("cliente_beneficios_inss").delete().eq("id", deleteId);
    if (error) toast.error(error.message);
    else { toast.success("Benefício removido"); load(); }
    setDeleteId(null);
  }

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileBadge className="w-4 h-4 text-gold" />
          <h3 className="font-display text-lg">Benefícios INSS</h3>
        </div>
        {podeEditar && (
          <Button size="sm" variant="outline" onClick={() => setEditing({ status: "ativo" })}>
            <Plus className="w-4 h-4" /> Adicionar NB
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gold" /></div>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Nenhum benefício cadastrado.</p>
      ) : (
        <div className="space-y-2">
          {list.map((b) => (
            <div key={b.id} className="border rounded-lg p-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-mono font-medium text-sm">NB {b.nb}</span>
                  <Badge variant="outline" className={STATUS_BENEFICIO_CLASS[b.status]}>
                    {STATUS_BENEFICIO_OPTS.find((s) => s.v === b.status)?.l ?? b.status}
                  </Badge>
                </div>
                <p className="text-sm">{b.tipo_beneficio}</p>
                <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 mt-1">
                  {b.der && <span>DER: {formatDate(b.der)}</span>}
                  {b.dib && <span>DIB: {formatDate(b.dib)}</span>}
                  {b.valor_mensal != null && <span>Valor: {formatBRL(Number(b.valor_mensal))}</span>}
                </div>
                {b.observacao && <p className="text-xs text-muted-foreground mt-1 italic">{b.observacao}</p>}
              </div>
              <div className="flex gap-1 shrink-0">
                {podeEditar && (
                  <Button size="icon" variant="ghost" onClick={() => setEditing(b)}><Pencil className="w-3.5 h-3.5" /></Button>
                )}
                {podeExcluir && (
                  <Button size="icon" variant="ghost" onClick={() => setDeleteId(b.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal add/edit */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar benefício" : "Novo benefício INSS"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5">
              <Label>NB *</Label>
              <Input value={editing?.nb ?? ""} onChange={(e) => setEditing({ ...editing!, nb: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select value={editing?.tipo_beneficio ?? ""} onValueChange={(v) => setEditing({ ...editing!, tipo_beneficio: v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>{TIPO_BENEFICIO_OPTS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>DER</Label>
              <Input type="date" value={editing?.der ?? ""} onChange={(e) => setEditing({ ...editing!, der: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>DIB</Label>
              <Input type="date" value={editing?.dib ?? ""} onChange={(e) => setEditing({ ...editing!, dib: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor mensal (R$)</Label>
              <Input value={editing?.valor_mensal ?? ""} onChange={(e) => setEditing({ ...editing!, valor_mensal: e.target.value as any })} placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={editing?.status ?? "ativo"} onValueChange={(v) => setEditing({ ...editing!, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS_BENEFICIO_OPTS.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Observação</Label>
              <Input value={editing?.observacao ?? ""} onChange={(e) => setEditing({ ...editing!, observacao: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button variant="gold" onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover benefício?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={excluir} className="bg-destructive text-destructive-foreground">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
