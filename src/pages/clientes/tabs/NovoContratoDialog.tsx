import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { InputMoeda } from "@/components/ui/input-moeda";

type TipoHonorario = "fixo" | "exito" | "misto" | "mensalidade";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clienteId: string;
  onCriado?: () => void;
}

export default function NovoContratoDialog({ open, onOpenChange, clienteId, onCriado }: Props) {
  const { user } = useAuth();
  const [tipo, setTipo] = useState<TipoHonorario>("fixo");
  const [valorFixo, setValorFixo] = useState<string>("");
  const [percentualExito, setPercentualExito] = useState<string>("");
  const [parcelas, setParcelas] = useState<string>("1");
  const [diaVenc, setDiaVenc] = useState<string>("10");
  const [processoId, setProcessoId] = useState<string>("");
  const [observacoes, setObservacoes] = useState("");
  const [processos, setProcessos] = useState<{ id: string; label: string }[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTipo("fixo"); setValorFixo(""); setPercentualExito("");
    setParcelas("1"); setDiaVenc("10"); setProcessoId(""); setObservacoes("");
    (async () => {
      const { data } = await supabase
        .from("processos")
        .select("id, numero_cnj, tipo_acao")
        .eq("cliente_id", clienteId)
        .order("criado_em", { ascending: false });
      setProcessos((data ?? []).map((p: any) => ({
        id: p.id,
        label: `${p.numero_cnj || "Processo s/ CNJ"}${p.tipo_acao ? ` — ${p.tipo_acao}` : ""}`,
      })));
    })();
  }, [open, clienteId]);

  async function salvar() {
    const totalP = Number(parcelas) || 1;
    const dia = Number(diaVenc) || 10;
    if (dia < 1 || dia > 28) return toast.error("Dia de vencimento entre 1 e 28");

    const valorNum = Number(valorFixo) || 0;
    if (tipo === "fixo" || tipo === "misto" || tipo === "mensalidade") {
      if (valorNum <= 0) return toast.error("Informe o valor");
    }
    let pe: number | null = null;
    if (tipo === "exito" || tipo === "misto") {
      pe = parseFloat(percentualExito.replace(",", "."));
      if (!pe || pe <= 0) return toast.error("Informe o percentual de êxito");
    }

    setSalvando(true);
    const payload: any = {
      cliente_id: clienteId,
      tipo,
      status: "ativo",
      valor_fixo: tipo === "exito" ? null : valorNum,
      percentual_exito: pe,
      total_parcelas: tipo === "exito" ? 1 : totalP,
      dia_vencimento: tipo === "exito" ? null : dia,
      processo_id: processoId || null,
      observacoes: observacoes.trim() || null,
      criado_por: user?.id ?? null,
      data_assinatura: new Date().toISOString().slice(0, 10),
    };
    if (tipo === "mensalidade") {
      payload.data_inicio_mensalidade = new Date().toISOString().slice(0, 10);
    }

    const { data: criado, error } = await supabase
      .from("honorarios_contratos")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      setSalvando(false);
      return toast.error("Não foi possível criar", { description: error.message });
    }

    // Gerar parcelas para fixo/misto com mais de 1 parcela
    if ((tipo === "fixo" || tipo === "misto") && totalP > 0 && valorNum > 0) {
      const valorPorParcela = Number((valorNum / totalP).toFixed(2));
      const parcs = Array.from({ length: totalP }, (_, i) => {
        const venc = new Date();
        venc.setMonth(venc.getMonth() + i);
        venc.setDate(dia);
        return {
          contrato_id: criado.id,
          numero_parcela: i + 1,
          valor: valorPorParcela,
          data_vencimento: venc.toISOString().slice(0, 10),
          status: "pendente",
        };
      });
      await supabase.from("honorarios_parcelas").insert(parcs as any);
    }

    setSalvando(false);
    toast.success("Contrato lançado");
    onCriado?.();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Lançar contrato</DialogTitle>
          <DialogDescription>
            Cadastre um contrato direto aqui. Para edição detalhada use a ficha completa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoHonorario)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixo">Fixo</SelectItem>
                  <SelectItem value="exito">Êxito</SelectItem>
                  <SelectItem value="misto">Misto (fixo + êxito)</SelectItem>
                  <SelectItem value="mensalidade">Mensalidade</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Processo (opcional)</Label>
              <Select value={processoId || "none"} onValueChange={(v) => setProcessoId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem processo</SelectItem>
                  {processos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {tipo !== "exito" && (
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1 space-y-1.5">
                <Label>Valor *</Label>
                <InputMoeda value={valorFixo} onChange={setValorFixo} />
              </div>
              {tipo !== "mensalidade" && (
                <div className="space-y-1.5">
                  <Label>Parcelas</Label>
                  <Input type="number" min={1} value={parcelas} onChange={(e) => setParcelas(e.target.value)} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Dia venc.</Label>
                <Input type="number" min={1} max={28} value={diaVenc} onChange={(e) => setDiaVenc(e.target.value)} />
              </div>
            </div>
          )}

          {(tipo === "exito" || tipo === "misto") && (
            <div className="space-y-1.5">
              <Label>% Êxito *</Label>
              <Input
                type="text"
                value={percentualExito}
                onChange={(e) => setPercentualExito(e.target.value)}
                placeholder="Ex: 30"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea
              rows={2}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Detalhes do contrato..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={salvando}>Cancelar</Button>
          <Button variant="gold" onClick={salvar} disabled={salvando}>
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Lançar contrato
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
