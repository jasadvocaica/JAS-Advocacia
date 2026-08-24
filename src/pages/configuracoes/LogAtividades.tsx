import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
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
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Loader2, Download, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

interface LogRow {
  id: string;
  user_id: string | null;
  acao: string;
  modulo: string | null;
  registro_id: string | null;
  registro_titulo: string | null;
  dados_antes: any;
  dados_depois: any;
  ip: string | null;
  criado_em: string;
}

interface UsuarioOpt { id: string; nome: string }

const MODULOS = ["clientes", "processos", "controladoria", "financeiro", "documentos", "parceiros", "equipe", "usuarios"];
const ACOES = ["criou", "editou", "excluiu"];

export default function LogAtividades() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroUser, setFiltroUser] = useState<string>("todos");
  const [filtroModulo, setFiltroModulo] = useState<string>("todos");
  const [filtroAcao, setFiltroAcao] = useState<string>("todas");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [expandido, setExpandido] = useState<Set<string>>(new Set());

  const carregar = async () => {
    setLoading(true);
    let q = supabase.from("user_log_atividade").select("*").order("criado_em", { ascending: false }).limit(500);
    if (filtroUser !== "todos") q = q.eq("user_id", filtroUser);
    if (filtroModulo !== "todos") q = q.eq("modulo", filtroModulo);
    if (filtroAcao !== "todas") q = q.eq("acao", filtroAcao);
    if (inicio) q = q.gte("criado_em", inicio);
    if (fim) q = q.lte("criado_em", `${fim}T23:59:59`);
    const { data, error } = await q;
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    setLogs(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    supabase.from("profiles").select("id, nome").order("nome").then(({ data }) => {
      setUsuarios(data ?? []);
    });
  }, []);

  useEffect(() => { carregar(); }, [filtroUser, filtroModulo, filtroAcao, inicio, fim]);

  const usuariosMap = useMemo(() => {
    const m = new Map<string, string>();
    usuarios.forEach((u) => m.set(u.id, u.nome));
    return m;
  }, [usuarios]);

  const toggle = (id: string) => {
    setExpandido((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const exportarCsv = () => {
    const head = ["data", "usuario", "acao", "modulo", "registro_titulo", "registro_id", "ip"];
    const rows = logs.map((l) => [
      new Date(l.criado_em).toISOString(),
      l.user_id ? usuariosMap.get(l.user_id) ?? l.user_id : "",
      l.acao,
      l.modulo ?? "",
      l.registro_titulo ?? "",
      l.registro_id ?? "",
      l.ip ?? "",
    ]);
    const csv = [head, ...rows].map((r) =>
      r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")
    ).join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `log-atividades-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Log de atividades"
        description="Registro imutável de todas as ações realizadas no sistema"
      >
        <Button variant="outline" onClick={exportarCsv} disabled={!logs.length}>
          <Download className="w-4 h-4 mr-2" /> Exportar CSV
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Usuário</Label>
          <Select value={filtroUser} onValueChange={setFiltroUser}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {usuarios.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Módulo</Label>
          <Select value={filtroModulo} onValueChange={setFiltroModulo}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {MODULOS.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Ação</Label>
          <Select value={filtroAcao} onValueChange={setFiltroAcao}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {ACOES.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Início</Label>
          <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Fim</Label>
          <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Data/Hora</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Módulo</TableHead>
              <TableHead>Registro</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></TableCell></TableRow>
            ) : logs.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">Nenhum registro encontrado.</TableCell></TableRow>
            ) : logs.map((l) => {
              const isOpen = expandido.has(l.id);
              const temDetalhes = l.dados_antes || l.dados_depois;
              return (
                <Collapsible asChild key={l.id} open={isOpen} onOpenChange={() => toggle(l.id)}>
                  <>
                    <TableRow className="cursor-pointer hover:bg-muted/30" onClick={() => temDetalhes && toggle(l.id)}>
                      <TableCell>
                        {temDetalhes && (isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />)}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{new Date(l.criado_em).toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-sm">{l.user_id ? usuariosMap.get(l.user_id) ?? "—" : "Sistema"}</TableCell>
                      <TableCell><Badge variant="outline">{l.acao}</Badge></TableCell>
                      <TableCell className="text-sm">{l.modulo ?? "—"}</TableCell>
                      <TableCell className="text-sm max-w-xs truncate">{l.registro_titulo ?? l.registro_id ?? "—"}</TableCell>
                    </TableRow>
                    <CollapsibleContent asChild>
                      <TableRow className="bg-muted/20">
                        <TableCell colSpan={6} className="p-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                            {l.dados_antes && (
                              <div>
                                <p className="font-semibold mb-1 text-muted-foreground">Antes</p>
                                <pre className="bg-background border rounded p-2 overflow-x-auto max-h-64 overflow-y-auto">{JSON.stringify(l.dados_antes, null, 2)}</pre>
                              </div>
                            )}
                            {l.dados_depois && (
                              <div>
                                <p className="font-semibold mb-1 text-muted-foreground">Depois</p>
                                <pre className="bg-background border rounded p-2 overflow-x-auto max-h-64 overflow-y-auto">{JSON.stringify(l.dados_depois, null, 2)}</pre>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    </CollapsibleContent>
                  </>
                </Collapsible>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
