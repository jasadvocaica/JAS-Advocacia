import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import * as XLSX from "xlsx";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Download, Loader2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDate } from "@/lib/format";
import { toast } from "sonner";

interface Repasse {
  id: string;
  valor_repasse: number;
  status: string;
  data_repasse: string | null;
  criado_em: string;
  base_calculo: string | null;
  percentual_aplicado: number | null;
  contrato_id: string;
  parceiro_id: string;
  cliente_id: string;
  parceiro_nome: string;
  cliente_nome: string;
  contrato_titulo: string | null;
}

interface ResumoParceiro {
  parceiro_id: string;
  parceiro_nome: string;
  qtd_total: number;
  qtd_pendente: number;
  qtd_pago: number;
  total_pendente: number;
  total_pago: number;
  total_geral: number;
  repasses: Repasse[];
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function inicioMes() {
  const d = new Date();
  return ymd(new Date(d.getFullYear(), d.getMonth(), 1));
}

export default function RepassesPorParceiro() {
  const [repasses, setRepasses] = useState<Repasse[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataInicio, setDataInicio] = useState(inicioMes());
  const [dataFim, setDataFim] = useState(ymd(new Date()));
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [campoData, setCampoData] = useState<"criacao" | "pagamento">("criacao");
  const [parceiroExpandido, setParceiroExpandido] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("honorarios_repasses")
      .select(`
        id, valor_repasse, status, data_repasse, criado_em,
        base_calculo, percentual_aplicado, contrato_id, parceiro_id, cliente_id,
        parceiros:parceiro_id(nome),
        clientes:cliente_id(nome),
        honorarios_contratos:contrato_id(titulo)
      `)
      .order("criado_em", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar repasses: " + error.message);
      setLoading(false);
      return;
    }

    setRepasses(((data as any[]) ?? []).map((r) => ({
      id: r.id,
      valor_repasse: Number(r.valor_repasse),
      status: r.status,
      data_repasse: r.data_repasse,
      criado_em: r.criado_em,
      base_calculo: r.base_calculo,
      percentual_aplicado: r.percentual_aplicado,
      contrato_id: r.contrato_id,
      parceiro_id: r.parceiro_id,
      cliente_id: r.cliente_id,
      parceiro_nome: r.parceiros?.nome ?? "—",
      cliente_nome: r.clientes?.nome ?? "—",
      contrato_titulo: r.honorarios_contratos?.titulo ?? null,
    })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtrados = useMemo(() => {
    return repasses.filter((r) => {
      if (statusFiltro !== "todos" && r.status !== statusFiltro) return false;
      const dataRef = campoData === "pagamento"
        ? (r.data_repasse ?? r.criado_em.slice(0, 10))
        : r.criado_em.slice(0, 10);
      if (campoData === "pagamento" && !r.data_repasse) return false;
      if (dataInicio && dataRef < dataInicio) return false;
      if (dataFim && dataRef > dataFim) return false;
      return true;
    });
  }, [repasses, statusFiltro, dataInicio, dataFim, campoData]);

  const resumos: ResumoParceiro[] = useMemo(() => {
    const map = new Map<string, ResumoParceiro>();
    for (const r of filtrados) {
      const key = r.parceiro_id;
      if (!map.has(key)) {
        map.set(key, {
          parceiro_id: key,
          parceiro_nome: r.parceiro_nome,
          qtd_total: 0,
          qtd_pendente: 0,
          qtd_pago: 0,
          total_pendente: 0,
          total_pago: 0,
          total_geral: 0,
          repasses: [],
        });
      }
      const res = map.get(key)!;
      res.qtd_total += 1;
      res.total_geral += r.valor_repasse;
      if (r.status === "pendente") {
        res.qtd_pendente += 1;
        res.total_pendente += r.valor_repasse;
      } else if (r.status === "pago") {
        res.qtd_pago += 1;
        res.total_pago += r.valor_repasse;
      }
      res.repasses.push(r);
    }
    return Array.from(map.values()).sort((a, b) => b.total_geral - a.total_geral);
  }, [filtrados]);

  const totaisGerais = useMemo(() => ({
    qtd: filtrados.length,
    geral: filtrados.reduce((s, r) => s + r.valor_repasse, 0),
    pendente: filtrados.filter(r => r.status === "pendente").reduce((s, r) => s + r.valor_repasse, 0),
    pago: filtrados.filter(r => r.status === "pago").reduce((s, r) => s + r.valor_repasse, 0),
  }), [filtrados]);

  const periodoLabel = `${formatDate(dataInicio)} a ${formatDate(dataFim)}`;

  const exportarXLSX = () => {
    const wb = XLSX.utils.book_new();

    // Aba 1: resumo por parceiro
    const resumoSheet = [
      ["Resumo de repasses por parceiro"],
      [`Período: ${periodoLabel}`],
      [`Filtro de status: ${statusFiltro}`],
      [`Critério de data: ${campoData === "pagamento" ? "Data do pagamento" : "Data de criação"}`],
      [],
      ["Parceiro", "Qtd total", "Qtd pendente", "Qtd paga", "Total pendente", "Total pago", "Total geral"],
      ...resumos.map(r => [
        r.parceiro_nome,
        r.qtd_total,
        r.qtd_pendente,
        r.qtd_pago,
        r.total_pendente,
        r.total_pago,
        r.total_geral,
      ]),
      [],
      ["TOTAIS", totaisGerais.qtd, "", "", totaisGerais.pendente, totaisGerais.pago, totaisGerais.geral],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(resumoSheet);
    ws1["!cols"] = [{ wch: 32 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws1, "Resumo por parceiro");

    // Aba 2: detalhamento
    const detalheSheet = [
      ["Parceiro", "Cliente", "Contrato", "Valor", "%", "Base de cálculo", "Status", "Data criação", "Data pagamento"],
      ...filtrados.map(r => [
        r.parceiro_nome,
        r.cliente_nome,
        r.contrato_titulo ?? "—",
        r.valor_repasse,
        r.percentual_aplicado ?? "valor fixo",
        r.base_calculo ?? "",
        r.status,
        r.criado_em.slice(0, 10),
        r.data_repasse ?? "",
      ]),
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(detalheSheet);
    ws2["!cols"] = [{ wch: 28 }, { wch: 28 }, { wch: 24 }, { wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Detalhamento");

    XLSX.writeFile(wb, `repasses-por-parceiro-${dataInicio}-a-${dataFim}.xlsx`);
    toast.success("Planilha exportada");
  };

  const exportarCSV = () => {
    const linhas = [
      ["Parceiro", "Qtd total", "Qtd pendente", "Qtd paga", "Total pendente", "Total pago", "Total geral"],
      ...resumos.map(r => [
        r.parceiro_nome,
        r.qtd_total,
        r.qtd_pendente,
        r.qtd_pago,
        r.total_pendente.toFixed(2),
        r.total_pago.toFixed(2),
        r.total_geral.toFixed(2),
      ]),
    ];
    const csv = linhas.map(l => l.map(c => {
      const s = String(c ?? "");
      return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `repasses-por-parceiro-${dataInicio}-a-${dataFim}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Repasses por parceiro"
        description="Resumo consolidado e exportação para conferência ou pagamento"
      >
        <Button asChild variant="ghost" size="sm">
          <Link to="/financeiro/repasses"><ArrowLeft className="w-4 h-4" /> Voltar</Link>
        </Button>
      </PageHeader>

      {/* Filtros */}
      <Card className="p-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Critério</Label>
            <Select value={campoData} onValueChange={(v: "criacao" | "pagamento") => setCampoData(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="criacao">Data de criação</SelectItem>
                <SelectItem value="pagamento">Data de pagamento</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={statusFiltro} onValueChange={setStatusFiltro}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pendente">Pendentes</SelectItem>
                <SelectItem value="pago">Pagos</SelectItem>
                <SelectItem value="cancelado">Cancelados</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button variant="outline" size="sm" onClick={exportarCSV} disabled={resumos.length === 0}>
              <Download className="w-4 h-4 mr-1" /> CSV
            </Button>
            <Button variant="gold" size="sm" onClick={exportarXLSX} disabled={resumos.length === 0}>
              <Download className="w-4 h-4 mr-1" /> XLSX
            </Button>
          </div>
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Parceiros</div>
          <p className="font-display text-2xl">{resumos.length}</p>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Total geral</div>
          <p className="font-display text-2xl">{formatBRL(totaisGerais.geral)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{totaisGerais.qtd} repasses</p>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">A pagar</div>
          <p className="font-display text-2xl text-warning">{formatBRL(totaisGerais.pendente)}</p>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Já pago</div>
          <p className="font-display text-2xl text-success">{formatBRL(totaisGerais.pago)}</p>
        </Card>
      </div>

      {/* Tabela de resumo */}
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : resumos.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">
              Nenhum repasse no período selecionado.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Parceiro</TableHead>
                <TableHead className="text-center">Qtd</TableHead>
                <TableHead className="text-right">A pagar</TableHead>
                <TableHead className="text-right">Pago</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resumos.map((r) => {
                const aberto = parceiroExpandido === r.parceiro_id;
                return (
                  <>
                    <TableRow
                      key={r.parceiro_id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => setParceiroExpandido(aberto ? null : r.parceiro_id)}
                    >
                      <TableCell className="font-medium">{r.parceiro_nome}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">{r.qtd_total}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-warning">
                        {r.total_pendente > 0 ? formatBRL(r.total_pendente) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-success">
                        {r.total_pago > 0 ? formatBRL(r.total_pago) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {formatBRL(r.total_geral)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>
                          <Link to={`/parceiros/${r.parceiro_id}`}>Abrir</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                    {aberto && (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-muted/30 p-0">
                          <div className="p-4 space-y-1">
                            {r.repasses.map((rep) => (
                              <div
                                key={rep.id}
                                className="flex items-center justify-between text-xs gap-2 py-1.5 border-b border-border/50 last:border-0"
                              >
                                <div className="flex-1 min-w-0">
                                  <span className="text-muted-foreground">{formatDate(rep.criado_em)}</span>
                                  {" · "}
                                  <span>{rep.cliente_nome}</span>
                                  {rep.contrato_titulo && (
                                    <span className="text-muted-foreground"> · {rep.contrato_titulo}</span>
                                  )}
                                </div>
                                <Badge variant="outline" className={
                                  rep.status === "pago" ? "bg-success/15 text-success border-success/30" :
                                  rep.status === "pendente" ? "bg-warning/15 text-warning border-warning/30" :
                                  "bg-muted"
                                }>{rep.status}</Badge>
                                <span className="font-mono w-24 text-right">{formatBRL(rep.valor_repasse)}</span>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
