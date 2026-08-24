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
import { LABEL_BENEFICIO, type BeneficioEquipe, type BeneficioTipo, type BeneficioNatureza } from "../types";

interface Props { membroId: string; }

const VAZIO = {
  tipo: "vr" as BeneficioTipo,
  descricao: "",
  valor_mensal: "",
  natureza: "credito" as BeneficioNatureza,
  data_inicio: new Date().toISOString().slice(0, 10),
  data_fim: "",
  observacao: "",
};

export function BeneficiosTabEdit({ membroId }: Props) {
  const [items, setItems] = useState<BeneficioEquipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(VAZIO);
  const [saving, setSaving] = useState(false);

  const carregar = async () => {
    setLoading(true);
    const { data } = await supabase.from("equipe_beneficios").select("*").eq("membro_id", membroId).order("data_inicio", { ascending: false });
    setItems((data ?? []) as any);
    setLoading(false);
  };
  useEffect(() => { carregar(); }, [membroId]);

  const abrirNovo = () => { setEditingId(null); setForm(VAZIO); setOpen(true); };
  const abrirEdicao = (b: BeneficioEquipe) => {
    setEditingId(b.id);
    setForm({
      tipo: b.tipo, descricao: b.descricao ?? "", valor_mensal: String(b.valor_mensal),
      natureza: b.natureza, data_inicio: b.data_inicio, data_fim: b.data_fim ?? "",
      observacao: b.observacao ?? "",
    });
    setOpen(true);
  };

  const salvar = async () => {
    if (!form.valor_mensal) { toast.error("Informe o valor mensal"); return; }
    const payload: any = {
      membro_id: membroId,
      tipo: form.tipo,
      descricao: form.descricao || null,
      valor_mensal: Number(form.valor_mensal.replace(",", ".")),
      natureza: form.natureza,
      data_inicio: form.data_inicio,
      data_fim: form.data_fim || null,
      observacao: form.observacao || null,
    };
    setSaving(true);
    const { error } = editingId
      ? await supabase.from("equipe_beneficios").update(payload).eq("id", editingId)
      : await supabase.from("equipe_beneficios").insert(payload);
    setSaving(false);
    if (error) toast.error("Erro", { description: error.message });
    else { toast.success(editingId ? "Atualizado" : "Adicionado"); setOpen(false); carregar(); }
  };

  const remover = async (id: string) => {
    const { error } = await supabase.from("equipe_beneficios").delete().eq("id", id);
    if (error) toast.error("Erro ao remover", { description: error.message });
    else { toast.success("Removido"); carregar(); }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Carregando...</p>;

  const hoje = new Date().toISOString().slice(0, 10);
  const ativos = items.filter((b) => (!b.data_fim || b.data_fim >= hoje) && b.data_inicio <= hoje);
  const totalCreditos = ativos.filter((b) => b.natureza === "credito").reduce((s, b) => s + Number(b.valor_mensal), 0);
  const totalDescontos = ativos.filter((b) => b.natureza === "debito").reduce((s, b) => s + Number(b.valor_mensal), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-semibold">Benefícios fixos</h3>
          <p className="text-xs text-muted-foreground">VR, VT, plano de saúde e outros valores recorrentes.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" variant="gold" onClick={abrirNovo}><Plus className="w-4 h-4" /> Adicionar</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editingId ? "Editar benefício" : "Novo benefício"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo *</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as BeneficioTipo })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(LABEL_BENEFICIO).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Natureza *</Label>
                <Select value={form.natureza} onValueChange={(v) => setForm({ ...form, natureza: v as BeneficioNatureza })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credito">Crédito (soma na folha)</SelectItem>
                    <SelectItem value="debito">Desconto (subtrai da folha)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Descrição</Label>
                <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Ex.: Unimed Compacto, VR Sodexo R$ 30/dia..." />
              </div>
              <div>
                <Label>Valor mensal (R$) *</Label>
                <Input inputMode="decimal" value={form.valor_mensal} onChange={(e) => setForm({ ...form, valor_mensal: e.target.value })} placeholder="0,00" />
              </div>
              <div>
                <Label>Início *</Label>
                <Input type="date" value={form.data_inicio} onChange={(e) => setForm({ ...form, data_inicio: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label>Fim (opcional)</Label>
                <Input type="date" value={form.data_fim} onChange={(e) => setForm({ ...form, data_fim: e.target.value })} />
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

      {ativos.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <Card><CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Total de créditos / mês</p>
            <p className="font-display text-lg text-success">{formatBRL(totalCreditos)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Total de descontos / mês</p>
            <p className="font-display text-lg text-destructive">{formatBRL(totalDescontos)}</p>
          </CardContent></Card>
        </div>
      )}

      {items.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Nenhum benefício cadastrado.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {items.map((b) => {
            const ativo = (!b.data_fim || b.data_fim >= hoje) && b.data_inicio <= hoje;
            return (
              <Card key={b.id}><CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{LABEL_BENEFICIO[b.tipo]}</span>
                      <Badge variant="outline" className={b.natureza === "credito" ? "bg-success/15 text-success border-success/30" : "bg-destructive/15 text-destructive border-destructive/30"}>
                        {b.natureza === "credito" ? "+" : "−"} {formatBRL(b.valor_mensal)}
                      </Badge>
                      {!ativo && <Badge variant="outline" className="bg-muted text-muted-foreground">encerrado</Badge>}
                    </div>
                    {b.descricao && <p className="text-sm text-muted-foreground">{b.descricao}</p>}
                    <p className="text-xs text-muted-foreground">
                      {new Date(b.data_inicio).toLocaleDateString("pt-BR")} → {b.data_fim ? new Date(b.data_fim).toLocaleDateString("pt-BR") : "vigente"}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => abrirEdicao(b)}><Pencil className="w-4 h-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button size="icon" variant="ghost"><Trash2 className="w-4 h-4 text-destructive" /></Button></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Remover benefício?</AlertDialogTitle></AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remover(b.id)}>Remover</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent></Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
