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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, History } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { LABEL_TIPO_REM, type Remuneracao, type TipoRemuneracao } from "../types";

interface Props { membroId: string; }

const VAZIO = {
  tipo: "fixo" as TipoRemuneracao,
  valor_fixo: "",
  dia_pagamento: "5",
  percentual_exito: "",
  valor_por_tarefa: "",
  valor_por_processo: "",
  data_inicio: new Date().toISOString().slice(0, 10),
  data_fim: "",
  observacao: "",
};

export function RemuneracaoTabEdit({ membroId }: Props) {
  const [rems, setRems] = useState<Remuneracao[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(VAZIO);
  const [saving, setSaving] = useState(false);

  const carregar = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("equipe_remuneracao").select("*")
      .eq("membro_id", membroId)
      .order("data_inicio", { ascending: false });
    setRems((data ?? []) as any);
    setLoading(false);
  };
  useEffect(() => { carregar(); }, [membroId]);

  const abrirNovo = () => {
    setEditingId(null);
    setForm(VAZIO);
    setOpen(true);
  };
  const abrirEdicao = (r: Remuneracao) => {
    setEditingId(r.id);
    setForm({
      tipo: r.tipo,
      valor_fixo: r.valor_fixo?.toString() ?? "",
      dia_pagamento: r.dia_pagamento?.toString() ?? "5",
      percentual_exito: r.percentual_exito?.toString() ?? "",
      valor_por_tarefa: r.valor_por_tarefa?.toString() ?? "",
      valor_por_processo: r.valor_por_processo?.toString() ?? "",
      data_inicio: r.data_inicio,
      data_fim: r.data_fim ?? "",
      observacao: r.observacao ?? "",
    });
    setOpen(true);
  };

  const salvar = async () => {
    if (!form.data_inicio) {
      toast.error("Informe a data de início da vigência"); return;
    }
    const num = (s: string) => s === "" ? null : Number(s.replace(",", "."));
    const payload: any = {
      membro_id: membroId,
      tipo: form.tipo,
      valor_fixo: num(form.valor_fixo),
      dia_pagamento: form.dia_pagamento === "" ? null : Number(form.dia_pagamento),
      percentual_exito: num(form.percentual_exito),
      valor_por_tarefa: num(form.valor_por_tarefa),
      valor_por_processo: num(form.valor_por_processo),
      data_inicio: form.data_inicio,
      data_fim: form.data_fim || null,
      observacao: form.observacao || null,
    };
    setSaving(true);
    let error: any = null;
    if (editingId) {
      ({ error } = await supabase.from("equipe_remuneracao").update(payload).eq("id", editingId));
    } else {
      // Encerra contrato vigente automaticamente (sem data_fim)
      const ontem = new Date(form.data_inicio);
      ontem.setDate(ontem.getDate() - 1);
      await supabase.from("equipe_remuneracao")
        .update({ data_fim: ontem.toISOString().slice(0, 10) })
        .eq("membro_id", membroId)
        .is("data_fim", null);
      ({ error } = await supabase.from("equipe_remuneracao").insert(payload));
    }
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar", { description: error.message });
    } else {
      toast.success(editingId ? "Contrato atualizado" : "Novo contrato registrado · vigência anterior encerrada");
      setOpen(false);
      carregar();
    }
  };

  const remover = async (id: string) => {
    const { error } = await supabase.from("equipe_remuneracao").delete().eq("id", id);
    if (error) toast.error("Erro ao remover", { description: error.message });
    else { toast.success("Removido"); carregar(); }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Carregando...</p>;

  const vigente = rems.find((r) => !r.data_fim);
  const historico = rems.filter((r) => r !== vigente);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Contratos de remuneração</h3>
          <p className="text-xs text-muted-foreground">Cada mudança gera um novo contrato preservando o histórico.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="gold" onClick={abrirNovo}><Plus className="w-4 h-4" /> Novo</Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>{editingId ? "Editar contrato" : "Novo contrato de remuneração"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Tipo *</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as TipoRemuneracao })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(LABEL_TIPO_REM).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {(form.tipo === "fixo" || form.tipo === "misto") && (
                <>
                  <div>
                    <Label>Salário fixo (R$)</Label>
                    <Input inputMode="decimal" value={form.valor_fixo} onChange={(e) => setForm({ ...form, valor_fixo: e.target.value })} placeholder="0,00" />
                  </div>
                  <div>
                    <Label>Dia de pagamento</Label>
                    <Input type="number" min={1} max={31} value={form.dia_pagamento} onChange={(e) => setForm({ ...form, dia_pagamento: e.target.value })} />
                  </div>
                </>
              )}
              {(form.tipo === "comissao" || form.tipo === "misto") && (
                <div>
                  <Label>% sobre êxito</Label>
                  <Input inputMode="decimal" value={form.percentual_exito} onChange={(e) => setForm({ ...form, percentual_exito: e.target.value })} placeholder="Ex.: 10" />
                </div>
              )}
              {form.tipo === "producao" && (
                <>
                  <div>
                    <Label>Valor por tarefa (R$)</Label>
                    <Input inputMode="decimal" value={form.valor_por_tarefa} onChange={(e) => setForm({ ...form, valor_por_tarefa: e.target.value })} />
                  </div>
                  <div>
                    <Label>Valor por processo (R$)</Label>
                    <Input inputMode="decimal" value={form.valor_por_processo} onChange={(e) => setForm({ ...form, valor_por_processo: e.target.value })} />
                  </div>
                </>
              )}
              <div>
                <Label>Início da vigência *</Label>
                <Input type="date" value={form.data_inicio} onChange={(e) => setForm({ ...form, data_inicio: e.target.value })} />
              </div>
              <div>
                <Label>Fim da vigência (opcional)</Label>
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

      {vigente ? (
        <Card><CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-success/15 text-success border-success/30">Vigente</Badge>
                <span className="font-semibold">{LABEL_TIPO_REM[vigente.tipo]}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Desde {new Date(vigente.data_inicio).toLocaleDateString("pt-BR")}
              </p>
              <div className="text-sm pt-1 space-y-0.5">
                {vigente.valor_fixo != null && <p>Fixo: <strong>{formatBRL(vigente.valor_fixo)}</strong> {vigente.dia_pagamento && `· dia ${vigente.dia_pagamento}`}</p>}
                {vigente.percentual_exito != null && <p>Êxito: <strong>{vigente.percentual_exito}%</strong></p>}
                {vigente.valor_por_tarefa != null && <p>Por tarefa: <strong>{formatBRL(vigente.valor_por_tarefa)}</strong></p>}
                {vigente.valor_por_processo != null && <p>Por processo: <strong>{formatBRL(vigente.valor_por_processo)}</strong></p>}
              </div>
              {vigente.observacao && <p className="text-xs text-muted-foreground italic pt-1">{vigente.observacao}</p>}
            </div>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" onClick={() => abrirEdicao(vigente)}><Pencil className="w-4 h-4" /></Button>
              <AlertDialog>
                <AlertDialogTrigger asChild><Button size="icon" variant="ghost"><Trash2 className="w-4 h-4 text-destructive" /></Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remover contrato?</AlertDialogTitle>
                    <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => remover(vigente.id)}>Remover</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardContent></Card>
      ) : (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Nenhum contrato vigente. Clique em <strong>Novo</strong> para cadastrar.</CardContent></Card>
      )}

      {historico.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1"><History className="w-3 h-3" /> Histórico</p>
          {historico.map((r) => (
            <Card key={r.id}><CardContent className="p-3 flex items-center justify-between text-sm">
              <div>
                <p className="font-medium">{LABEL_TIPO_REM[r.tipo]}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(r.data_inicio).toLocaleDateString("pt-BR")} → {r.data_fim ? new Date(r.data_fim).toLocaleDateString("pt-BR") : "vigente"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right text-xs">
                  {r.valor_fixo != null && <p>Fixo: {formatBRL(r.valor_fixo)}</p>}
                  {r.percentual_exito != null && <p>Êxito: {r.percentual_exito}%</p>}
                </div>
                <Button size="icon" variant="ghost" onClick={() => abrirEdicao(r)}><Pencil className="w-4 h-4" /></Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button size="icon" variant="ghost"><Trash2 className="w-4 h-4 text-destructive" /></Button></AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Remover contrato histórico?</AlertDialogTitle></AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => remover(r.id)}>Remover</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent></Card>
          ))}
        </div>
      )}
    </div>
  );
}
