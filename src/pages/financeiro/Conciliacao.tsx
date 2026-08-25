import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft, Loader2, AlertTriangle, CheckCircle2, GitCompare, RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDate } from "@/lib/format";
import { toast } from "sonner";

interface Pagamento {
  id: string;
  contrato_id: string | null;
  parcela_id: string | null;
  cliente_id: string | null;
  data_pagamento: string;
  valor_recebido: number;
  tipo_pagamento: string | null;
  cliente?: { nome: string } | null;
}

interface Parcela {
  id: string;
  contrato_id: string;
  numero_parcela: number;
  valor: number;
  data_vencimento: string;
  status: string;
  asaas_payment_id?: string | null;
  asaas_status?: string | null;
  asaas_invoice_url?: string | null;
  asaas_ultimo_erro?: string | null;
  contrato?: { id: string; cliente_id: string; cliente?: { nome: string } | null } | null;
}

interface Inconsistencia {
  parcela: Parcela;
  pagamentos: Pagamento[];
  totalPago: number;
  diff: number;
}

export default function Conciliacao() {
  const hoje = new Date();
  const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10);
  const [inicio, setInicio] = useState(primeiroDia);
  const [fim, setFim] = useState(ultimoDia);
  const [loading, setLoading] = useState(true);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [corrigindo, setCorrigindo] = useState<string | null>(null);

  async function carregar() {
    setLoading(true);
    try {
      const [pagRes, parRes] = await Promise.all([
        supabase.from("honorarios_pagamentos")
          .select("id, contrato_id, parcela_id, cliente_id, data_pagamento, valor_recebido, tipo_pagamento, cliente:cliente_id(nome)")
          .gte("data_pagamento", inicio).lte("data_pagamento", fim)
          .order("data_pagamento", { ascending: true }),
        supabase.from("honorarios_parcelas")
          .select("id, contrato_id, numero_parcela, valor, data_vencimento, status, asaas_payment_id, asaas_status, asaas_invoice_url, asaas_ultimo_erro, contrato:honorarios_contratos!inner(id, cliente_id, cliente:clientes!inner(nome))")
          .gte("data_vencimento", inicio).lte("data_vencimento", fim)
          .order("data_vencimento", { ascending: true }),
      ]);
      if (pagRes.error) throw pagRes.error;
      if (parRes.error) throw parRes.error;
      setPagamentos((pagRes.data ?? []) as any);
      setParcelas((parRes.data ?? []) as any);
    } catch (e: any) {
      toast.error("Erro ao carregar: " + (e.message ?? "desconhecido"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [inicio, fim]);

  // ---------- Análise de inconsistências ----------

  // 1) Baixou sem pagamento: parcela.status='paga' mas sem pagamento vinculado
  // 2) Pagou mas não baixou: pagamento existe vinculado a parcela com status pendente/atrasado
  // 3) Divergência de valor: soma dos pagamentos !== valor da parcela
  // 4) Pagamento órfão: pagamento sem parcela_id (avulso) — apenas listado para revisão

  const analise = useMemo(() => {
    const pagsPorParcela = new Map<string, Pagamento[]>();
    const pagamentosOrfaos: Pagamento[] = [];
    for (const p of pagamentos) {
      if (p.parcela_id) {
        const arr = pagsPorParcela.get(p.parcela_id) ?? [];
        arr.push(p);
        pagsPorParcela.set(p.parcela_id, arr);
      } else {
        pagamentosOrfaos.push(p);
      }
    }

    const baixadasSemPagamento: Inconsistencia[] = [];
    const pagasNaoBaixadas: Inconsistencia[] = [];
    const divergenciaValor: Inconsistencia[] = [];

    for (const par of parcelas) {
      const pags = pagsPorParcela.get(par.id) ?? [];
      const totalPago = pags.reduce((s, p) => s + Number(p.valor_recebido || 0), 0);
      const valor = Number(par.valor || 0);
      const diff = totalPago - valor;
      const item: Inconsistencia = { parcela: par, pagamentos: pags, totalPago, diff };

      if (par.status === "pago" && pags.length === 0) {
        baixadasSemPagamento.push(item);
      } else if (par.status !== "pago" && totalPago >= valor && valor > 0) {
        pagasNaoBaixadas.push(item);
      } else if (pags.length > 0 && Math.abs(diff) > 0.01) {
        divergenciaValor.push(item);
      }
    }

    return { baixadasSemPagamento, pagasNaoBaixadas, divergenciaValor, pagamentosOrfaos };
  }, [pagamentos, parcelas]);

  async function marcarComoPaga(parcelaId: string) {
    setCorrigindo(parcelaId);
    try {
      const { error } = await supabase
        .from("honorarios_parcelas")
        .update({ status: "pago" })
        .eq("id", parcelaId);
      if (error) throw error;
      toast.success("Parcela baixada");
      await carregar();
    } catch (e: any) {
      toast.error("Erro: " + (e.message ?? "desconhecido"));
    } finally {
      setCorrigindo(null);
    }
  }

  async function reverterBaixa(parcelaId: string) {
    setCorrigindo(parcelaId);
    try {
      const { error } = await supabase
        .from("honorarios_parcelas")
        .update({ status: "pendente" })
        .eq("id", parcelaId);
      if (error) throw error;
      toast.success("Baixa revertida");
      await carregar();
    } catch (e: any) {
      toast.error("Erro: " + (e.message ?? "desconhecido"));
    } finally {
      setCorrigindo(null);
    }
  }

  const asaasParcelas = parcelas.filter(p => p.asaas_payment_id);
  const asaasComErro = asaasParcelas.filter(p => p.asaas_ultimo_erro);
  const asaasRecebidasSemBaixa = asaasParcelas.filter(p =>
    ["RECEIVED", "CONFIRMED"].includes(String(p.asaas_status ?? "")) && p.status !== "pago"
  );
  const totalInconsist =
    analise.baixadasSemPagamento.length +
    analise.pagasNaoBaixadas.length +
    analise.divergenciaValor.length +
    asaasComErro.length +
    asaasRecebidasSemBaixa.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Conciliação financeira"
        description="Cruza pagamentos recebidos com parcelas e identifica inconsistências."
      >
        <Button asChild variant="outline" size="sm">
          <Link to="/financeiro"><ArrowLeft className="w-4 h-4 mr-1" /> Voltar</Link>
        </Button>
        <Button variant="outline" size="sm" onClick={carregar} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </PageHeader>

      <Card className="p-4 flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">Início (vencimento / pagamento)</Label>
          <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="w-44 mt-1" />
        </div>
        <div>
          <Label className="text-xs">Fim</Label>
          <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className="w-44 mt-1" />
        </div>
        <div className="ml-auto flex items-center gap-3 text-sm">
          {totalInconsist === 0 && !loading ? (
            <Badge className="bg-success/15 text-success border-success/30 gap-1">
              <CheckCircle2 className="w-3 h-3" /> Sem inconsistências
            </Badge>
          ) : (
            <Badge className="bg-destructive/10 text-destructive border-destructive/30 gap-1">
              <AlertTriangle className="w-3 h-3" /> {totalInconsist} inconsistência(s)
            </Badge>
          )}
        </div>
      </Card>

      {loading ? (
        <Card className="p-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi label="Parcelas no período" value={String(parcelas.length)} />
            <Kpi label="Pagamentos no período" value={String(pagamentos.length)} />
            <Kpi label="Pagamentos órfãos" value={String(analise.pagamentosOrfaos.length)} sub="sem parcela vinculada" />
            <Kpi label="Inconsistências" value={String(totalInconsist)} highlight={totalInconsist > 0} />
            <Kpi label="Cobranças Asaas" value={String(asaasParcelas.length)} sub={`${asaasComErro.length} com erro`} highlight={asaasComErro.length > 0} />
          </div>

          <Tabs defaultValue="pagas-nao-baixadas">
            <TabsList>
              <TabsTrigger value="pagas-nao-baixadas">
                Pagou mas não baixou ({analise.pagasNaoBaixadas.length})
              </TabsTrigger>
              <TabsTrigger value="baixadas-sem-pagamento">
                Baixou sem pagamento ({analise.baixadasSemPagamento.length})
              </TabsTrigger>
              <TabsTrigger value="divergencia">
                Valor divergente ({analise.divergenciaValor.length})
              </TabsTrigger>
              <TabsTrigger value="orfaos">
                Pagamentos órfãos ({analise.pagamentosOrfaos.length})
              </TabsTrigger>
              <TabsTrigger value="asaas">
                Asaas ({asaasParcelas.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pagas-nao-baixadas" className="mt-4">
              <TabelaInconsistencia
                vazio="Tudo certo: nenhuma parcela paga sem baixa."
                rows={analise.pagasNaoBaixadas}
                acaoLabel="Marcar como paga"
                onAcao={(id) => marcarComoPaga(id)}
                corrigindo={corrigindo}
              />
            </TabsContent>

            <TabsContent value="baixadas-sem-pagamento" className="mt-4">
              <TabelaInconsistencia
                vazio="Tudo certo: toda baixa tem pagamento associado."
                rows={analise.baixadasSemPagamento}
                acaoLabel="Reverter baixa"
                onAcao={(id) => reverterBaixa(id)}
                corrigindo={corrigindo}
              />
            </TabsContent>

            <TabsContent value="divergencia" className="mt-4">
              <TabelaInconsistencia
                vazio="Tudo certo: pagamentos batem com o valor das parcelas."
                rows={analise.divergenciaValor}
                acaoLabel={null}
                onAcao={() => {}}
                corrigindo={corrigindo}
              />
            </TabsContent>

            <TabsContent value="asaas" className="mt-4">
              <Card className="p-4">
                {asaasParcelas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma cobrança Asaas no período.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Vencimento</TableHead><TableHead>Cliente</TableHead>
                        <TableHead>Parcela</TableHead><TableHead>Status Asaas</TableHead>
                        <TableHead>Status interno</TableHead><TableHead className="text-right">Valor</TableHead><TableHead></TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {asaasParcelas.map(p => (
                          <TableRow key={p.id} className={p.asaas_ultimo_erro ? "bg-destructive/5" : ""}>
                            <TableCell>{formatDate(p.data_vencimento)}</TableCell>
                            <TableCell>{p.contrato?.cliente?.nome ?? "—"}</TableCell>
                            <TableCell>#{p.numero_parcela}</TableCell>
                            <TableCell><Badge variant="outline">{p.asaas_status ?? "aguardando"}</Badge></TableCell>
                            <TableCell><Badge variant="outline">{p.status}</Badge></TableCell>
                            <TableCell className="text-right font-mono">{formatBRL(Number(p.valor))}</TableCell>
                            <TableCell className="text-right">
                              {p.asaas_invoice_url && <Button asChild variant="ghost" size="sm"><a href={p.asaas_invoice_url} target="_blank" rel="noreferrer">Fatura</a></Button>}
                              {p.asaas_ultimo_erro && <span className="text-xs text-destructive ml-2">{p.asaas_ultimo_erro}</span>}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="orfaos" className="mt-4">
              <Card className="p-4">
                {analise.pagamentosOrfaos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum pagamento sem parcela vinculada.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analise.pagamentosOrfaos.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell>{formatDate(p.data_pagamento)}</TableCell>
                            <TableCell>{p.cliente?.nome ?? "—"}</TableCell>
                            <TableCell className="capitalize">{p.tipo_pagamento ?? "—"}</TableCell>
                            <TableCell className="text-right font-mono">{formatBRL(Number(p.valor_recebido))}</TableCell>
                            <TableCell>
                              {p.contrato_id && (
                                <Button asChild variant="ghost" size="sm">
                                  <Link to={`/financeiro/contratos/${p.contrato_id}`}>Abrir contrato</Link>
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <Card className={`p-4 ${highlight ? "border-destructive/40" : ""}`}>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`font-display text-2xl mt-1 ${highlight ? "text-destructive" : ""}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </Card>
  );
}

function TabelaInconsistencia({
  rows, vazio, acaoLabel, onAcao, corrigindo,
}: {
  rows: Inconsistencia[];
  vazio: string;
  acaoLabel: string | null;
  onAcao: (parcelaId: string) => void;
  corrigindo: string | null;
}) {
  if (rows.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
        <CheckCircle2 className="w-6 h-6 text-success" />
        {vazio}
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vencimento</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Parcela</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Valor parcela</TableHead>
              <TableHead className="text-right">Total pago</TableHead>
              <TableHead className="text-right">Diferença</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ parcela, totalPago, diff }) => (
              <TableRow key={parcela.id}>
                <TableCell>{formatDate(parcela.data_vencimento)}</TableCell>
                <TableCell>{parcela.contrato?.cliente?.nome ?? "—"}</TableCell>
                <TableCell>#{parcela.numero_parcela}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">{parcela.status}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono">{formatBRL(Number(parcela.valor))}</TableCell>
                <TableCell className="text-right font-mono">{formatBRL(totalPago)}</TableCell>
                <TableCell className={`text-right font-mono ${Math.abs(diff) > 0.01 ? "text-destructive" : "text-muted-foreground"}`}>
                  {formatBRL(diff)}
                </TableCell>
                <TableCell className="space-x-1 text-right">
                  {parcela.contrato_id && (
                    <Button asChild variant="ghost" size="sm">
                      <Link to={`/financeiro/contratos/${parcela.contrato_id}`}>Abrir</Link>
                    </Button>
                  )}
                  {acaoLabel && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={corrigindo === parcela.id}
                      onClick={() => onAcao(parcela.id)}
                    >
                      {corrigindo === parcela.id ? <Loader2 className="w-3 h-3 animate-spin" /> : acaoLabel}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
