import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  TrendingUp, TrendingDown, Receipt, Calculator, Lock, Unlock, ChevronLeft, ChevronRight,
  Loader2, AlertCircle, CheckCircle2, ArrowUpRight, Megaphone, UserCircle2, HandCoins, Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatBRL } from "@/lib/format";
import {
  calcularSimplesNacional, calcularMarketing, calcularResultadoLiquido,
  nomeMes, ANEXO_IV, DISTRIBUICAO_ANEXO_IV,
} from "@/lib/simples-nacional";

interface FechamentoRow {
  id: string;
  mes: number;
  ano: number;
  receita_honorarios_fixo: number;
  receita_honorarios_exito: number;
  receita_consultoria: number;
  receita_outros: number;
  receita_total: number | null;
  repasses_parceiros: number;
  rbt12: number;
  faixa_simples: number | null;
  aliquota_nominal: number | null;
  aliquota_efetiva: number | null;
  valor_simples: number;
  detalhamento_tributos: Record<string, number> | null;
  percentual_marketing: number;
  valor_marketing: number;
  valor_pro_labore: number;
  outras_despesas: number;
  resultado_liquido: number | null;
  status: "aberto" | "fechado" | "revisao";
  fechado_em: string | null;
}

interface DadosCalculados {
  receitaTotal: number;
  repasses: number;
  simples: ReturnType<typeof calcularSimplesNacional>;
  valorMkt: number;
  proLabore: number;
  outras: number;
  liquido: number;
  margem: number;
  rbt12: number;
  pctMkt: number;
}

