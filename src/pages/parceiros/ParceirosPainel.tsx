import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Loader2, HandCoins, AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatBRL, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { ParceiroAvatar } from "./ParceiroAvatar";

interface RepasseRow {
  id: string;
  parceiro_id: string;
  cliente_id: string;
  contrato_id: string;
  valor_repasse: number;
  status: string;
  data_repasse: string | null;
  criado_em: string;
  parceiros?: { nome: string };
  clientes?: { nome: string };
}

export default function ParceirosPainel() {
  const { isGestor } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<RepasseRow[]>([]);
  const [pagosMes, setPagosMes] = useState(0);
  const [parceirosAtivos, setParceirosAtivos] = useState(0);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [salvandoLote, setSalvandoLote] = useState(false);

  const load = async () => {
    setLoading(true);
    const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

    const [pendRes, mesRes, parcRes] = await Promise.all([
      supabase.from("honorarios_repasses")
        .select("id, parceiro_id, cliente_id, contrato_id, valor_repasse, status, data_repasse, criado_em, parceiros:parceiro_id(nome), clientes:cliente_id(nome)")
        .eq("status", "pendente")
        .order("criado_em", { ascending: true }),
      supabase.from("honorarios_repasses").select("valor_repasse").eq("status", "pago").gte("data_repasse", inicioMes),
      supabase.from("parceiros").select("id", { count: "exact", head: true }).eq("status", "ativo"),
    ]);

    setRows(((pendRes.data as any[]) ?? []) as RepasseRow[]);
    setPagosMes(((mesRes.data as any[]) ?? []).reduce((s, r) => s + Number(r.valor_repasse), 0));
    setParceirosAtivos(parcRes.count ?? 0);
    setSelecionados(new Set());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Agrupar por parceiro
  const grupos = useMemo(() => {
    const map = new Map<string, { nome: string; itens: RepasseRow[]; total: number }>();
    rows.forEach((r) => {
      const k = r.parceiro_id;
      if (!map.has(k)) map.set(k, { nome: r.parceiros?.nome ?? "—", itens: [], total: 0 });
      const g = map.get(k)!;
      g.itens.push(r);
      g.total += Number(r.valor_repasse);
    });
    return Array.from(map.entries()).map(([id, g]) => ({ id, ...g })).sort((a, b) => b.total - a.total);
  }, [rows]);

  const totalGeral = rows.reduce((s, r) => s + Number(r.valor_repasse), 0);
  const hoje = new Date();
  const atrasados = rows.filter((r) => {
    const dias = (hoje.getTime() - new Date(r.criado_em).getTime()) / 86400000;
    return dias > 7;
  });

  const toggleAll = (parceiroId: string, on: boolean) => {
    const novo = new Set(selecionados);
    rows.filter((r) => r.parceiro_id === parceiroId).forEach((r) => {
      if (on) novo.add(r.id); else novo.delete(r.id);
    });
    setSelecionados(novo);
  };

  const toggle = (id: string) => {
    const novo = new Set(selecionados);
    novo.has(id) ? novo.delete(id) : novo.add(id);
    setSelecionados(novo);
  };

  const confirmarLote = async () => {
    if (selecionados.size === 0) return;
    if (!confirm(`Marcar ${selecionados.size} repasse(s) como pago(s)?`)) return;
    setSalvandoLote(true);
    const hoje = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from("honorarios_repasses")
      .update({ status: "pago", data_repasse: hoje, forma_repasse: "pix" })
      .in("id", Array.from(selecionados));
    setSalvandoLote(false);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success(`${selecionados.size} repasse(s) confirmado(s)`);
    load();
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Painel de repasses" description="Visão consolidada de todos os parceiros">
        <Button asChild variant="ghost" size="sm">
          <Link to="/parceiros"><ArrowLeft className="w-4 h-4" /> Voltar</Link>
        </Button>
        {isGestor && selecionados.size > 0 && (
          <Button variant="gold" onClick={confirmarLote} disabled={salvandoLote}>
            {salvandoLote ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Confirmar {selecionados.size} em lote
          </Button>
        )}
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Total a repassar</div>
          <p className="font-display text-2xl text-amber-600">{formatBRL(totalGeral)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{rows.length} pendente{rows.length !== 1 ? "s" : ""}</p>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5 text-destructive" /> Atrasados +7d
          </div>
          <p className="font-display text-2xl text-destructive">{atrasados.length}</p>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Parceiros ativos</div>
          <p className="font-display text-2xl">{parceirosAtivos}</p>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Pagos no mês</div>
          <p className="font-display text-2xl text-success">{formatBRL(pagosMes)}</p>
        </Card>
      </div>

      {loading ? (
        <Card className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></Card>
      ) : grupos.length === 0 ? (
        <Card className="p-12 text-center">
          <HandCoins className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">Nenhum repasse pendente.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {grupos.map((g) => {
            const todos = g.itens.every((i) => selecionados.has(i.id));
            return (
              <Card key={g.id} className="overflow-hidden">
                <div className="flex items-center gap-3 p-4 border-b bg-muted/30">
                  {isGestor && (
                    <Checkbox checked={todos} onCheckedChange={(v) => toggleAll(g.id, !!v)} />
                  )}
                  <ParceiroAvatar nome={g.nome} size="sm" />
                  <div className="flex-1 min-w-0">
                    <Link to={`/parceiros/${g.id}`} className="font-medium hover:text-gold truncate block">{g.nome}</Link>
                    <p className="text-xs text-muted-foreground">{g.itens.length} pendente{g.itens.length !== 1 ? "s" : ""}</p>
                  </div>
                  <span className="font-display text-xl text-amber-600">{formatBRL(g.total)}</span>
                </div>
                <div className="divide-y">
                  {g.itens.map((it) => {
                    const dias = Math.floor((hoje.getTime() - new Date(it.criado_em).getTime()) / 86400000);
                    return (
                      <div key={it.id} className="flex items-center gap-3 p-3 hover:bg-muted/40">
                        {isGestor && (
                          <Checkbox checked={selecionados.has(it.id)} onCheckedChange={() => toggle(it.id)} />
                        )}
                        <Link to={`/financeiro/contratos/${it.contrato_id}`} className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{it.clientes?.nome ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">
                            Gerado em {formatDate(it.criado_em)} ·{" "}
                            <span className={dias > 7 ? "text-destructive font-medium" : ""}>
                              {dias}d em aberto
                            </span>
                          </p>
                        </Link>
                        <span className="font-mono text-sm">{formatBRL(Number(it.valor_repasse))}</span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
