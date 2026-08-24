import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Calculator, DollarSign, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  membros: { id: string; nome: string }[];
  saldos: Map<string, number>;
  onRegistrouPagamento?: () => void;
}

const MULTIPLICADORES = [
  { label: "Hora normal (1,0×)", value: "1.0" },
  { label: "Hora extra 50% (1,5×)", value: "1.5" },
  { label: "Hora extra 100% / DSR (2,0×)", value: "2.0" },
  { label: "Personalizado", value: "custom" },
];

export function SimuladorBancoHorasDialog({
  open, onOpenChange, membros, saldos, onRegistrouPagamento,
}: Props) {
  const [membroId, setMembroId] = useState<string>("");
  const [salario, setSalario] = useState<string>("");
  const [horasMes, setHorasMes] = useState<string>("220");
  const [multTipo, setMultTipo] = useState<string>("1.5");
  const [multCustom, setMultCustom] = useState<string>("1.5");
  const [horasConverter, setHorasConverter] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!membroId && membros[0]) setMembroId(membros[0].id);
  }, [open, membros, membroId]);

  // Quando troca membro, busca remuneração vigente e jornada
  useEffect(() => {
    if (!open || !membroId) return;
    void (async () => {
      setLoading(true);
      const hoje = new Date().toISOString().slice(0, 10);
      const [{ data: rem }, { data: cfg }] = await Promise.all([
        supabase
          .from("equipe_remuneracao")
          .select("valor_fixo, data_inicio, data_fim")
          .eq("membro_id", membroId)
          .lte("data_inicio", hoje)
          .order("data_inicio", { ascending: false })
          .limit(5),
        supabase
          .from("gp_ponto_config")
          .select("horas_diarias, dias_trabalho")
          .eq("membro_id", membroId)
          .maybeSingle(),
      ]);
      const vigente = ((rem ?? []) as any[]).find((r) => !r.data_fim || r.data_fim >= hoje);
      setSalario(vigente?.valor_fixo ? String(vigente.valor_fixo) : "");
      const horas = Number((cfg as any)?.horas_diarias ?? 8);
      const dias = ((cfg as any)?.dias_trabalho ?? ["seg","ter","qua","qui","sex"]).length;
      // 4.345 semanas/mês em média
      const mes = Math.round(horas * dias * 4.345);
      setHorasMes(String(mes || 220));
      const saldo = saldos.get(membroId) ?? 0;
      setHorasConverter(saldo > 0 ? saldo.toFixed(2) : "0");
      setLoading(false);
    })();
  }, [membroId, open, saldos]);

  const multiplicador = useMemo(() => {
    if (multTipo === "custom") return Number(multCustom.replace(",", ".")) || 0;
    return Number(multTipo) || 0;
  }, [multTipo, multCustom]);

  const valorHora = useMemo(() => {
    const s = Number(salario.replace(",", ".")) || 0;
    const h = Number(horasMes) || 0;
    return h > 0 ? s / h : 0;
  }, [salario, horasMes]);

  const horasN = Number((horasConverter || "0").replace(",", ".")) || 0;
  const valorTotal = valorHora * multiplicador * horasN;
  const saldoAtual = saldos.get(membroId) ?? 0;
  const saldoApos = saldoAtual - horasN;

  const registrarComoLancamento = async () => {
    if (!membroId || horasN <= 0 || valorTotal <= 0) {
      toast.error("Informe horas e valor válidos");
      return;
    }
    const hoje = new Date();
    setSalvando(true);
    // 1) Lança bônus na folha do mês corrente
    const { error: e1 } = await supabase.from("equipe_lancamentos_folha").insert({
      membro_id: membroId,
      mes: hoje.getMonth() + 1,
      ano: hoje.getFullYear(),
      natureza: "bonus",
      valor: Number(valorTotal.toFixed(2)),
      motivo: `Pagamento de ${horasN.toFixed(2)}h do banco de horas (${multiplicador.toFixed(2)}×)`,
    });
    if (e1) { toast.error("Erro ao lançar bônus", { description: e1.message }); setSalvando(false); return; }
    // 2) Debita do banco de horas
    const { error: e2 } = await supabase.from("gp_banco_horas").insert({
      membro_id: membroId,
      data: hoje.toISOString().slice(0, 10),
      horas: -horasN,
      tipo: "debito",
      descricao: `Pago em folha — ${formatBRL(valorTotal)}`,
    });
    if (e2) { toast.error("Erro ao debitar banco", { description: e2.message }); setSalvando(false); return; }
    setSalvando(false);
    toast.success("Pagamento de banco registrado");
    onRegistrouPagamento?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-gold" />
            Simulador de banco de horas → R$
          </DialogTitle>
          <DialogDescription>
            Calcule o valor das horas extras e, se quiser, gere um bônus na folha do mês debitando do banco.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Membro</Label>
            <Select value={membroId} onValueChange={setMembroId}>
              <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
              <SelectContent>
                {membros.map((m) => {
                  const s = saldos.get(m.id) ?? 0;
                  return (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nome} ({s > 0 ? "+" : ""}{s.toFixed(2)}h)
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gold" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Salário base (R$)</Label>
                  <Input
                    inputMode="decimal"
                    value={salario}
                    onChange={(e) => setSalario(e.target.value)}
                    placeholder="0,00"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Horas/mês (divisor)</Label>
                  <Input
                    type="number"
                    value={horasMes}
                    onChange={(e) => setHorasMes(e.target.value)}
                  />
                  <p className="text-[10px] text-muted-foreground">Auto pela jornada (≈ horas/dia × dias × 4,345)</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tipo de hora</Label>
                  <Select value={multTipo} onValueChange={setMultTipo}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MULTIPLICADORES.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Multiplicador</Label>
                  <Input
                    inputMode="decimal"
                    value={multTipo === "custom" ? multCustom : multTipo}
                    onChange={(e) => { setMultCustom(e.target.value); setMultTipo("custom"); }}
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">Horas a converter</Label>
                  <Input
                    inputMode="decimal"
                    value={horasConverter}
                    onChange={(e) => setHorasConverter(e.target.value)}
                  />
                  <p className="text-[10px] text-muted-foreground">Saldo atual: {saldoAtual.toFixed(2)}h · saldo após: {saldoApos.toFixed(2)}h</p>
                </div>
              </div>

              <Card className="border-gold/40 bg-gold/5">
                <CardContent className="p-4 space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Valor da hora normal</span>
                    <span className="font-medium">{formatBRL(valorHora)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Valor da hora ({multiplicador.toFixed(2)}×)</span>
                    <span className="font-medium">{formatBRL(valorHora * multiplicador)}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-gold/30">
                    <span className="font-display flex items-center gap-1.5"><DollarSign className="w-4 h-4 text-gold" /> Total a pagar</span>
                    <span className="font-display text-2xl text-gold">{formatBRL(valorTotal)}</span>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button
            variant="gold"
            onClick={registrarComoLancamento}
            disabled={loading || salvando || horasN <= 0 || valorTotal <= 0}
          >
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
            Pagar na folha do mês
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
