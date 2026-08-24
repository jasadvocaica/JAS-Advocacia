import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface RegMes {
  data: string;
  entrada: string | null;
  saida_almoco: string | null;
  retorno_almoco: string | null;
  saida: string | null;
  horas_trabalhadas: number | null;
}

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function formatHora(t: string | null): string {
  return t ? t.slice(0, 5).replace(":", "h") : "—";
}

function ehDiaUtil(d: Date) {
  const dow = d.getDay();
  return dow !== 0 && dow !== 6;
}

function statusDia(r: RegMes | null, d: Date): { label: string; cor: string } {
  const futuro = d > new Date();
  if (futuro) return { label: "—", cor: "text-muted-foreground" };
  if (!r || !r.entrada) {
    if (ehDiaUtil(d)) return { label: "Sem registro", cor: "text-destructive" };
    return { label: "—", cor: "text-muted-foreground" };
  }
  const completo = !!(r.entrada && r.saida_almoco && r.retorno_almoco && r.saida);
  if (completo) return { label: "Completo", cor: "text-success" };
  if (r.entrada && r.saida) return { label: "Sem almoço", cor: "text-warning" };
  return { label: "Incompleto", cor: "text-warning" };
}

export default function MeuPonto() {
  const { user } = useAuth();
  const [registros, setRegistros] = useState<RegMes[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data: m } = await supabase
        .from("equipe_membros").select("id").eq("user_id", user.id).maybeSingle();
      const membroId = (m as any)?.id;
      if (!membroId) { setLoading(false); return; }

      const hoje = new Date();
      const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
      const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10);

      const { data } = await supabase
        .from("gp_ponto_registros")
        .select("data, entrada, saida_almoco, retorno_almoco, saida, horas_trabalhadas")
        .eq("membro_id", membroId)
        .gte("data", ini)
        .lte("data", fim)
        .order("data");
      setRegistros((data ?? []) as any);
      setLoading(false);
    })();
  }, [user]);

  const dias = useMemo(() => {
    const hoje = new Date();
    const total = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    const out: { date: Date; reg: RegMes | null }[] = [];
    for (let d = total; d >= 1; d--) {
      const date = new Date(hoje.getFullYear(), hoje.getMonth(), d);
      const iso = date.toISOString().slice(0, 10);
      out.push({ date, reg: registros.find((r) => r.data === iso) ?? null });
    }
    return out;
  }, [registros]);

  const resumo = useMemo(() => {
    const trabalhados = registros.filter((r) => r.horas_trabalhadas).length;
    const total = registros.reduce((s, r) => s + (Number(r.horas_trabalhadas) || 0), 0);
    const hoje = new Date();
    let semReg = 0;
    for (let d = 1; d <= hoje.getDate(); d++) {
      const date = new Date(hoje.getFullYear(), hoje.getMonth(), d);
      if (!ehDiaUtil(date)) continue;
      const iso = date.toISOString().slice(0, 10);
      if (!registros.find((r) => r.data === iso && r.entrada)) semReg++;
    }
    return {
      trabalhados,
      total: total.toFixed(1),
      media: trabalhados ? (total / trabalhados).toFixed(1) : "0",
      semReg,
    };
  }, [registros]);

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Clock className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Meu ponto</h1>
          <p className="text-xs text-muted-foreground">
            {new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Dias trabalhados</p>
          <p className="text-2xl font-bold">{resumo.trabalhados}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Total de horas</p>
          <p className="text-2xl font-bold">{resumo.total}h</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Média diária</p>
          <p className="text-2xl font-bold">{resumo.media}h</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Sem registro</p>
          <p className="text-2xl font-bold flex items-center gap-2">
            {resumo.semReg}
            {resumo.semReg > 0 && <Badge variant="destructive" className="text-[10px]">!</Badge>}
          </p>
        </Card>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Entrada</TableHead>
              <TableHead>Saída almoço</TableHead>
              <TableHead>Retorno</TableHead>
              <TableHead>Saída</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-sm py-6">Carregando...</TableCell></TableRow>
            ) : dias.map(({ date, reg }) => {
              const st = statusDia(reg, date);
              return (
                <TableRow key={date.toISOString()}>
                  <TableCell className="font-medium">
                    {DIAS[date.getDay()]} {String(date.getDate()).padStart(2, "0")}/{String(date.getMonth() + 1).padStart(2, "0")}
                  </TableCell>
                  <TableCell>{formatHora(reg?.entrada ?? null)}</TableCell>
                  <TableCell>{formatHora(reg?.saida_almoco ?? null)}</TableCell>
                  <TableCell>{formatHora(reg?.retorno_almoco ?? null)}</TableCell>
                  <TableCell>{formatHora(reg?.saida ?? null)}</TableCell>
                  <TableCell>{reg?.horas_trabalhadas ? `${reg.horas_trabalhadas}h` : "—"}</TableCell>
                  <TableCell className={st.cor}>{st.label}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
