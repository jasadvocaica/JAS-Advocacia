import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, FileDown, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface Meta {
  id: string; nome: string; tipo: string; valor_alvo: number;
  periodo: string; responsavel: string; status: string;
  data_inicio: string; data_fim: string;
}
interface Progresso { meta_id: string; valor_lancado: number; data_lancamento: string }

const STATUS_LABEL: Record<string, string> = { ativa: "Ativa", pausada: "Pausada", concluida: "Concluída" };
const TIPO_LABEL: Record<string, string> = {
  faturamento_mensal: "Faturamento mensal",
  contratos_fechados: "Contratos fechados",
  atendimentos: "Atendimentos",
  casos_por_area: "Casos por área",
  personalizada: "Personalizada",
};

function fmt(v: number, tipo: string) {
  if (tipo === "faturamento_mensal") return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return v.toLocaleString("pt-BR");
}

function corPct(p: number) {
  if (p >= 80) return "text-emerald-600";
  if (p >= 50) return "text-amber-600";
  return "text-red-600";
}

export default function MetasRelatorio() {
  const hoje = new Date();
  const [mes, setMes] = useState(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`);
  const [loading, setLoading] = useState(true);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [progressos, setProgressos] = useState<Progresso[]>([]);

  async function carregar() {
    setLoading(true);
    const inicio = `${mes}-01`;
    const [ano, m] = mes.split("-").map(Number);
    const fim = new Date(ano, m, 0).toISOString().slice(0, 10);

    const [mr, pr] = await Promise.all([
      supabase.from("metas").select("*")
        .lte("data_inicio", fim).gte("data_fim", inicio)
        .order("nome"),
      supabase.from("progresso_metas").select("meta_id, valor_lancado, data_lancamento")
        .gte("data_lancamento", inicio).lte("data_lancamento", fim),
    ]);
    if (mr.error) toast.error(mr.error.message);
    if (pr.error) toast.error(pr.error.message);
    setMetas((mr.data ?? []) as Meta[]);
    setProgressos((pr.data ?? []) as Progresso[]);
    setLoading(false);
  }

  useEffect(() => { carregar(); }, [mes]);

  const linhas = useMemo(() => metas.map(m => {
    const realizado = progressos.filter(p => p.meta_id === m.id)
      .reduce((acc, p) => acc + Number(p.valor_lancado), 0);
    const pct = m.valor_alvo > 0 ? (realizado / m.valor_alvo) * 100 : 0;
    return { ...m, realizado, pct };
  }), [metas, progressos]);

  async function exportarPDF() {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF();
    const [ano, m] = mes.split("-");
    const titulo = `Relatório de Metas — ${m}/${ano}`;
    doc.setFont("helvetica", "bold"); doc.setFontSize(16);
    doc.text(titulo, 14, 18);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.text("Juliana Araujo Advocacia", 14, 25);

    autoTable(doc, {
      startY: 32,
      head: [["Meta", "Responsável", "Alvo", "Realizado", "% Atingido", "Status"]],
      body: linhas.map(l => [
        l.nome,
        l.responsavel,
        fmt(Number(l.valor_alvo), l.tipo),
        fmt(l.realizado, l.tipo),
        `${l.pct.toFixed(1)}%`,
        STATUS_LABEL[l.status] ?? l.status,
      ]),
      headStyles: { fillColor: [1, 4, 35] },
      styles: { font: "helvetica", fontSize: 9 },
    });

    doc.save(`metas-${mes}.pdf`);
    toast.success("Relatório exportado");
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Relatório mensal de metas" description="Resumo consolidado das metas do mês selecionado.">
        <Button asChild variant="outline" className="gap-2">
          <Link to="/equipe/metas"><ArrowLeft className="w-4 h-4" /> Voltar</Link>
        </Button>
        <Button onClick={exportarPDF} className="gap-2" disabled={linhas.length === 0}>
          <FileDown className="w-4 h-4" /> Exportar PDF
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Mês de referência</Label>
            <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="w-48" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gold" />
            </div>
          ) : linhas.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">Nenhuma meta no período.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Meta</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead className="text-right">Alvo</TableHead>
                    <TableHead className="text-right">Realizado</TableHead>
                    <TableHead className="text-right">% Atingido</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map(l => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <div className="font-medium">{l.nome}</div>
                        <div className="text-xs text-muted-foreground">{TIPO_LABEL[l.tipo] ?? l.tipo}</div>
                      </TableCell>
                      <TableCell>{l.responsavel}</TableCell>
                      <TableCell className="text-right">{fmt(Number(l.valor_alvo), l.tipo)}</TableCell>
                      <TableCell className="text-right">{fmt(l.realizado, l.tipo)}</TableCell>
                      <TableCell className={cn("text-right font-semibold", corPct(l.pct))}>
                        {l.pct.toFixed(1)}%
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{STATUS_LABEL[l.status] ?? l.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
