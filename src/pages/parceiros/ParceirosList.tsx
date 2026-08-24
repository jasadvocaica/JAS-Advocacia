import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Loader2, Handshake, ExternalLink, LayoutGrid, Sparkles, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatBRL } from "@/lib/format";
import {
  Parceiro, TIPO_LABEL, STATUS_LABEL, TIPO_CLASS, STATUS_CLASS, UFS,
} from "./types";
import { ParceiroAvatar } from "./ParceiroAvatar";

interface RowAg extends Parceiro {
  processos_ativos: number;
  a_repassar: number;
}

export default function ParceirosList() {
  const { hasPermission, isGestor, roles } = useAuth();
  const podeCriar = isGestor || roles.includes("advogado");

  const [rows, setRows] = useState<RowAg[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tipo, setTipo] = useState("todos");
  const [uf, setUf] = useState("todos");
  const [status, setStatus] = useState("ativo");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);

      const [parc, vinculos, repasses] = await Promise.all([
        supabase.from("parceiros").select("*").order("nome"),
        supabase.from("processo_parceiros").select("parceiro_id, processo_id").eq("ativo", true),
        supabase.from("honorarios_repasses").select("parceiro_id, valor_repasse").eq("status", "pendente"),
      ]);

      if (!alive) return;

      const procPorParceiro: Record<string, Set<string>> = {};
      ((vinculos.data as any[]) ?? []).forEach((v) => {
        if (!procPorParceiro[v.parceiro_id]) procPorParceiro[v.parceiro_id] = new Set();
        procPorParceiro[v.parceiro_id].add(v.processo_id);
      });

      const repPorParceiro: Record<string, number> = {};
      ((repasses.data as any[]) ?? []).forEach((r) => {
        repPorParceiro[r.parceiro_id] = (repPorParceiro[r.parceiro_id] ?? 0) + Number(r.valor_repasse);
      });

      setRows(
        ((parc.data as any[]) ?? []).map((p) => ({
          ...p,
          processos_ativos: procPorParceiro[p.id]?.size ?? 0,
          a_repassar: repPorParceiro[p.id] ?? 0,
        })),
      );
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return rows.filter((r) => {
      if (tipo !== "todos" && r.tipo !== tipo) return false;
      if (uf !== "todos" && r.estado !== uf) return false;
      if (status !== "todos" && r.status !== status) return false;
      if (q) {
        const hay = [r.nome, r.email, r.cidade, r.oab_completo, r.oab_numero]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, tipo, uf, status]);

  return (
    <div className="space-y-6">
      <PageHeader title="Parceiros" description="Correspondentes, indicadores e escritórios parceiros">
        <Button asChild variant="ghost" size="sm">
          <Link to="/parceiros/submissoes"><Inbox className="w-4 h-4" /> Submissões</Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link to="/parceiros/distribuicao-ia"><Sparkles className="w-4 h-4" /> Distribuição IA</Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link to="/parceiros/painel"><LayoutGrid className="w-4 h-4" /> Painel de repasses</Link>
        </Button>
        {podeCriar && hasPermission("parceiros", "visualizar") && (
          <Button asChild variant="gold">
            <Link to="/parceiros/novo"><Plus className="w-4 h-4" /> Novo parceiro</Link>
          </Button>
        )}
      </PageHeader>

      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, OAB, cidade ou e-mail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              <SelectItem value="correspondente">Correspondente</SelectItem>
              <SelectItem value="indicador">Indicador</SelectItem>
              <SelectItem value="escritorio">Escritório</SelectItem>
            </SelectContent>
          </Select>
          <Select value={uf} onValueChange={setUf}>
            <SelectTrigger className="md:w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">UF</SelectItem>
              {UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="md:w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="ativo">Ativos</SelectItem>
              <SelectItem value="suspenso">Suspensos</SelectItem>
              <SelectItem value="inativo">Inativos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Handshake className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum parceiro encontrado.</p>
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((p) => (
              <Link
                key={p.id}
                to={`/parceiros/${p.id}`}
                className="flex items-center gap-4 p-4 hover:bg-muted/40 transition-colors"
              >
                <ParceiroAvatar nome={p.nome} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{p.nome}</span>
                    <Badge variant="outline" className={TIPO_CLASS[p.tipo]}>{TIPO_LABEL[p.tipo]}</Badge>
                    <Badge variant="outline" className={STATUS_CLASS[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {p.oab_completo ?? "Sem OAB"}
                    {p.cidade && p.estado && <> · {p.cidade}/{p.estado}</>}
                    {p.email && <> · {p.email}</>}
                  </p>
                </div>
                <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
                  {p.processos_ativos > 0 && (
                    <Badge variant="outline" className="bg-muted">
                      {p.processos_ativos} processo{p.processos_ativos !== 1 ? "s" : ""}
                    </Badge>
                  )}
                  {p.a_repassar > 0 && (
                    <Badge variant="outline" className="bg-amber-500/15 text-amber-600 border-amber-500/30 font-mono">
                      {formatBRL(p.a_repassar)}
                    </Badge>
                  )}
                </div>
                <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
