import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, FileDown, ArrowLeft } from "lucide-react";

interface Comissao {
  id: string; beneficiario: string; tipo_beneficiario: "estagiaria" | "parceiro";
  caso_id: string | null; evento_gerador: string;
  valor_honorarios: number; valor_comissao: number;
  data_competencia: string; status: "a_pagar" | "pago";
  data_pagamento: string | null; forma_pagamento: string | null;
}
interface ProcessoLite { id: string; numero_cnj: string | null; cliente_nome?: string }

const ESTAGIARIAS = ["Alanis", "Valeska"];
const PARCEIROS = ["Luciana (GO)", "Matheus (PA)", "Gabriel (RJ)", "Francisco (MG)", "Daniela (RO)", "Amanda (local)"];
const EVENTO_LABEL: Record<string, string> = {
  indicacao_fechada: "Indicação fechada",
  contrato_assinado: "Contrato assinado",
  caso_encaminhado: "Caso encaminhado",
};
const fmtBRL = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (d: string | null) => d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

export default function ComissoesExtrato() {
  const hoje = new Date();
  const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10);

  const [beneficiario, setBeneficiario] = useState<string>("Alanis");
  const [inicio, setInicio] = useState(primeiroDia);
  const [fim, setFim] = useState(ultimoDia);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Comissao[]>([]);
  const [processos, setProcessos] = useState<Record<string, ProcessoLite>>({});

  async function carregar() {
    setLoading(true);
    const { data, error } = await supabase.from("comissoes").select("*")
      .eq("beneficiario", beneficiario)
      .gte("data_competencia", inicio).lte("data_competencia", fim)
      .order("data_competencia", { ascending: false });
    if (error) toast.error(error.message);
    const list = (data ?? []) as Comissao[];
    setItems(list);

    const ids = Array.from(new Set(list.map(l => l.caso_id).filter(Boolean) as string[]));
    if (ids.length) {
      const { data: ps } = await supabase.from("processos")
        .select("id, numero_cnj, clientes:cliente_id(nome)").in("id", ids);
      const map: Record<string, ProcessoLite> = {};
      for (const p of (ps ?? []) as any[]) {
        map[p.id] = { id: p.id, numero_cnj: p.numero_cnj, cliente_nome: p.clientes?.nome };
      }
      setProcessos(map);
    } else setProcessos({});
    setLoading(false);
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [beneficiario, inicio, fim]);

  const totais = useMemo(() => {
    let aPagar = 0, pago = 0;
    for (const c of items) {
      if (c.status === "pago") pago += Number(c.valor_comissao);
      else aPagar += Number(c.valor_comissao);
    }
    return { aPagar, pago, total: aPagar + pago };
  }, [items]);

  function casoLabel(id: string | null) {
    if (!id) return "—";
    const p = processos[id];
    if (!p) return "Processo";
    return `${p.numero_cnj || ""} ${p.cliente_nome ? "— " + p.cliente_nome : ""}`.trim() || "Processo";
  }

  async function exportarPDF() {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold"); doc.setFontSize(16);
    doc.text(`Extrato de Comissões — ${beneficiario}`, 14, 18);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.text(`Período: ${fmtData(inicio)} a ${fmtData(fim)}`, 14, 25);
    doc.text(`Juliana Araujo Advocacia`, 14, 31);

    autoTable(doc, {
      startY: 38,
      head: [["Competência", "Caso", "Evento", "Honorários", "Comissão", "Status", "Pagamento"]],
      body: items.map(c => [
        fmtData(c.data_competencia),
        casoLabel(c.caso_id),
        EVENTO_LABEL[c.evento_gerador] ?? c.evento_gerador,
        fmtBRL(Number(c.valor_honorarios)),
        fmtBRL(Number(c.valor_comissao)),
        c.status === "pago" ? "Pago" : "A pagar",
        c.status === "pago" ? `${fmtData(c.data_pagamento)} (${c.forma_pagamento ?? "-"})` : "—",
      ]),
      headStyles: { fillColor: [1, 4, 35] },
      styles: { font: "helvetica", fontSize: 8 },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFont("helvetica", "bold");
    doc.text(`Total a pagar: ${fmtBRL(totais.aPagar)}`, 14, finalY);
    doc.text(`Total pago:    ${fmtBRL(totais.pago)}`, 14, finalY + 6);
    doc.text(`Total geral:   ${fmtBRL(totais.total)}`, 14, finalY + 12);

    doc.save(`extrato-comissoes-${beneficiario}-${inicio}_${fim}.pdf`);
    toast.success("Extrato exportado");
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Extrato de comissões" description="Histórico completo por beneficiário no período.">
        <Button asChild variant="outline" className="gap-2">
          <Link to="/equipe/comissoes"><ArrowLeft className="w-4 h-4" /> Voltar</Link>
        </Button>
        <Button onClick={exportarPDF} className="gap-2" disabled={items.length === 0}>
          <FileDown className="w-4 h-4" /> Exportar PDF
        </Button>
      </PageHeader>

      <Card><CardContent className="pt-6 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Beneficiário</Label>
          <Select value={beneficiario} onValueChange={setBeneficiario}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <div className="px-2 py-1 text-xs text-muted-foreground">Estagiárias</div>
              {ESTAGIARIAS.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              <div className="px-2 py-1 text-xs text-muted-foreground">Parceiros</div>
              {PARCEIROS.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">De</Label>
          <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="w-44" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Até</Label>
          <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className="w-44" />
        </div>
      </CardContent></Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground uppercase">A pagar</p>
          <p className="font-display text-2xl text-amber-700">{fmtBRL(totais.aPagar)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground uppercase">Pago</p>
          <p className="font-display text-2xl text-emerald-700">{fmtBRL(totais.pago)}</p>
        </CardContent></Card>
        <Card className="border-gold/40"><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground uppercase">Total</p>
          <p className="font-display text-2xl text-gold">{fmtBRL(totais.total)}</p>
        </CardContent></Card>
      </div>

      <Card><CardContent className="pt-6">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gold" /></div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma comissão no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Caso</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead className="text-right">Comissão</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Pagamento</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {items.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="text-xs whitespace-nowrap">{fmtData(c.data_competencia)}</TableCell>
                    <TableCell className="text-xs max-w-[260px] truncate">{casoLabel(c.caso_id)}</TableCell>
                    <TableCell className="text-xs">{EVENTO_LABEL[c.evento_gerador]}</TableCell>
                    <TableCell className="text-right font-semibold">{fmtBRL(Number(c.valor_comissao))}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={c.status === "pago"
                        ? "border-emerald-500/40 text-emerald-700"
                        : "border-amber-500/40 text-amber-700"}>
                        {c.status === "pago" ? "Pago" : "A pagar"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {c.status === "pago" ? `${fmtData(c.data_pagamento)} · ${c.forma_pagamento ?? "—"}` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent></Card>
    </div>
  );
}
