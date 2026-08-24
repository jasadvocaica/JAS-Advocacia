import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, AlertTriangle, CheckCircle2, Activity } from "lucide-react";
import { startOfDay, subDays, format, startOfWeek, addWeeks, isBefore, isAfter } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEquipeInterna } from "./equipe";
import { ResponsavelAvatar } from "./ResponsavelAvatar";
import { TipoBadge } from "./TipoBadge";
import { TIPO_LABELS, STATUS_LABELS, TipoItem, StatusItem } from "./types";
import { cn } from "@/lib/utils";

type Periodo = 7 | 30 | 90;

interface ItemPerf {
  id: string;
  status: StatusItem;
  tipo: TipoItem;
  data_vencimento: string;
  criado_em: string;
  concluido_em: string | null;
  responsavel_id: string | null;
}

export default function ControladoriaPerformance() {
  const [periodo, setPeriodo] = useState<Periodo>(30);
  const [loading, setLoading] = useState(true);
  const [itens, setItens] = useState<ItemPerf[]>([]);
  const { equipe } = useEquipeInterna();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const desde = subDays(new Date(), periodo).toISOString();
      const { data } = await supabase
        .from("controladoria_itens")
        .select("id,status,tipo,data_vencimento,criado_em,concluido_em,responsavel_id")
        .or(`criado_em.gte.${desde},concluido_em.gte.${desde},status.in.(pendente,em_andamento,aguardando)`);
      setItens((data ?? []) as ItemPerf[]);
      setLoading(false);
    })();
  }, [periodo]);

  const stats = useMemo(() => {
    const now = new Date();
    const ativos = itens.filter((i) => i.status !== "concluido" && i.status !== "cancelado");
    const vencidos = ativos.filter((i) => isBefore(new Date(i.data_vencimento), startOfDay(now)));
    const concluidos = itens.filter((i) => i.status === "concluido" && i.concluido_em);
    return { ativos: ativos.length, vencidos: vencidos.length, concluidos: concluidos.length };
  }, [itens]);

  const porSemana = useMemo(() => {
    const semanas: { label: string; concluidos: number }[] = [];
    let cursor = startOfWeek(subDays(new Date(), 7 * 7), { weekStartsOn: 1 });
    for (let i = 0; i < 8; i++) {
      const fim = addWeeks(cursor, 1);
      const count = itens.filter((it) => it.concluido_em && isAfter(new Date(it.concluido_em), cursor) && isBefore(new Date(it.concluido_em), fim)).length;
      semanas.push({ label: format(cursor, "dd/MM", { locale: ptBR }), concluidos: count });
      cursor = fim;
    }
    return semanas;
  }, [itens]);

  const porResponsavel = useMemo(() => {
    return equipe.map((m) => {
      const meus = itens.filter((i) => i.responsavel_id === m.id);
      const ativos = meus.filter((i) => i.status !== "concluido" && i.status !== "cancelado");
      const atrasados = ativos.filter((i) => isBefore(new Date(i.data_vencimento), startOfDay(new Date())));
      const concluidos = meus.filter((i) => i.status === "concluido" && i.concluido_em);
      return { id: m.id, nome: m.nome, ativos: ativos.length, atrasados: atrasados.length, concluidos: concluidos.length };
    }).sort((a, b) => b.concluidos - a.concluidos);
  }, [itens, equipe]);

  const porTipo = useMemo(() => {
    const map = new Map<TipoItem, number>();
    itens.forEach((i) => map.set(i.tipo, (map.get(i.tipo) ?? 0) + 1));
    return Array.from(map.entries()).map(([tipo, value]) => ({ tipo, label: TIPO_LABELS[tipo], value }));
  }, [itens]);

  const porStatus = useMemo(() => {
    const ordem: StatusItem[] = ["pendente", "em_andamento", "aguardando", "concluido", "cancelado"];
    return ordem.map((s) => ({ status: s, label: STATUS_LABELS[s], value: itens.filter((i) => i.status === s).length }));
  }, [itens]);

  const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--gold))", "hsl(var(--success))", "hsl(var(--warning))", "hsl(var(--destructive))", "hsl(var(--accent-foreground))", "#8b5cf6", "#06b6d4", "#f59e0b", "#10b981", "#ec4899", "#6366f1", "#94a3b8"];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Performance da Controladoria"
        description="Métricas de produtividade e distribuição por responsável."
      >
        <Button asChild variant="outline" size="sm" className="gap-2">
          <Link to="/controladoria"><ArrowLeft className="w-4 h-4" /> Voltar</Link>
        </Button>
        <Select value={String(periodo)} onValueChange={(v) => setPeriodo(Number(v) as Periodo)}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 dias</SelectItem>
            <SelectItem value="30">30 dias</SelectItem>
            <SelectItem value="90">90 dias</SelectItem>
          </SelectContent>
        </Select>
      </PageHeader>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <Stat icon={<Activity className="w-4 h-4" />} label="Ativos" value={stats.ativos} tone="primary" />
            <Stat icon={<AlertTriangle className="w-4 h-4" />} label="Vencidos" value={stats.vencidos} tone="destructive" />
            <Stat icon={<CheckCircle2 className="w-4 h-4" />} label={`Concluídos (${periodo}d)`} value={stats.concluidos} tone="success" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Concluídos por semana</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={porSemana}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                      <Bar dataKey="concluidos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Distribuição por tipo</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={porTipo} dataKey="value" nameKey="label" outerRadius={70} label>
                        {porTipo.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Por status</CardTitle></CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={porStatus} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis type="category" dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} width={120} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                    <Bar dataKey="value" fill="hsl(var(--gold))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Por responsável</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Responsável</TableHead>
                    <TableHead className="text-right">Ativos</TableHead>
                    <TableHead className="text-right">Atrasados</TableHead>
                    <TableHead className="text-right">Concluídos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {porResponsavel.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="flex items-center gap-2">
                        <ResponsavelAvatar nome={r.nome} id={r.id} size="sm" />
                        <span>{r.nome}</span>
                      </TableCell>
                      <TableCell className="text-right">{r.ativos}</TableCell>
                      <TableCell className={cn("text-right", r.atrasados > 0 && "text-destructive font-medium")}>{r.atrasados}</TableCell>
                      <TableCell className="text-right">{r.concluidos}</TableCell>
                    </TableRow>
                  ))}
                  {porResponsavel.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sem dados</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string | number; tone: "primary" | "destructive" | "success" | "muted" }) {
  const cls = {
    primary: "bg-primary/10 text-primary border-primary/20",
    destructive: "bg-destructive/10 text-destructive border-destructive/20",
    success: "bg-success/10 text-success border-success/20",
    muted: "bg-muted text-muted-foreground border-border",
  }[tone];
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn("w-9 h-9 rounded-md border flex items-center justify-center shrink-0", cls)}>{icon}</div>
        <div className="min-w-0">
          <p className="text-2xl font-semibold leading-none">{value}</p>
          <p className="text-xs text-muted-foreground mt-1 truncate">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
