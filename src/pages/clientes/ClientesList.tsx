import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Plus, Search, Eye, Pencil, Trash2, Cake, MessageCircle, Loader2,
  ArrowUpDown, ArrowUp, ArrowDown, Users, ListChecks, AlertTriangle,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowDownAZ, KeyRound, Merge, Sparkles,
} from "lucide-react";
import AtivacaoPortalLoteDialog from "./AtivacaoPortalLoteDialog";
import CadastrosPendentesDialog from "./CadastrosPendentesDialog";
import { formatCpfCnpj, formatPhone } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { STATUS_CLASS, STATUS_OPTS, iniciais, whatsappLink } from "./types";

interface Cliente {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  email: string | null;
  telefones: string[] | null;
  whatsapp: string | null;
  ativo: boolean;
  status: string | null;
  origem: string | null;
  nascimento: string | null;
  criado_em: string;
  advogado_responsavel_id: string | null;
}

type SortKey = "nome" | "cpf_cnpj" | "processos" | "tarefas" | "status" | "criado_em" | "nascimento";
type SortDir = "asc" | "desc";

type SortPreset =
  | "nome_asc"
  | "nome_desc"
  | "criado_desc"
  | "criado_asc"
  | "processos_desc"
  | "tarefas_desc"
  | "status_asc"
  | "aniversario_asc";

const SORT_PRESETS: { v: SortPreset; l: string; key: SortKey; dir: SortDir }[] = [
  { v: "nome_asc", l: "Nome (A → Z)", key: "nome", dir: "asc" },
  { v: "nome_desc", l: "Nome (Z → A)", key: "nome", dir: "desc" },
  { v: "criado_desc", l: "Cadastro mais recente", key: "criado_em", dir: "desc" },
  { v: "criado_asc", l: "Cadastro mais antigo", key: "criado_em", dir: "asc" },
  { v: "processos_desc", l: "Mais processos", key: "processos", dir: "desc" },
  { v: "tarefas_desc", l: "Mais tarefas abertas", key: "tarefas", dir: "desc" },
  { v: "status_asc", l: "Status (A → Z)", key: "status", dir: "asc" },
  { v: "aniversario_asc", l: "Próximo aniversário", key: "nascimento", dir: "asc" },
];

const normalize = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

// Dias até o próximo aniversário (0 = hoje, vai até 365)
const diasAteAniversario = (nascimento: string | null): number => {
  if (!nascimento) return 9999;
  const n = new Date(nascimento);
  if (isNaN(n.getTime())) return 9999;
  const hoje = new Date();
  const proximo = new Date(hoje.getFullYear(), n.getMonth(), n.getDate());
  if (proximo < new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())) {
    proximo.setFullYear(hoje.getFullYear() + 1);
  }
  return Math.floor((proximo.getTime() - new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime()) / 86400000);
};

