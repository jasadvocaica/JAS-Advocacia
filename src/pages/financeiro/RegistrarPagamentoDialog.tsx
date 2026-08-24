import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InputMoeda } from "@/components/ui/input-moeda";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useFormDraft } from "@/hooks/useFormDraft";
import { comRetry } from "@/lib/supabase-retry";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contratoId: string;
  clienteId: string;
  parcela?: { id: string; valor: number; numero_parcela: number } | null;
  sugestaoValor?: number;
  onSuccess?: () => void;
}

export function RegistrarPagamentoDialog({ open, onOpenChange, contratoId, clienteId, parcela, sugestaoValor, onSuccess }: Props) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [parcelasPendentes, setParcelasPendentes] = useState<Array<{ id: string; numero_parcela: number; valor: number; data_vencimento: string }>>([]);
  const [parcelaIdManual, setParcelaIdManual] = useState<string>("nenhuma");
  const [form, setForm] = useState({
    valor_recebido: "",
    data_pagamento: new Date().toISOString().slice(0, 10),
    forma_pagamento: "pix",
    tipo_pagamento: "regular",
    observacao: "",
  });

  useEffect(() => {
    if (open) {
      setForm(f => ({
        ...f,
        valor_recebido: sugestaoValor ? String(sugestaoValor) : "",
        data_pagamento: new Date().toISOString().slice(0, 10),
      }));
      setParcelaIdManual("nenhuma");
      // Carregar parcelas pendentes para vincular quando o pagamento é avulso
      if (!parcela) {
        (async () => {
          const { data } = await supabase
            .from("honorarios_parcelas")
            .select("id, numero_parcela, valor, data_vencimento")
            .eq("contrato_id", contratoId)
            .in("status", ["pendente", "atrasado"])
            .order("numero_parcela");
          setParcelasPendentes((data as any[]) ?? []);
        })();
      } else {
        setParcelasPendentes([]);
      }
    }
  }, [open, sugestaoValor, parcela, contratoId]);

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const draftKey = `pagamento:rascunho:${contratoId}:${parcela?.id ?? "avulso"}`;
  const { clear: clearDraft } = useFormDraft(draftKey, form, {
    enabled: open,
    hasContent: (v) => Boolean(v.valor_recebido || v.observacao),
    onRestore: (d) => setForm((f) => ({ ...f, ...d })),
  });

  const handleSubmit = async () => {
    if (!form.valor_recebido) { toast.error("Informe o valor"); return; }
    setSaving(true);
    const parcelaIdFinal = parcela?.id ?? (parcelaIdManual !== "nenhuma" ? parcelaIdManual : null);
    const { error } = await comRetry(async () => await supabase.from("honorarios_pagamentos").insert({
      contrato_id: contratoId,
      cliente_id: clienteId,
      parcela_id: parcelaIdFinal,
      valor_recebido: Number(form.valor_recebido),
      data_pagamento: form.data_pagamento,
      forma_pagamento: form.forma_pagamento,
      tipo_pagamento: form.tipo_pagamento,
      observacao: form.observacao || null,
      registrado_por: user?.id,
    }).select().single());
    if (error) { toast.error("Erro: " + error.message); setSaving(false); return; }
    clearDraft();
    toast.success(parcelaIdFinal ? "Pagamento registrado e parcela baixada" : "Pagamento registrado");
    setSaving(false);
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Registrar pagamento</DialogTitle>
          <DialogDescription>
            {parcela ? `Parcela #${parcela.numero_parcela}` : "Pagamento avulso (ex: êxito ou adiantamento)"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Valor recebido (R$) *</Label>
              <InputMoeda value={form.valor_recebido} onChange={(v) => set("valor_recebido", v)} />
            </div>
            <div>
              <Label>Data *</Label>
              <Input type="date" value={form.data_pagamento} onChange={(e) => set("data_pagamento", e.target.value)} />
            </div>
            <div>
              <Label>Forma</Label>
              <Select value={form.forma_pagamento} onValueChange={(v) => set("forma_pagamento", v)}>
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
              <Select value={form.tipo_pagamento} onValueChange={(v) => set("tipo_pagamento", v)}>
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
          {!parcela && parcelasPendentes.length > 0 && (
            <div>
              <Label>Vincular a uma parcela (opcional)</Label>
              <Select value={parcelaIdManual} onValueChange={setParcelaIdManual}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhuma">Não vincular (pagamento avulso)</SelectItem>
                  {parcelasPendentes.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      Parc. #{p.numero_parcela} · venc. {new Date(p.data_vencimento + "T00:00:00").toLocaleDateString("pt-BR")} · R$ {Number(p.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                Se vincular, a parcela será marcada como <strong>paga</strong> automaticamente.
              </p>
            </div>
          )}
          <div>
            <Label>Observação</Label>
            <Textarea rows={2} value={form.observacao} onChange={(e) => set("observacao", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="gold" onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
