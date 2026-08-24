import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Briefcase, Loader2, Search, AlertTriangle, ArrowUpDown, PlusCircle } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import { formatDate } from "@/lib/format";
import type { PortalParceiroContext } from "../PortalParceiroLayout";

interface Row {
  processo_id: string;
  processos: {
    id: string;
    numero_cnj: string | null;
    nb_inss: string | null;
    area_direito: string | null;
    status: string;
    cliente_id: string;
    clientes?: { nome: string };
    proximo_vencimento?: string | null;
  };
}

type OrdenacaoKey = "urgencia" | "vencimento" | "alfabetico" | "area";

export default function ProcessosParceiro() {
  const { parceiro } = useOutletContext<PortalParceiroContext>();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [areaFiltro, setAreaFiltro] = useState("todas");
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [apenasCriticos, setApenasCriticos] = useState(false);
  const [ordenacao, setOrdenacao] = useState<OrdenacaoKey>("urgencia");
  const [prazos, setPrazos] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("processo_parceiros")
        .select("processo_id, processos:processo_id(id, numero_cnj, nb_inss, area_direito, status, cliente_id, clientes:cliente_id(nome))")
        .eq("parceiro_id", parceiro.id)
        .eq("ativo", true);

      const lista = ((data as any[]) ?? []).filter((r) => r.processos);
      setRows(lista);

      const ids = lista.map((r) => r.processos.id);
      if (ids.length) {
        const { data: pr } = await supabase
          .from("controladoria_itens")
          .select("processo_id, data_vencimento")
          .in("processo_id", ids)
          .in("tipo", ["prazo_fatal", "prazo_processual"])
          .neq("status", "concluido")
          .order("data_vencimento", { ascending: true });
        const map = new Map<string, string>();
        ((pr as any[]) ?? []).forEach((p) => {
          if (!map.has(p.processo_id)) map.set(p.processo_id, p.data_vencimento);
        });
        setPrazos(map);
      }
      setLoading(false);
    })();
  }, [parceiro.id]);

  const areas = useMemo(() => Array.from(new Set(rows.map((r) => r.processos.area_direito).filter(Boolean))), [rows]);



  const calcularRisco = (vencimento?: string) => {
    if (!vencimento) return { nivel: "baixo", label: "🟢", desc: "Sem prazo iminente", dias: Infinity };
    const dias = Math.ceil((new Date(vencimento).getTime() - Date.now()) / 86400000);
    if (dias <= 3) return { nivel: "alto", label: "🔴", desc: "Prazo nos próximos 3 dias", dias };
    if (dias <= 7) return { nivel: "medio", label: "🟡", desc: "Prazo nos próximos 7 dias", dias };
    return { nivel: "baixo", label: "🟢", desc: "Sem prazo iminente", dias };
  };

  const filtrados = rows
    .filter((r) => {
      const p = r.processos;
      if (busca) {
        const q = busca.toLowerCase();
        if (
          !p.numero_cnj?.toLowerCase().includes(q) &&
          !p.nb_inss?.toLowerCase().includes(q) &&
          !p.clientes?.nome?.toLowerCase().includes(q)
        ) return false;
      }
      if (areaFiltro !== "todas" && p.area_direito !== areaFiltro) return false;
      if (statusFiltro !== "todos" && p.status !== statusFiltro) return false;
      if (apenasCriticos) {
        const venc = prazos.get(p.id);
        if (!venc) return false;
        const dias = Math.ceil((new Date(venc).getTime() - Date.now()) / 86400000);
        if (dias > 3) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const pa = a.processos;
      const pb = b.processos;
      if (ordenacao === "urgencia") {
        const da = prazos.get(pa.id) ? new Date(prazos.get(pa.id)!).getTime() : Number.POSITIVE_INFINITY;
        const db = prazos.get(pb.id) ? new Date(prazos.get(pb.id)!).getTime() : Number.POSITIVE_INFINITY;
        return da - db;
      }
      if (ordenacao === "vencimento") {
        const da = prazos.get(pa.id) ? new Date(prazos.get(pa.id)!).getTime() : Number.POSITIVE_INFINITY;
        const db = prazos.get(pb.id) ? new Date(prazos.get(pb.id)!).getTime() : Number.POSITIVE_INFINITY;
        return db - da;
      }
      if (ordenacao === "alfabetico") {
        return (pa.clientes?.nome ?? "").localeCompare(pb.clientes?.nome ?? "");
      }
      if (ordenacao === "area") {
        return (pa.area_direito ?? "").localeCompare(pb.area_direito ?? "");
      }
      return 0;
    });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <PageHeader title="Meus processos" description="Casos em que você atua como parceiro" />
        <Button asChild variant="gold" size="sm">
          <Link to="../indicacoes" state={{ abrir: "processo" }}>
            <PlusCircle className="w-4 h-4 mr-1.5" /> Indicar processo
          </Link>
        </Button>
      </div>

      <Card className="p-3 space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="CNJ, NB ou cliente..." value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-9" />
          </div>
          <Select value={areaFiltro} onValueChange={setAreaFiltro}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Área" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as áreas</SelectItem>
              {areas.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFiltro} onValueChange={setStatusFiltro}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="em_andamento">Em andamento</SelectItem>
              <SelectItem value="encerrado">Encerrado</SelectItem>
              <SelectItem value="suspenso">Suspenso</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <Toggle
            pressed={apenasCriticos}
            onPressedChange={setApenasCriticos}
            size="sm"
            className="data-[state=on]:bg-destructive/10 data-[state=on]:text-destructive data-[state=on]:border-destructive/40 border"
          >
            <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
            Apenas críticos (≤ 3 dias)
          </Toggle>
          <div className="flex items-center gap-2">
            <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
            <Select value={ordenacao} onValueChange={(v) => setOrdenacao(v as OrdenacaoKey)}>
              <SelectTrigger className="w-full sm:w-52 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="urgencia">Mais urgentes primeiro</SelectItem>
                <SelectItem value="vencimento">Sem prazo iminente primeiro</SelectItem>
                <SelectItem value="alfabetico">Cliente (A-Z)</SelectItem>
                <SelectItem value="area">Área do direito</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {(apenasCriticos || busca || areaFiltro !== "todas" || statusFiltro !== "todos") && (
          <p className="text-xs text-muted-foreground">
            Mostrando {filtrados.length} de {rows.length} processos
          </p>
        )}
      </Card>

      {loading ? (
        <Card className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></Card>
      ) : filtrados.length === 0 ? (
        <Card className="p-12 text-center">
          <Briefcase className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">Nenhum processo encontrado.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y">
            {filtrados.map((r) => {
              const p = r.processos;
              const venc = prazos.get(p.id);
              const risco = calcularRisco(venc ?? undefined);
              return (
                <Link
                  key={p.id}
                  to={`${p.id}`}
                  className="grid grid-cols-12 gap-3 p-4 hover:bg-muted/40 transition-colors items-center"
                >
                  <div className="col-span-12 sm:col-span-4 min-w-0">
                    <p className="font-medium truncate">{p.numero_cnj ?? p.nb_inss ?? "—"}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.clientes?.nome ?? "—"}</p>
                  </div>
                  <div className="col-span-6 sm:col-span-2 text-xs">{p.area_direito ?? "—"}</div>
                  <div className="col-span-6 sm:col-span-2">
                    <Badge variant="outline" className="text-[10px]">{p.status.replace("_", " ")}</Badge>
                  </div>
                  <div className="col-span-6 sm:col-span-2 text-xs text-muted-foreground">
                    {venc ? `Vence ${formatDate(venc)}` : "Sem prazo"}
                  </div>
                  <div className="col-span-6 sm:col-span-2 text-right text-xs" title={risco.desc}>
                    {risco.label} {risco.nivel}
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
