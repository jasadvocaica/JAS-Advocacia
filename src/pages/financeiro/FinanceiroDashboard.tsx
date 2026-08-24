import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Wallet, TrendingUp, AlertCircle, Clock, CheckCircle2, Plus,
  FileText, ArrowUpRight, Loader2, Users, HandCoins, Settings, Calculator,
  TrendingDown, Package, GitCompare,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatBRL, formatDate } from "@/lib/format";

interface KPIs {
  recebidoMes: number;
  aReceber30: number;
  atrasado: number;
  exitoEstimado: number;
  contratosAtivos: number;
  parcelasAtrasadas: number;
  repassesPendentes: number;
}

interface ParcelaProx {
  id: string;
  numero_parcela: number;
  valor: number;
  data_vencimento: string;
  status: string;
  contrato_id: string;
  cliente_nome?: string;
}

export default function FinanceiroDashboard() {
  const { hasPermission, isGestor, roles } = useAuth();
  const podeVerCaixa = isGestor || roles.includes("controladoria");
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KPIs>({
    recebidoMes: 0, aReceber30: 0, atrasado: 0, exitoEstimado: 0,
    contratosAtivos: 0, parcelasAtrasadas: 0, repassesPendentes: 0,
  });
  const [proximas, setProximas] = useState<ParcelaProx[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const hoje = new Date();
      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
      const fim30 = new Date(hoje.getTime() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const hojeIso = hoje.toISOString().slice(0, 10);

      const [pagsMes, parc30, parcAtraso, contAtivos, exitoEst, repPend, proximasRes] = await Promise.all([
        supabase.from("honorarios_pagamentos").select("valor_recebido").gte("data_pagamento", inicioMes),
        supabase.from("honorarios_parcelas").select("valor").eq("status", "pendente").lte("data_vencimento", fim30).gte("data_vencimento", hojeIso),
        supabase.from("honorarios_parcelas").select("valor, id").in("status", ["pendente", "atrasado"]).lt("data_vencimento", hojeIso),
        supabase.from("honorarios_contratos").select("id", { count: "exact", head: true }).eq("status", "ativo"),
        supabase.from("honorarios_contratos").select("valor_exito_estimado").eq("alta_probabilidade_exito", true).not("valor_exito_estimado", "is", null),
        supabase.from("honorarios_repasses").select("valor_repasse").eq("status", "pendente"),
        supabase.from("honorarios_parcelas")
          .select("id, numero_parcela, valor, data_vencimento, status, contrato_id")
          .in("status", ["pendente", "atrasado"])
          .order("data_vencimento", { ascending: true })
          .limit(10),
      ]);

      if (!alive) return;

      const recebidoMes = (pagsMes.data ?? []).reduce((s, p: any) => s + Number(p.valor_recebido), 0);
      const aReceber30 = (parc30.data ?? []).reduce((s, p: any) => s + Number(p.valor), 0);
      const atrasadoArr = parcAtraso.data ?? [];
      const atrasado = atrasadoArr.reduce((s, p: any) => s + Number(p.valor), 0);
      const exitoEstimado = (exitoEst.data ?? []).reduce((s, c: any) => s + Number(c.valor_exito_estimado ?? 0), 0);
      const repassesPendentes = (repPend.data ?? []).reduce((s, r: any) => s + Number(r.valor_repasse), 0);

      // Buscar nomes de clientes para próximas parcelas
      const proxList = (proximasRes.data as any[]) ?? [];
      const contratoIds = Array.from(new Set(proxList.map(p => p.contrato_id)));
      let nomeMap: Record<string, string> = {};
      if (contratoIds.length) {
        const { data: cons } = await supabase
          .from("honorarios_contratos")
          .select("id, cliente_id, clientes:cliente_id(nome)")
          .in("id", contratoIds);
        (cons ?? []).forEach((c: any) => { nomeMap[c.id] = c.clientes?.nome ?? "—"; });
      }

      setKpis({
        recebidoMes,
        aReceber30,
        atrasado,
        exitoEstimado,
        contratosAtivos: contAtivos.count ?? 0,
        parcelasAtrasadas: atrasadoArr.length,
        repassesPendentes,
      });
      setProximas(proxList.map(p => ({ ...p, cliente_nome: nomeMap[p.contrato_id] })));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financeiro"
        description="Visão geral de honorários, recebimentos e repasses"
      >
        {isGestor && (
          <Button asChild variant="outline" size="sm">
            <Link to="/financeiro/dashboard">
              <TrendingUp className="w-4 h-4" /> Visão executiva
            </Link>
          </Button>
        )}
        {hasPermission("financeiro", "criar") && (
          <Button asChild variant="gold" size="sm">
            <Link to="/financeiro/contratos/novo">
              <Plus className="w-4 h-4" /> Novo contrato
            </Link>
          </Button>
        )}
      </PageHeader>

      {loading ? (
        <Card className="p-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </Card>
      ) : (
        <>
          {/* KPIs principais */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              icon={<CheckCircle2 className="w-3.5 h-3.5 text-success" />}
              label="Recebido no mês"
              value={formatBRL(kpis.recebidoMes)}
            />
            <KpiCard
              icon={<Clock className="w-3.5 h-3.5 text-amber-600" />}
              label="A receber (30d)"
              value={formatBRL(kpis.aReceber30)}
            />
            <KpiCard
              icon={<AlertCircle className="w-3.5 h-3.5 text-destructive" />}
              label="Em atraso"
              value={formatBRL(kpis.atrasado)}
              sub={`${kpis.parcelasAtrasadas} parcela${kpis.parcelasAtrasadas !== 1 ? "s" : ""}`}
            />
            <KpiCard
              icon={<TrendingUp className="w-3.5 h-3.5 text-gold" />}
              label="Êxito estimado"
              value={formatBRL(kpis.exitoEstimado)}
              sub="alta probabilidade"
            />
          </div>

          {/* Grupos organizados */}
          <div className="grid lg:grid-cols-2 gap-4">
            <SecaoAtalhos
              titulo="Receitas"
              descricao="Contratos, parcelas e pagamentos recebidos"
              cor="text-success"
              atalhos={[
                { to: "/financeiro/contratos", icon: FileText, label: "Contratos", badge: String(kpis.contratosAtivos), sub: "ativos" },
                { to: "/financeiro/parcelas", icon: CheckCircle2, label: "Parcelas a receber", sub: "baixa em lote" },
                { to: "/financeiro/pagamentos", icon: Wallet, label: "Pagamentos", sub: "histórico" },
              ]}
            />

            <SecaoAtalhos
              titulo="Repasses & comissões"
              descricao="Parceiros e equipe interna"
              cor="text-gold"
              atalhos={[
                { to: "/financeiro/repasses", icon: HandCoins, label: "Repasses a parceiros", badge: kpis.repassesPendentes > 0 ? formatBRL(kpis.repassesPendentes) : undefined, sub: "pendentes" },
                ...(isGestor ? [{ to: "/financeiro/comissoes-fechamento", icon: Calculator, label: "Comissões de fechamento", sub: "equipe interna" }] : []),
              ]}
            />

            {podeVerCaixa && (
              <SecaoAtalhos
                titulo="Despesas & caixa"
                descricao="Saídas, suprimentos e conciliação"
                cor="text-destructive"
                atalhos={[
                  { to: "/financeiro/saidas", icon: TrendingDown, label: "Saídas", sub: "despesas do escritório" },
                  { to: "/financeiro/suprimentos", icon: Package, label: "Suprimentos", sub: "recorrentes" },
                  { to: "/financeiro/conciliacao", icon: GitCompare, label: "Conciliação", sub: "pagamentos × parcelas" },
                ]}
              />
            )}

            {isGestor && (
              <SecaoAtalhos
                titulo="Gestão"
                descricao="Fechamento mensal e configurações"
                cor="text-primary"
                atalhos={[
                  { to: "/financeiro/fechamento", icon: Calculator, label: "Fechamento mensal", sub: "consolidado do mês" },
                  { to: "/financeiro/configuracoes", icon: Settings, label: "Configurações", sub: "alertas e padrões" },
                ]}
              />
            )}
          </div>

          {/* Próximas parcelas */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gold" />
                <h3 className="font-display text-lg">Próximas parcelas</h3>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link to="/financeiro/pagamentos">Ver todas <ArrowUpRight className="w-3.5 h-3.5 ml-1" /></Link>
              </Button>
            </div>

            {proximas.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhuma parcela pendente nos próximos dias.
              </p>
            ) : (
              <div className="divide-y">
                {proximas.map((p) => {
                  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
                  const venc = new Date(p.data_vencimento + "T00:00:00");
                  const atrasado = p.status === "atrasado" || venc < hoje;
                  return (
                    <Link
                      key={p.id}
                      to={`/financeiro/contratos/${p.contrato_id}`}
                      className="flex items-center justify-between py-2.5 gap-3 hover:bg-muted/40 -mx-2 px-2 rounded transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Badge
                          variant="outline"
                          className={atrasado
                            ? "bg-destructive/10 text-destructive border-destructive/30"
                            : "bg-amber-500/15 text-amber-600 border-amber-500/30"}
                        >
                          {atrasado ? "atrasado" : "pendente"}
                        </Badge>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{p.cliente_nome ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">
                            Parc. #{p.numero_parcela} · venc. {formatDate(p.data_vencimento)}
                          </p>
                        </div>
                      </div>
                      <span className="font-mono text-sm font-medium shrink-0">
                        {formatBRL(Number(p.valor))}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <p className="font-display text-2xl mt-1">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </Card>
  );
}

type AtalhoItem = { to: string; icon: typeof Users; label: string; badge?: string; sub?: string };

function SecaoAtalhos({ titulo, descricao, cor, atalhos }: { titulo: string; descricao: string; cor: string; atalhos: AtalhoItem[] }) {
  if (atalhos.length === 0) return null;
  return (
    <Card className="p-4">
      <div className="mb-3">
        <h3 className={`font-display text-base ${cor}`}>{titulo}</h3>
        <p className="text-xs text-muted-foreground">{descricao}</p>
      </div>
      <div className="space-y-1.5">
        {atalhos.map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
          >
            <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0 group-hover:bg-gold/10 transition-colors">
              <a.icon className="w-4 h-4 text-muted-foreground group-hover:text-gold-dark transition-colors" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{a.label}</p>
              {a.sub && <p className="text-[11px] text-muted-foreground truncate">{a.sub}</p>}
            </div>
            {a.badge && (
              <Badge variant="outline" className="bg-gold/10 text-gold-dark border-gold/30 shrink-0">
                {a.badge}
              </Badge>
            )}
            <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-gold transition-colors shrink-0" />
          </Link>
        ))}
      </div>
    </Card>
  );
}
