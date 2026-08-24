import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Sparkles, FileDown, Loader2, Plus, Trash2 } from "lucide-react";
import { MESES, LABEL_CARGO, type CargoEquipe } from "../types";
import {
  gerarRelatorioHorasPdf,
  type DiaRelatorio,
  type StatsRelatorio,
  type HoraComplementar,
} from "../relatorio-horas-pdf";

interface Props {
  membroId: string;
  membroNome: string;
  cargo: CargoEquipe;
}

const SUGESTOES = [
  "Resumo simples para entregar à estagiária.",
  "Foco em pontualidade e assiduidade.",
  "Considere as horas complementares no cálculo total.",
  "Linguagem formal para arquivo do RH / faculdade.",
];

const hoje = new Date();

export function RelatorioHorasTab({ membroId, membroNome, cargo }: Props) {
  const [mes, setMes] = useState<number>(hoje.getMonth() + 1);
  const [ano, setAno] = useState<number>(hoje.getFullYear());
  const [prompt, setPrompt] = useState<string>("");
  const [complementares, setComplementares] = useState<HoraComplementar[]>([]);
  const [gerando, setGerando] = useState(false);
  const [analise, setAnalise] = useState<string>("");
  const [dias, setDias] = useState<DiaRelatorio[]>([]);
  const [stats, setStats] = useState<StatsRelatorio | null>(null);

  // Carrega horas complementares salvas para o mês selecionado
  useEffect(() => {
    let ativo = true;
    (async () => {
      const { data } = await (supabase as any)
        .from("equipe_horas_complementares")
        .select("id, data, descricao, horas")
        .eq("membro_id", membroId)
        .eq("mes", mes)
        .eq("ano", ano)
        .order("data", { ascending: true });
      if (!ativo) return;
      setComplementares(
        (data ?? []).map((d: any) => ({
          id: d.id,
          data: d.data,
          descricao: d.descricao,
          horas: Number(d.horas),
        })),
      );
      setAnalise("");
      setStats(null);
      setDias([]);
    })();
    return () => { ativo = false; };
  }, [membroId, mes, ano]);

  const anos = [ano - 1, ano, ano + 1];
  const totalComplementares = complementares.reduce((s, c) => s + (Number(c.horas) || 0), 0);

  const addComplementar = () => {
    const d = new Date(ano, mes - 1, Math.min(hoje.getDate(), new Date(ano, mes, 0).getDate()));
    setComplementares((arr) => [
      ...arr,
      { data: d.toISOString().slice(0, 10), descricao: "", horas: 0 },
    ]);
  };
  const updateComplementar = (i: number, patch: Partial<HoraComplementar>) =>
    setComplementares((arr) => arr.map((c, idx) => idx === i ? { ...c, ...patch } : c));
  const removeComplementar = (i: number) =>
    setComplementares((arr) => arr.filter((_, idx) => idx !== i));

  const salvarComplementares = async () => {
    try {
      // Estratégia simples: apaga e reinsere para o mês
      await (supabase as any)
        .from("equipe_horas_complementares")
        .delete()
        .eq("membro_id", membroId)
        .eq("mes", mes)
        .eq("ano", ano);
      if (complementares.length > 0) {
        const rows = complementares
          .filter((c) => c.descricao.trim() && Number(c.horas) > 0)
          .map((c) => ({
            membro_id: membroId,
            mes, ano,
            data: c.data,
            descricao: c.descricao.trim(),
            horas: Number(c.horas),
          }));
        if (rows.length > 0) {
          const { error } = await (supabase as any)
            .from("equipe_horas_complementares")
            .insert(rows);
          if (error) throw error;
        }
      }
      toast.success("Horas complementares salvas.");
    } catch (e: any) {
      toast.error("Erro ao salvar: " + (e?.message ?? "desconhecido"));
    }
  };

  const gerar = async () => {
    setGerando(true);
    setAnalise("");
    try {
      await salvarComplementares();
      const complementaresValidas = complementares
        .filter((c) => c.descricao.trim() && Number(c.horas) > 0)
        .map((c) => ({ data: c.data, descricao: c.descricao.trim(), horas: Number(c.horas) }));

      const { data, error } = await supabase.functions.invoke("relatorio-horas-estagio", {
        body: { membroId, mes, ano, prompt, horasComplementares: complementaresValidas },
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
      const doc = gerarRelatorioHorasPdf({
        escritorio,
        cargo: LABEL_CARGO[cargo],
        stats,
        dias,
        analise,
        horasComplementares: complementares
          .filter((c) => c.descricao.trim() && Number(c.horas) > 0)
          .map((c) => ({ data: c.data, descricao: c.descricao.trim(), horas: Number(c.horas) })),
      });
      const slug = membroNome.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      doc.save(`relatorio-horas-${slug}-${ano}-${String(mes).padStart(2, "0")}.pdf`);
      toast.success("PDF baixado.");
    } catch (e: any) {
      toast.error("Erro ao gerar PDF: " + (e?.message ?? "desconhecido"));
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Mês</Label>
              <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MESES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ano</Label>
              <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {anos.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Horas complementares */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Horas complementares</h3>
              <p className="text-xs text-muted-foreground">
                Atividades acadêmicas, cursos, palestras etc. Somadas ao total do mês.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={addComplementar}>
              <Plus className="w-4 h-4 mr-1" /> Adicionar
            </Button>
          </div>

          {complementares.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma hora complementar lançada neste mês.</p>
          ) : (
            <div className="space-y-2">
              {complementares.map((c, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-3">
                    <Label className="text-xs">Data</Label>
                    <Input type="date" value={c.data}
                      onChange={(e) => updateComplementar(i, { data: e.target.value })} />
                  </div>
                  <div className="col-span-6">
                    <Label className="text-xs">Descrição</Label>
                    <Input value={c.descricao}
                      placeholder="Ex.: Palestra de Direito Civil"
                      onChange={(e) => updateComplementar(i, { descricao: e.target.value })} />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Horas</Label>
                    <Input type="number" step="0.5" min={0} value={c.horas}
                      onChange={(e) => updateComplementar(i, { horas: Number(e.target.value) })} />
                  </div>
                  <div className="col-span-1">
                    <Button size="icon" variant="ghost" onClick={() => removeComplementar(i)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
              <p className="text-sm text-right">
                Total complementar: <strong>{totalComplementares.toFixed(2).replace(".", ",")} h</strong>
              </p>
            </div>
          )}

          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={salvarComplementares}>Salvar</Button>
          </div>
        </CardContent>
      </Card>

      {/* IA + geração */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div>
            <Label>Instruções para a IA (opcional)</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ex.: foque em pontualidade, com tom formal para a faculdade..."
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

          <Button onClick={gerar} disabled={gerando} className="w-full">
            {gerando ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Gerando...</> :
              <><Sparkles className="w-4 h-4 mr-2" /> Gerar com IA</>}
          </Button>

          {stats && (
            <div className="rounded-lg border p-3 bg-muted/30 text-sm space-y-1">
              <p><strong>{stats.membro}</strong> · {stats.competencia}</p>
              <p className="text-xs text-muted-foreground">
                Ponto: <strong>{stats.horas_trabalhadas_total.toFixed(2)}h</strong>
                {" "}+ Complementares: <strong>{totalComplementares.toFixed(2)}h</strong>
                {" "}= <strong>{(stats.horas_trabalhadas_total + totalComplementares).toFixed(2)}h</strong>
                {" "}/ {stats.horas_previstas_mes.toFixed(2)}h previstas
              </p>
              <p className="text-xs text-muted-foreground">
                {stats.dias_com_ponto}/{stats.dias_jornada_previstos} dias com ponto ·
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

          <div className="flex justify-end">
            <Button onClick={baixarPdf} disabled={!analise || !stats}>
              <FileDown className="w-4 h-4 mr-2" /> Baixar PDF
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