export default function FinanceiroDashboardGestor() {
  const { isGestor } = useAuth();
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [loading, setLoading] = useState(true);
  const [fech, setFech] = useState<FechamentoRow | null>(null);
  const [historico, setHistorico] = useState<FechamentoRow[]>([]);
  const [pctMktPadrao, setPctMktPadrao] = useState(5);
  // Quando não há fechamento salvo, usamos sugestões em tempo real
  const [sugestao, setSugestao] = useState<{
    receitaFixo: number; receitaExito: number; receitaDiligencias: number; repasses: number;
    rbt12: number; valorMkt: number; valorPl: number; saidas: number;
  } | null>(null);

  useEffect(() => {
    if (!isGestor) { setLoading(false); return; }
    let alive = true;
    (async () => {
      setLoading(true);

      const cfgRes = await supabase
        .from("financeiro_config_tributaria")
        .select("percentual_marketing_padrao, rbt12_manual")
        .order("atualizado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      const pctPadrao = Number(cfgRes.data?.percentual_marketing_padrao ?? 5);
      if (alive) setPctMktPadrao(pctPadrao);

      // Fechamento do mês corrente
      const fechRes = await supabase
        .from("financeiro_fechamento")
        .select("*")
        .eq("mes", mes).eq("ano", ano)
        .maybeSingle();

      // Histórico dos últimos 6 meses (para mini gráfico/lista)
      const dataIni = new Date(ano, mes - 6, 1);
      const histRes = await supabase
        .from("financeiro_fechamento")
        .select("*")
        .or(`and(ano.eq.${dataIni.getFullYear()},mes.gte.${dataIni.getMonth() + 1}),ano.gt.${dataIni.getFullYear()}`)
        .lte("ano", ano)
        .order("ano", { ascending: true })
        .order("mes", { ascending: true });

      if (!alive) return;

      const fechRow = fechRes.data as any as FechamentoRow | null;
      setFech(fechRow);
      setHistorico(((histRes.data ?? []) as any[]).filter((r) => {
        const d = new Date(r.ano, r.mes - 1, 1);
        return d <= new Date(ano, mes - 1, 1) && d >= dataIni;
      }) as FechamentoRow[]);

      // Se ainda não há fechamento, busca sugestões dos dados reais
      if (!fechRow) {
        const inicio = new Date(ano, mes - 1, 1).toISOString().slice(0, 10);
        const fim = new Date(ano, mes, 0).toISOString().slice(0, 10);
        const [pagsRes, repRes, rbt12Res, mktRes, plRes, diligRes, saidasRes] = await Promise.all([
          supabase.from("honorarios_pagamentos")
            .select("valor_recebido, tipo_pagamento")
            .gte("data_pagamento", inicio).lte("data_pagamento", fim),
          supabase.from("honorarios_repasses")
            .select("valor_repasse")
            .gte("criado_em", inicio).lte("criado_em", fim + "T23:59:59"),
          supabase.rpc("calcular_rbt12", { _mes: mes, _ano: ano }),
          supabase.from("financeiro_marketing_lancamentos")
            .select("valor").eq("mes", mes).eq("ano", ano),
          supabase.from("financeiro_pro_labore")
            .select("valor").eq("mes", mes).eq("ano", ano),
          (supabase as any).from("diligencias")
            .select("valor_recebido")
            .eq("natureza_receita", "escritorio")
            .gte("data_recebimento", inicio).lte("data_recebimento", fim)
            .eq("pagamento_status", "recebido"),
          (supabase as any).from("financeiro_saidas")
            .select("valor,status,data_pagamento")
            .gte("data_competencia", inicio).lte("data_competencia", fim),
        ]);
        if (!alive) return;

        const pags = (pagsRes.data ?? []) as any[];
        const recExito = pags.filter(p => p.tipo_pagamento === "exito")
          .reduce((s, p) => s + Number(p.valor_recebido || 0), 0);
        const recOutros = pags.filter(p => p.tipo_pagamento !== "exito")
          .reduce((s, p) => s + Number(p.valor_recebido || 0), 0);
        const repTotal = (repRes.data ?? []).reduce((s: number, r: any) => s + Number(r.valor_repasse || 0), 0);
        const mktTotal = (mktRes.data ?? []).reduce((s: number, m: any) => s + Number(m.valor || 0), 0);
        const plTotal = (plRes.data ?? []).reduce((s: number, p: any) => s + Number(p.valor || 0), 0);
        const rbt12 = Number((rbt12Res.data as any) ?? cfgRes.data?.rbt12_manual ?? 0);
        const receitaDiligencias = (diligRes.data ?? []).reduce((s: number, d: any) => s + Number(d.valor_recebido ?? 0), 0);
        const saidas = (saidasRes.data ?? []).filter((s: any) => s.status === "pago" || s.data_pagamento)
          .reduce((total: number, s: any) => total + Number(s.valor ?? 0), 0);

        setSugestao({
          receitaFixo: recOutros, receitaExito: recExito, receitaDiligencias,
          repasses: repTotal, rbt12, valorMkt: mktTotal, valorPl: plTotal, saidas,
        });
      } else {
        setSugestao(null);
      }

      setLoading(false);
    })();
    return () => { alive = false; };
  }, [mes, ano, isGestor]);

  const dados: DadosCalculados | null = useMemo(() => {
    if (fech) {
      const receitaTotal =
        Number(fech.receita_honorarios_fixo || 0) +
        Number(fech.receita_honorarios_exito || 0) +
        Number(fech.receita_consultoria || 0) +
        Number(fech.receita_outros || 0);
      const simples = calcularSimplesNacional(receitaTotal, Number(fech.rbt12 || 0));
      const valorMkt = Number(fech.valor_marketing || 0) > 0
        ? Number(fech.valor_marketing)
        : calcularMarketing(receitaTotal, Number(fech.percentual_marketing || pctMktPadrao));
      const liquido = calcularResultadoLiquido({
        receitaTotal,
        repassesParceiros: Number(fech.repasses_parceiros || 0),
        valorSimples: simples.valorSimples,
        valorMarketing: valorMkt,
        valorProLabore: Number(fech.valor_pro_labore || 0),
        outrasDespesas: Number(fech.outras_despesas || 0),
      });
      return {
        receitaTotal,
        repasses: Number(fech.repasses_parceiros || 0),
        simples, valorMkt,
        proLabore: Number(fech.valor_pro_labore || 0),
        outras: Number(fech.outras_despesas || 0),
        liquido,
        margem: receitaTotal > 0 ? (liquido / receitaTotal) * 100 : 0,
        rbt12: Number(fech.rbt12 || 0),
        pctMkt: Number(fech.percentual_marketing || pctMktPadrao),
      };
    }
    if (sugestao) {
      const receitaTotal = sugestao.receitaFixo + sugestao.receitaExito + sugestao.receitaDiligencias;
      const simples = calcularSimplesNacional(receitaTotal, sugestao.rbt12);
      const valorMkt = sugestao.valorMkt > 0
        ? sugestao.valorMkt
        : calcularMarketing(receitaTotal, pctMktPadrao);
      const liquido = calcularResultadoLiquido({
        receitaTotal,
        repassesParceiros: sugestao.repasses,
        valorSimples: simples.valorSimples,
        valorMarketing: valorMkt,
        valorProLabore: sugestao.valorPl,
        outrasDespesas: sugestao.saidas,
      });
      return {
        receitaTotal,
        repasses: sugestao.repasses,
        simples, valorMkt,
        proLabore: sugestao.valorPl,
        outras: sugestao.saidas,
        liquido,
        margem: receitaTotal > 0 ? (liquido / receitaTotal) * 100 : 0,
        rbt12: sugestao.rbt12,
        pctMkt: pctMktPadrao,
      };
    }
    return null;
  }, [fech, sugestao, pctMktPadrao]);

  function navegar(delta: number) {
    let m = mes + delta, a = ano;
    if (m > 12) { m = 1; a++; }
    if (m < 1) { m = 12; a--; }
    setMes(m); setAno(a);
  }

  const fechado = fech?.status === "fechado";
  const proximaFaixa = useMemo(() => {
    if (!dados) return null;
    const idx = ANEXO_IV.findIndex(f => f.faixa === dados.simples.faixa);
    return idx >= 0 && idx < ANEXO_IV.length - 1 ? ANEXO_IV[idx + 1] : null;
  }, [dados]);
  const distanciaProxFaixa = useMemo(() => {
    if (!dados || !proximaFaixa) return 0;
    return Math.max(proximaFaixa.faixaMin - dados.rbt12, 0);
  }, [dados, proximaFaixa]);

  if (!isGestor) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard Financeiro" description="Acesso restrito" />
        <Card className="p-12 text-center">
          <Lock className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            Apenas o gestor pode acessar a visão executiva (DRE, Simples Nacional e fechamento).
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/financeiro">Voltar ao Financeiro</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard Executivo"
        description="DRE do mês · status de fechamento · principais números do Simples Nacional"
      >
        <Button asChild variant="outline" size="sm">
          <Link to="/financeiro">← Financeiro</Link>
        </Button>
        <Button asChild variant="gold" size="sm">
          <Link to={`/financeiro/fechamento`}>
            <Calculator className="w-4 h-4" /> Editar fechamento
          </Link>
        </Button>
      </PageHeader>

      {/* Período */}
      <Card className="p-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navegar(-1)}><ChevronLeft className="w-4 h-4" /></Button>
          <div className="font-display text-xl px-2 min-w-[200px] text-center">
            {nomeMes(mes)} / {ano}
          </div>
          <Button variant="ghost" size="icon" onClick={() => navegar(1)}><ChevronRight className="w-4 h-4" /></Button>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }).map((_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{nomeMes(i + 1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 6 }).map((_, i) => {
                const a = hoje.getFullYear() - 3 + i;
                return <SelectItem key={a} value={String(a)}>{a}</SelectItem>;
              })}
            </SelectContent>
          </Select>
          {fechado ? (
            <Badge className="bg-success/15 text-success border-success/30 gap-1">
              <CheckCircle2 className="w-3 h-3" /> Fechado
              {fech?.fechado_em && (
                <span className="ml-1 text-[10px] opacity-80">
                  em {new Date(fech.fechado_em).toLocaleDateString("pt-BR")}
                </span>
              )}
            </Badge>
          ) : fech ? (
            <Badge variant="outline" className="gap-1">
              <Unlock className="w-3 h-3" /> Em aberto
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 bg-warning/10 text-warning border-warning/30">
              <AlertCircle className="w-3 h-3" /> Não iniciado
            </Badge>
          )}
        </div>
      </Card>

      {loading ? (
        <Card className="p-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </Card>
      ) : !dados ? (
        <Card className="p-12 text-center">
          <p className="text-sm text-muted-foreground">Sem dados para o período selecionado.</p>
        </Card>
      ) : (
        <>
          {/* Banner de status */}
          {!fech && (
            <Card className="p-4 flex items-center gap-3 border-warning/40 bg-warning/5">
              <AlertCircle className="w-5 h-5 text-warning shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">Fechamento ainda não iniciado</p>
                <p className="text-xs text-muted-foreground">
                  Os números abaixo são <strong>sugestões em tempo real</strong> a partir de pagamentos, repasses, marketing e pró-labore lançados no sistema.
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to="/financeiro/fechamento">Iniciar fechamento <ArrowUpRight className="w-3 h-3 ml-1" /></Link>
              </Button>
            </Card>
          )}

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              icon={<TrendingUp className="w-3.5 h-3.5 text-success" />}
              label="Receita do mês"
              value={formatBRL(dados.receitaTotal)}
              sub={fech ? "valores fechados" : "sugerido"}
            />
            <KpiCard
              icon={<Receipt className="w-3.5 h-3.5 text-warning" />}
              label={`Simples · faixa ${dados.simples.faixa}`}
              value={formatBRL(dados.simples.valorSimples)}
              sub={`${dados.simples.aliquotaEfetiva.toFixed(2)}% efetiva`}
            />
            <KpiCard
              icon={<TrendingDown className="w-3.5 h-3.5 text-destructive" />}
              label="Repasses parceiros"
              value={formatBRL(dados.repasses)}
            />
            <KpiCard
              icon={<TrendingUp className="w-3.5 h-3.5 text-gold" />}
              label="Resultado líquido"
              value={formatBRL(dados.liquido)}
              sub={`${dados.margem.toFixed(1)}% margem`}
              tone={dados.liquido >= 0 ? "success" : "danger"}
            />
          </div>

          {/* Grid principal: DRE + Simples */}
          <div className="grid lg:grid-cols-3 gap-4">
            {/* DRE compacta */}
            <Card className="p-6 lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-gold" />
                  <h3 className="font-display text-lg">DRE do mês</h3>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/financeiro/fechamento">Editar <ArrowUpRight className="w-3.5 h-3.5 ml-1" /></Link>
                </Button>
              </div>

              <div className="space-y-1.5">
                <Linha label="Honorários fixos / mensalidades" value={fech?.receita_honorarios_fixo ?? sugestao?.receitaFixo ?? 0} />
                <Linha label="Honorários de êxito" value={fech?.receita_honorarios_exito ?? sugestao?.receitaExito ?? 0} />
                {!fech && <Linha label="Diligências recebidas" value={sugestao?.receitaDiligencias ?? 0} />}
                {fech && (
                  <>
                    <Linha label="Consultoria" value={fech.receita_consultoria} />
                    <Linha label="Outras receitas" value={fech.receita_outros} />
                  </>
                )}
                <Separator className="my-2" />
                <Linha label="(=) Receita total" value={dados.receitaTotal} bold />

                <Separator className="my-3" />
                <Linha label="(−) Repasses a parceiros" value={-dados.repasses} />
                <Linha
                  label={`(−) Simples Nacional (${dados.simples.aliquotaEfetiva.toFixed(2)}%)`}
                  value={-dados.simples.valorSimples}
                />
                <Linha label={`(−) Marketing (${dados.pctMkt}%)`} value={-dados.valorMkt} />
                <Linha label="(−) Pró-labore" value={-dados.proLabore} />
                {dados.outras > 0 && <Linha label="(−) Outras despesas" value={-dados.outras} />}
                <Separator className="my-2" />
                <Linha
                  label="(=) Resultado líquido"
                  value={dados.liquido}
                  bold
                  color={dados.liquido >= 0 ? "text-success" : "text-destructive"}
                />
                <p className="text-xs text-muted-foreground text-right pt-1">
                  Margem líquida: {dados.margem.toFixed(1)}%
                </p>
              </div>
            </Card>

            {/* Simples Nacional destaque */}
            <Card className="p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-warning" />
                <h3 className="font-display text-lg">Simples Nacional · Anexo IV</h3>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Faixa atual</span>
                  <span className="font-medium">{dados.simples.faixa} de 6</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">RBT12</span>
                  <span className="font-mono">{formatBRL(dados.rbt12)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Alíquota nominal</span>
                  <span>{dados.simples.aliquotaNominal.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Alíquota efetiva</span>
                  <span className="font-medium text-warning">{dados.simples.aliquotaEfetiva.toFixed(2)}%</span>
                </div>
                <Separator className="my-2" />
                <div className="flex justify-between">
                  <span className="text-sm font-medium">DAS estimado do mês</span>
                  <span className="font-mono font-semibold text-warning">{formatBRL(dados.simples.valorSimples)}</span>
                </div>
              </div>

              {proximaFaixa && distanciaProxFaixa > 0 && (
                <div className="p-3 rounded-md bg-muted/40 text-xs space-y-1">
                  <p className="font-medium">Próxima faixa: {proximaFaixa.faixa} ({(proximaFaixa.aliquota * 100).toFixed(1)}%)</p>
                  <p className="text-muted-foreground">
                    Faltam <span className="font-mono text-foreground">{formatBRL(distanciaProxFaixa)}</span> de RBT12
                    para mudar de faixa.
                  </p>
                </div>
              )}

              <Separator />

              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Distribuição dos tributos</p>
                <div className="space-y-1">
                  {Object.entries(DISTRIBUICAO_ANEXO_IV).map(([tributo, pct]) => (
                    <div key={tributo} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {tributo} <span className="opacity-60">({(pct * 100).toFixed(2)}%)</span>
                      </span>
                      <span className="font-mono">
                        {formatBRL(dados.simples.valorSimples * pct)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          {/* Detalhamento despesas + histórico */}
          <div className="grid lg:grid-cols-2 gap-4">
            <Card className="p-6 space-y-3">
              <h3 className="font-display text-lg flex items-center gap-2">
                <Wallet className="w-4 h-4 text-gold" /> Despesas do mês
              </h3>
              <Detalhe icon={<HandCoins className="w-3.5 h-3.5 text-destructive" />} label="Repasses a parceiros" value={dados.repasses} />
              <Detalhe icon={<Receipt className="w-3.5 h-3.5 text-warning" />} label="Simples Nacional (DAS)" value={dados.simples.valorSimples} />
              <Detalhe icon={<Megaphone className="w-3.5 h-3.5 text-primary" />} label={`Marketing (${dados.pctMkt}%)`} value={dados.valorMkt} />
              <Detalhe icon={<UserCircle2 className="w-3.5 h-3.5 text-gold" />} label="Pró-labore" value={dados.proLabore} />
              {dados.outras > 0 && (
                <Detalhe icon={<Wallet className="w-3.5 h-3.5 text-muted-foreground" />} label="Outras despesas" value={dados.outras} />
              )}
              <Separator />
              <div className="flex justify-between font-medium">
                <span>Total deduções</span>
                <span className="font-mono">
                  {formatBRL(dados.repasses + dados.simples.valorSimples + dados.valorMkt + dados.proLabore + dados.outras)}
                </span>
              </div>
            </Card>

            <Card className="p-6 space-y-3">
              <h3 className="font-display text-lg flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-gold" /> Últimos meses fechados
              </h3>
              {historico.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Nenhum mês fechado anteriormente.
                </p>
              ) : (
                <div className="divide-y">
                  {historico.slice(-6).reverse().map((h) => {
                    const liq = Number(h.resultado_liquido ?? 0);
                    const rec = Number(h.receita_total ?? 0);
                    const margem = rec > 0 ? (liq / rec) * 100 : 0;
                    return (
                      <div key={h.id} className="flex items-center justify-between py-2 text-sm">
                        <div className="flex items-center gap-2">
                          {h.status === "fechado"
                            ? <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                            : <Unlock className="w-3.5 h-3.5 text-muted-foreground" />}
                          <span>{nomeMes(h.mes)} / {h.ano}</span>
                        </div>
                        <div className="text-right">
                          <span className={`font-mono font-medium ${liq >= 0 ? "text-foreground" : "text-destructive"}`}>
                            {formatBRL(liq)}
                          </span>
                          <span className="ml-2 text-xs text-muted-foreground">{margem.toFixed(1)}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({
  icon, label, value, sub, tone,
}: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: "success" | "danger" }) {
  const valueColor =
    tone === "success" ? "text-success" :
    tone === "danger" ? "text-destructive" : "";
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <p className={`font-display text-2xl mt-1 ${valueColor}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </Card>
  );
}

function Linha({ label, value, bold, color }: { label: string; value: number; bold?: boolean; color?: string }) {
  return (
    <div className={`flex justify-between text-sm ${bold ? "font-semibold" : ""} ${color ?? ""}`}>
      <span>{label}</span>
      <span className="font-mono">{formatBRL(value)}</span>
    </div>
  );
}

function Detalhe({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">{icon} {label}</span>
      <span className="font-mono">{formatBRL(value)}</span>
    </div>
  );
}