export default function ClientesList() {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [contagemProcessos, setContagemProcessos] = useState<Record<string, number>>({});
  const [tarefasPorCliente, setTarefasPorCliente] = useState<Record<string, { abertas: number; atrasadas: number }>>({});
  const [search, setSearch] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<string>("ativo");
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("nome");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [pageSize, setPageSize] = useState<number>(20);
  const [page, setPage] = useState<number>(1);
  const [ativacaoLoteOpen, setAtivacaoLoteOpen] = useState(false);
  const [diagnosticoOpen, setDiagnosticoOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("clientes")
      .select("id, nome, cpf_cnpj, email, telefones, whatsapp, ativo, status, origem, nascimento, criado_em, advogado_responsavel_id")
      .order("nome");
    if (error) toast.error("Erro ao carregar clientes");
    const list = (data ?? []) as Cliente[];
    setClientes(list);

    const ids = list.map((c) => c.id);
    if (ids.length) {
      const hoje = new Date().toISOString().slice(0, 10);
      const [procsRes, tarefasRes] = await Promise.all([
        supabase.from("processos").select("cliente_id").in("cliente_id", ids),
        supabase
          .from("controladoria_itens")
          .select("cliente_id, status, data_vencimento")
          .in("cliente_id", ids)
          .in("status", ["pendente", "em_andamento", "aguardando"]),
      ]);
      const counts: Record<string, number> = {};
      (procsRes.data ?? []).forEach((p: any) => { counts[p.cliente_id] = (counts[p.cliente_id] ?? 0) + 1; });
      setContagemProcessos(counts);

      const tcounts: Record<string, { abertas: number; atrasadas: number }> = {};
      (tarefasRes.data ?? []).forEach((t: any) => {
        if (!t.cliente_id) return;
        const cur = tcounts[t.cliente_id] ?? { abertas: 0, atrasadas: 0 };
        cur.abertas += 1;
        const dv = (t.data_vencimento ?? "").slice(0, 10);
        if (dv && dv < hoje) cur.atrasadas += 1;
        tcounts[t.cliente_id] = cur;
      });
      setTarefasPorCliente(tcounts);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("clientes").delete().eq("id", deleteId);
    if (error) toast.error("Erro ao excluir", { description: error.message });
    else { toast.success("Cliente excluído"); load(); }
    setDeleteId(null);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "criado_em" || key === "processos" ? "desc" : "asc");
    }
  };

  const filtered = useMemo(() => {
    const q = normalize(search.trim());
    const qDigits = search.replace(/\D/g, "");
    const list = clientes.filter((c) => {
      const status = c.status ?? (c.ativo ? "ativo" : "inativo");
      if (statusFiltro !== "todos" && status !== statusFiltro) return false;
      if (!q) return true;
      const matchTexto =
        normalize(c.nome).includes(q) ||
        normalize(c.email ?? "").includes(q);
      const matchDigits = qDigits.length >= 3 && (
        (c.cpf_cnpj ?? "").includes(qDigits) ||
        (c.whatsapp ?? "").includes(qDigits) ||
        (c.telefones ?? []).some((t) => t.includes(qDigits))
      );
      return matchTexto || matchDigits;
    });

    const dir = sortDir === "asc" ? 1 : -1;
    const sorted = [...list].sort((a, b) => {
      switch (sortKey) {
        case "nome":
          return a.nome.localeCompare(b.nome, "pt-BR") * dir;
        case "cpf_cnpj":
          return (a.cpf_cnpj ?? "").localeCompare(b.cpf_cnpj ?? "") * dir;
        case "processos":
          return ((contagemProcessos[a.id] ?? 0) - (contagemProcessos[b.id] ?? 0)) * dir;
        case "tarefas":
          return ((tarefasPorCliente[a.id]?.abertas ?? 0) - (tarefasPorCliente[b.id]?.abertas ?? 0)) * dir;
        case "status": {
          const sa = a.status ?? (a.ativo ? "ativo" : "inativo");
          const sb = b.status ?? (b.ativo ? "ativo" : "inativo");
          return sa.localeCompare(sb) * dir;
        }
        case "criado_em":
          return (new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime()) * dir;
        case "nascimento":
          return (diasAteAniversario(a.nascimento) - diasAteAniversario(b.nascimento)) * dir;
        default:
          return 0;
      }
    });
    return sorted;
  }, [clientes, search, statusFiltro, sortKey, sortDir, contagemProcessos, tarefasPorCliente]);

  // Reset para a página 1 sempre que filtros, busca, ordenação ou tamanho mudarem
  useEffect(() => {
    setPage(1);
  }, [search, statusFiltro, sortKey, sortDir, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIdx = (currentPage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, filtered.length);
  const paginated = filtered.slice(startIdx, endIdx);

  const SortHeader = ({ k, children, align }: { k: SortKey; children: React.ReactNode; align?: "right" }) => {
    const active = sortKey === k;
    const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={cn(
          "inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider transition-colors",
          "text-muted-foreground hover:text-foreground",
          active && "text-foreground",
          align === "right" && "ml-auto",
        )}
      >
        {children}
        <Icon className={cn("w-3 h-3", active ? "opacity-100" : "opacity-40")} />
      </button>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        description={`${filtered.length} de ${clientes.length} cliente${clientes.length !== 1 ? "s" : ""}`}
      >
        {hasPermission("clientes", "editar") && (
          <>
            <Button variant="outline" onClick={() => setDiagnosticoOpen(true)}>
              <Sparkles className="w-4 h-4 text-gold" /> Diagnóstico de cadastros
            </Button>
            <Button variant="outline" asChild>
              <Link to="/clientes/duplicados"><Merge className="w-4 h-4" /> Duplicados</Link>
            </Button>
            <Button variant="outline" onClick={() => setAtivacaoLoteOpen(true)}>
              <KeyRound className="w-4 h-4" /> Ativar portal em lote
            </Button>
          </>
        )}
        {hasPermission("clientes", "criar") && (
          <Button variant="gold" asChild>
            <Link to="/clientes/novo"><Plus className="w-4 h-4" /> Novo cliente</Link>
          </Button>
        )}
      </PageHeader>
      <AtivacaoPortalLoteDialog open={ativacaoLoteOpen} onClose={() => setAtivacaoLoteOpen(false)} />
      <CadastrosPendentesDialog open={diagnosticoOpen} onOpenChange={setDiagnosticoOpen} />

      <Card className="p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, CPF, telefone, WhatsApp ou e-mail..."
              className="pl-9 h-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFiltro} onValueChange={setStatusFiltro}>
            <SelectTrigger className="sm:w-44 h-10" title="Filtrar por status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              {STATUS_OPTS.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select
            value={SORT_PRESETS.find((p) => p.key === sortKey && p.dir === sortDir)?.v ?? "nome_asc"}
            onValueChange={(v) => {
              const preset = SORT_PRESETS.find((p) => p.v === v);
              if (preset) {
                setSortKey(preset.key);
                setSortDir(preset.dir);
              }
            }}
          >
            <SelectTrigger className="sm:w-56 h-10" title="Ordenar lista">
              <div className="flex items-center gap-2 min-w-0">
                <ArrowDownAZ className="w-4 h-4 text-muted-foreground shrink-0" />
                <SelectValue placeholder="Ordenar por..." />
              </div>
            </SelectTrigger>
            <SelectContent>
              {SORT_PRESETS.map((p) => (
                <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40 border-b">
                <TableHead className="h-11"><SortHeader k="nome">Cliente</SortHeader></TableHead>
                <TableHead className="h-11"><SortHeader k="cpf_cnpj">CPF/CNPJ</SortHeader></TableHead>
                <TableHead className="h-11">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contato</span>
                </TableHead>
                <TableHead className="h-11"><SortHeader k="processos">Processos</SortHeader></TableHead>
                <TableHead className="h-11">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tarefas</span>
                </TableHead>
                <TableHead className="h-11"><SortHeader k="status">Status</SortHeader></TableHead>
                <TableHead className="h-11"><SortHeader k="criado_em">Cadastro</SortHeader></TableHead>
                <TableHead className="h-11 text-right">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-16">
                    <Users className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-sm font-medium text-muted-foreground">Nenhum cliente encontrado</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      Ajuste os filtros ou cadastre um novo cliente.
                    </p>
                  </TableCell>
                </TableRow>
              ) : paginated.map((c, idx) => {
                const status = c.status ?? (c.ativo ? "ativo" : "inativo");
                const statusLabel = STATUS_OPTS.find((s) => s.v === status)?.l ?? status;
                const aniversariaHoje = c.nascimento && new Date(c.nascimento).toISOString().slice(5, 10) === new Date().toISOString().slice(5, 10);
                const fone = c.whatsapp || c.telefones?.[0];
                const wpp = whatsappLink(fone);
                const numProcs = contagemProcessos[c.id] ?? 0;
                const dataCadastro = new Date(c.criado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

                return (
                  <TableRow
                    key={c.id}
                    className={cn(
                      "group cursor-pointer transition-colors border-b last:border-b-0",
                      "hover:bg-muted/40",
                      idx % 2 === 1 && "bg-muted/10",
                    )}
                    onClick={() => navigate(`/clientes/${c.id}`)}
                  >
                    <TableCell className="py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-navy to-navy/80 flex items-center justify-center shrink-0 ring-2 ring-background shadow-sm">
                          <span className="text-xs font-display text-gold">{iniciais(c.nome)}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium truncate">{c.nome}</span>
                            {aniversariaHoje && (
                              <span title="Aniversariante hoje">
                                <Cake className="w-3.5 h-3.5 text-gold shrink-0" />
                              </span>
                            )}
                          </div>
                          {c.email && (
                            <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {c.cpf_cnpj ? formatCpfCnpj(c.cpf_cnpj) : <span className="opacity-40">—</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {fone ? (
                        <div className="flex items-center gap-2">
                          <span className="tabular-nums">{formatPhone(fone)}</span>
                          {wpp && (
                            <a
                              href={wpp}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-success/10 text-success hover:bg-success/20 transition-colors"
                              title="Abrir WhatsApp"
                            >
                              <MessageCircle className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {numProcs > 0 ? (
                        <Badge variant="secondary" className="font-mono tabular-nums">
                          {numProcs}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground/40 text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const t = tarefasPorCliente[c.id];
                        if (!t || t.abertas === 0) {
                          return <span className="text-muted-foreground/40 text-xs">—</span>;
                        }
                        const cls = t.atrasadas > 0
                          ? "bg-destructive/15 text-destructive border-destructive/30"
                          : "bg-warning/15 text-warning border-warning/30";
                        const Icon = t.atrasadas > 0 ? AlertTriangle : ListChecks;
                        const titulo = t.atrasadas > 0
                          ? `${t.abertas} aberta(s) · ${t.atrasadas} atrasada(s)`
                          : `${t.abertas} aberta(s)`;
                        return (
                          <Badge variant="outline" className={cn("font-mono tabular-nums gap-1", cls)} title={titulo}>
                            <Icon className="w-3 h-3" />
                            {t.abertas}
                          </Badge>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("font-medium", STATUS_CLASS[status])}>
                        {statusLabel}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                      {dataCadastro}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                        <Button size="icon" variant="ghost" className="h-8 w-8" asChild title="Ver detalhes">
                          <Link to={`/clientes/${c.id}`}><Eye className="w-4 h-4" /></Link>
                        </Button>
                        {hasPermission("clientes", "editar") && (
                          <Button size="icon" variant="ghost" className="h-8 w-8" asChild title="Editar">
                            <Link to={`/clientes/${c.id}/editar`}><Pencil className="w-4 h-4" /></Link>
                          </Button>
                        )}
                        {hasPermission("clientes", "excluir") && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setDeleteId(c.id)}
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {!loading && filtered.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t bg-muted/20">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                Mostrando <span className="font-medium text-foreground tabular-nums">{startIdx + 1}</span>
                {"–"}
                <span className="font-medium text-foreground tabular-nums">{endIdx}</span>{" "}
                de <span className="font-medium text-foreground tabular-nums">{filtered.length}</span>
              </span>
              <span className="hidden sm:inline">·</span>
              <div className="flex items-center gap-1.5">
                <span className="hidden sm:inline">Por página:</span>
                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger className="h-7 w-[68px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setPage(1)}
                disabled={currentPage === 1}
                title="Primeira página"
              >
                <ChevronsLeft className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                title="Página anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="px-2 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                Página <span className="font-medium text-foreground">{currentPage}</span> de{" "}
                <span className="font-medium text-foreground">{totalPages}</span>
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                title="Próxima página"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setPage(totalPages)}
                disabled={currentPage === totalPages}
                title="Última página"
              >
                <ChevronsRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Se o cliente possuir processos vinculados, a exclusão falhará.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
