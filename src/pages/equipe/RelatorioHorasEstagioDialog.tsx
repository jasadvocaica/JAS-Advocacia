import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Sparkles, FileDown, Loader2 } from "lucide-react";
import { MESES } from "./types";
import { gerarRelatorioHorasPdf, type DiaRelatorio, type StatsRelatorio } from "./relatorio-horas-pdf";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mes: number;
  ano: number;
  estagiarias: { id: string; nome: string; cargo: string }[];
}

const SUGESTOES = [
  "Resumo simples para entregar à estagiária.",
  "Foco em pontualidade e assiduidade.",
  "Detalhe os dias com falta e sugira conversa.",
  "Linguagem formal para arquivo do RH.",
];

export function RelatorioHorasEstagioDialog({ open, onOpenChange, mes, ano, estagiarias }: Props) {
  const [membroId, setMembroId] = useState<string>("");
  const [mesSel, setMesSel] = useState<number>(mes);
  const [anoSel, setAnoSel] = useState<number>(ano);
  const [prompt, setPrompt] = useState<string>("");
  const [gerando, setGerando] = useState(false);
  const [analise, setAnalise] = useState<string>("");
  const [dias, setDias] = useState<DiaRelatorio[]>([]);
  const [stats, setStats] = useState<StatsRelatorio | null>(null);

  useEffect(() => {
    if (open) {
      setMesSel(mes);
      setAnoSel(ano);
      if (!membroId && estagiarias[0]) setMembroId(estagiarias[0].id);
    }
  }, [open, mes, ano, estagiarias, membroId]);

  const anos = [ano - 1, ano, ano + 1];

  const gerar = async () => {
    if (!membroId) { toast.error("Selecione uma estagiária."); return; }
    setGerando(true);
    setAnalise("");
    try {
      const { data, error } = await supabase.functions.invoke("relatorio-horas-estagio", {
        body: { membroId, mes: mesSel, ano: anoSel, prompt },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setAnalise(data.analise ?? "");
      setDias(data.dias ?? []);
      setStats(data.stats ?? null);
      toast.success("Relatório gerado pela IA.");
    } catch (e: any) {
      toast.error("Erro: " + (e?.message ?? "desconhecido"));
    } finally {
      setGerando(false);
    }
  };

  const baixarPdf = async () => {
    if (!stats || dias.length === 0) {
      toast.error("Gere o relatório primeiro.");
      return;
    }
    try {
      const { data: cfg } = await supabase.from("configuracoes_sistema")
        .select("valor").eq("chave", "escritorio_nome").maybeSingle();
      const escritorio = (cfg?.valor as string) || "Escritório";
      const est = estagiarias.find((e) => e.id === membroId);
      const doc = gerarRelatorioHorasPdf({
        escritorio,
        cargo: est?.cargo ?? "Estagiário(a)",
        stats,
        dias,
        analise,
      });
      const slug = (est?.nome ?? "estagiaria").toLowerCase().replace(/[^a-z0-9]+/g, "-");
      doc.save(`relatorio-horas-${slug}-${anoSel}-${String(mesSel).padStart(2, "0")}.pdf`);
      toast.success("PDF baixado.");
    } catch (e: any) {
      toast.error("Erro ao gerar PDF: " + (e?.message ?? "desconhecido"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-gold" />
            Relatório de horas de estágio
          </DialogTitle>
          <DialogDescription>
            A IA monta um relatório com o ponto da estagiária no mês. Você pode personalizar o foco no campo abaixo.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-3">
            <Label>Estagiária</Label>
            <Select value={membroId} onValueChange={setMembroId}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {estagiarias.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Mês</Label>
            <Select value={String(mesSel)} onValueChange={(v) => setMesSel(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Ano</Label>
            <Select value={String(anoSel)} onValueChange={(v) => setAnoSel(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {anos.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label>Instruções para a IA (opcional)</Label>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ex.: foque em pontualidade, com tom formal para o RH..."
            rows={3}
          />
          <div className="flex flex-wrap gap-1 mt-2">
            {SUGESTOES.map((s) => (
              <Button key={s} type="button" size="sm" variant="outline"
                className="h-7 text-xs" onClick={() => setPrompt(s)}>
                {s}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={gerar} disabled={gerando || !membroId} className="flex-1">
            {gerando ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Gerando...</> :
              <><Sparkles className="w-4 h-4 mr-2" /> Gerar com IA</>}
          </Button>
        </div>

        {stats && (
          <div className="rounded-lg border p-3 bg-muted/30 text-sm space-y-1">
            <p><strong>{stats.membro}</strong> · {stats.competencia}</p>
            <p className="text-xs text-muted-foreground">
              Horas: <strong>{stats.horas_trabalhadas_total.toFixed(2)}h</strong> de {stats.horas_previstas_mes.toFixed(2)}h previstas ·
              Saldo {stats.saldo_horas >= 0 ? "+" : ""}{stats.saldo_horas.toFixed(2)}h ·
              {" "}{stats.dias_com_ponto}/{stats.dias_jornada_previstos} dias com ponto ·
              {" "}{stats.faltas_em_dias_de_jornada} falta(s)
            </p>
          </div>
        )}

        {analise && (
          <div>
            <Label>Análise (editável antes de baixar)</Label>
            <Textarea
              value={analise}
              onChange={(e) => setAnalise(e.target.value)}
              rows={14}
              className="font-mono text-xs"
            />
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={baixarPdf} disabled={!analise || !stats}>
            <FileDown className="w-4 h-4 mr-2" /> Baixar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
