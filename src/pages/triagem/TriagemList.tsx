import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Headphones, Loader2, Trash2, Pencil, Link2, X, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";

const CANAIS = [
  { value: "presencial", label: "Presencial" },
  { value: "telefone", label: "Telefone" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "E-mail" },
  { value: "outro", label: "Outro" },
];

const PROXIMOS = [
  { value: "pendente", label: "Pendente", cor: "#888780" },
  { value: "virar_cliente", label: "Virar cliente", cor: "#16a34a" },
  { value: "agendar", label: "Agendar retorno", cor: "#0ea5e9" },
  { value: "descartar", label: "Descartar", cor: "#dc2626" },
  { value: "convertido", label: "Convertido", cor: "#9333ea" },
];

interface Triagem {
  id: string;
  data_atendimento: string;
  atendido_por: string | null;
  atendente_nome: string | null;
  contato_nome: string | null;
  contato_telefone: string | null;
  contato_email: string | null;
  canal: string;
  assunto: string;
  descricao: string | null;
  proximo_passo: string;
  cliente_id: string | null;
  observacoes: string | null;
}

const novoForm = (userId?: string, userNome?: string): Partial<Triagem> => ({
  data_atendimento: new Date().toISOString().slice(0, 16),
  atendido_por: userId ?? null,
  atendente_nome: userNome ?? "",
  contato_nome: "",
  contato_telefone: "",
  contato_email: "",
  canal: "presencial",
  assunto: "",
  descricao: "",
  proximo_passo: "pendente",
  observacoes: "",
});

export default function TriagemList() {
  const { user, profile, hasPermission } = useAuth();
  const [items, setItems] = useState<Triagem[]>([]);
  const [responsaveis, setResponsaveis] = useState<{ id: string; nome: string }[]>([]);
  const [clientes, setClientes] = useState<{ id: string; nome: string; cpf_cnpj: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Triagem | null>(null);
  const [form, setForm] = useState<Partial<Triagem>>(novoForm(user?.id, profile?.nome));
  const [filtroProximo, setFiltroProximo] = useState<string>("todos");
  const [filtroAtendente, setFiltroAtendente] = useState<string>("todos");
  const [filtroVinculo, setFiltroVinculo] = useState<"todos" | "sem" | "com">("todos");
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [clienteSearch, setClienteSearch] = useState("");
  const [clientePopOpen, setClientePopOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data, error }, { data: us }, { data: cs }] = await Promise.all([
      supabase.from("triagem_atendimentos").select("*").order("data_atendimento", { ascending: false }),
      supabase.from("profiles").select("id, nome").eq("ativo", true).eq("tipo_portal", "interno").order("nome"),
      supabase.from("clientes").select("id, nome, cpf_cnpj").order("nome").limit(2000),
    ]);
    if (error) toast.error("Erro ao carregar triagem", { description: error.message });
    setItems((data ?? []) as any);
    setResponsaveis((us ?? []) as any);
    setClientes((cs ?? []) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const abrirNovo = () => {
    setEditing(null);
    setForm(novoForm(user?.id, (profile as any)?.nome));
    setOpen(true);
  };
  const abrirEditar = (t: Triagem) => {
    setEditing(t);
    setForm({ ...t, data_atendimento: t.data_atendimento.slice(0, 16) });
    setOpen(true);
  };

  const salvar = async () => {
    if (!form.assunto?.trim()) { toast.error("Informe o assunto"); return; }
    setSaving(true);
    const payload: any = {
      data_atendimento: form.data_atendimento ? new Date(form.data_atendimento as string).toISOString() : new Date().toISOString(),
      atendido_por: form.atendido_por ?? user?.id ?? null,
      atendente_nome: form.atendente_nome?.trim() || null,
      contato_nome: form.contato_nome?.trim() || null,
      contato_telefone: form.contato_telefone?.trim() || null,
      contato_email: form.contato_email?.trim() || null,
      canal: form.canal ?? "presencial",
      assunto: form.assunto.trim(),
      descricao: form.descricao?.trim() || null,
      proximo_passo: form.proximo_passo ?? "pendente",
      observacoes: form.observacoes?.trim() || null,
      cliente_id: form.cliente_id ?? null,
    };
    let error;
    if (editing) {
      ({ error } = await supabase.from("triagem_atendimentos").update(payload).eq("id", editing.id));
    } else {
      payload.criado_por = user?.id;
      ({ error } = await supabase.from("triagem_atendimentos").insert(payload));
    }
    setSaving(false);
    if (error) return toast.error("Erro ao salvar", { description: error.message });
    toast.success(editing ? "Atendimento atualizado" : "Atendimento registrado");
    setOpen(false);
    load();
  };

  const excluir = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("triagem_atendimentos").delete().eq("id", deleteId);
    if (error) toast.error("Erro", { description: error.message });
    else { toast.success("Excluído"); load(); }
    setDeleteId(null);
  };

  const vincularCliente = async (triagemId: string, clienteId: string | null) => {
    const { error } = await supabase
      .from("triagem_atendimentos")
      .update({ cliente_id: clienteId })
      .eq("id", triagemId);
    if (error) return toast.error("Erro ao vincular", { description: error.message });
    toast.success(clienteId ? "Cliente vinculado" : "Vínculo removido");
    load();
  };

  const filtered = useMemo(() => {
    return items.filter((t) => {
      if (filtroProximo !== "todos" && t.proximo_passo !== filtroProximo) return false;
      if (filtroAtendente !== "todos" && t.atendido_por !== filtroAtendente) return false;
      if (filtroVinculo === "sem" && t.cliente_id) return false;
      if (filtroVinculo === "com" && !t.cliente_id) return false;
      if (search) {
        const q = search.toLowerCase();
        const blob = `${t.assunto} ${t.descricao ?? ""} ${t.contato_nome ?? ""} ${t.contato_telefone ?? ""} ${t.atendente_nome ?? ""}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [items, filtroProximo, filtroAtendente, filtroVinculo, search]);

  const respMap = useMemo(() => new Map(responsaveis.map((u) => [u.id, u.nome])), [responsaveis]);
  const cliMap = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);
  const clientesFiltrados = useMemo(() => {
    const q = clienteSearch.toLowerCase().trim();
    const base = !q ? clientes : clientes.filter((c) =>
      c.nome.toLowerCase().includes(q) || (c.cpf_cnpj ?? "").toLowerCase().includes(q),
    );
    return base.slice(0, 50);
  }, [clientes, clienteSearch]);
  const proxBadge = (v: string) => {
    const p = PROXIMOS.find((x) => x.value === v) ?? PROXIMOS[0];
    return (
      <Badge variant="outline" style={{ backgroundColor: `${p.cor}1a`, color: p.cor, borderColor: `${p.cor}55` }}>
        {p.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Triagem de Atendimentos"
        description="Registre atendimentos rápidos sem precisar vincular a um cliente. Decida depois o próximo passo."
      >
        {hasPermission("clientes", "criar") && (
          <Button variant="gold" onClick={abrirNovo}>
            <Plus className="w-4 h-4" /> Novo atendimento
          </Button>
        )}
      </PageHeader>

      <Card className="p-3">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_160px_160px_160px] gap-2">
          <Input placeholder="Buscar por assunto, pessoa, atendente..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={filtroProximo} onValueChange={setFiltroProximo}>
            <SelectTrigger><SelectValue placeholder="Próximo passo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os passos</SelectItem>
              {PROXIMOS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filtroAtendente} onValueChange={setFiltroAtendente}>
            <SelectTrigger><SelectValue placeholder="Atendente" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os atendentes</SelectItem>
              {responsaveis.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filtroVinculo} onValueChange={(v) => setFiltroVinculo(v as any)}>
            <SelectTrigger><SelectValue placeholder="Vínculo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="sem">Sem cliente vinculado</SelectItem>
              <SelectItem value="com">Com cliente vinculado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Data</TableHead>
              <TableHead>Assunto</TableHead>
              <TableHead>Pessoa atendida</TableHead>
              <TableHead className="w-28">Canal</TableHead>
              <TableHead>Atendente</TableHead>
              <TableHead>Cliente vinculado</TableHead>
              <TableHead>Próximo passo</TableHead>
              <TableHead className="text-right w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-16">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <Headphones className="w-10 h-10 opacity-40" />
                    <p>Nenhum atendimento registrado.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : filtered.map((t) => {
              const cli = t.cliente_id ? cliMap.get(t.cliente_id) : null;
              return (
              <TableRow key={t.id} className="cursor-pointer hover:bg-muted/50" onClick={() => abrirEditar(t)}>
                <TableCell className="text-xs">
                  {new Date(t.data_atendimento).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                </TableCell>
                <TableCell className="font-medium">
                  <div>{t.assunto}</div>
                  {t.descricao && <div className="text-xs text-muted-foreground truncate max-w-[280px]">{t.descricao}</div>}
                </TableCell>
                <TableCell className="text-sm">
                  {t.contato_nome ? (
                    <>
                      <div>{t.contato_nome}</div>
                      <div className="text-xs text-muted-foreground">{[t.contato_telefone, t.contato_email].filter(Boolean).join(" · ")}</div>
                    </>
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell><Badge variant="secondary" className="capitalize">{t.canal}</Badge></TableCell>
                <TableCell className="text-sm">{t.atendente_nome ?? (t.atendido_por ? respMap.get(t.atendido_por) : null) ?? <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-sm" onClick={(e) => e.stopPropagation()}>
                  {cli ? (
                    <div className="flex items-center gap-1.5">
                      <Link to={`/clientes/${cli.id}`} className="hover:text-primary truncate max-w-[160px]">{cli.nome}</Link>
                      {hasPermission("clientes", "editar") && (
                        <Button size="icon" variant="ghost" className="h-6 w-6" title="Desvincular" onClick={() => vincularCliente(t.id, null)}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  ) : hasPermission("clientes", "editar") ? (
                    <ClienteVinculoPopover
                      clientes={clientes}
                      onSelect={(cid) => vincularCliente(t.id, cid)}
                    />
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>{proxBadge(t.proximo_passo)}</TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <Button size="icon" variant="ghost" onClick={() => abrirEditar(t)}><Pencil className="w-4 h-4" /></Button>
                  {hasPermission("clientes", "excluir") && (
                    <Button size="icon" variant="ghost" onClick={() => setDeleteId(t.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  )}
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar atendimento" : "Novo atendimento"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5">
              <Label>Data e hora</Label>
              <Input type="datetime-local" value={form.data_atendimento as string ?? ""} onChange={(e) => setForm({ ...form, data_atendimento: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Atendente</Label>
              <Select value={form.atendido_por ?? "self"} onValueChange={(v) => setForm({ ...form, atendido_por: v === "self" ? null : v, atendente_nome: v === "self" ? form.atendente_nome : (respMap.get(v) ?? form.atendente_nome) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="self">— Selecionar —</SelectItem>
                  {responsaveis.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Assunto *</Label>
              <Input value={form.assunto ?? ""} onChange={(e) => setForm({ ...form, assunto: e.target.value })} placeholder="Ex: Consulta sobre cobrança indevida" />
            </div>
            <div className="space-y-1.5">
              <Label>Nome da pessoa atendida</Label>
              <Input value={form.contato_nome ?? ""} onChange={(e) => setForm({ ...form, contato_nome: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={form.contato_telefone ?? ""} onChange={(e) => setForm({ ...form, contato_telefone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input type="email" value={form.contato_email ?? ""} onChange={(e) => setForm({ ...form, contato_email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Canal</Label>
              <Select value={form.canal ?? "presencial"} onValueChange={(v) => setForm({ ...form, canal: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CANAIS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Cliente vinculado (opcional)</Label>
              {form.cliente_id && cliMap.get(form.cliente_id) ? (
                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border bg-muted/30">
                  <span className="text-sm truncate">{cliMap.get(form.cliente_id)!.nome}</span>
                  <Button size="sm" variant="ghost" onClick={() => setForm({ ...form, cliente_id: null })}>
                    <X className="w-3.5 h-3.5" /> Remover
                  </Button>
                </div>
              ) : (
                <ClienteVinculoPopover
                  clientes={clientes}
                  triggerLabel="Buscar cliente para vincular..."
                  onSelect={(cid) => setForm({ ...form, cliente_id: cid })}
                />
              )}
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Descrição</Label>
              <Textarea rows={3} value={form.descricao ?? ""} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Resumo do atendimento" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Próximo passo</Label>
              <Select value={form.proximo_passo ?? "pendente"} onValueChange={(v) => setForm({ ...form, proximo_passo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROXIMOS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="gold" onClick={salvar} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir atendimento?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Esta ação não pode ser desfeita.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={excluir}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClienteVinculoPopover({
  clientes,
  triggerLabel = "Vincular cliente",
  onSelect,
}: {
  clientes: { id: string; nome: string; cpf_cnpj: string | null }[];
  triggerLabel?: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const term = q.toLowerCase().trim();
    const base = !term
      ? clientes
      : clientes.filter((c) => c.nome.toLowerCase().includes(term) || (c.cpf_cnpj ?? "").toLowerCase().includes(term));
    return base.slice(0, 50);
  }, [clientes, q]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-start text-muted-foreground font-normal">
          <Link2 className="w-3.5 h-3.5" /> {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[320px]" align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome ou CPF/CNPJ..."
              className="pl-7 h-8 text-sm"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {list.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">Nenhum cliente encontrado</div>
          ) : list.map((c) => (
            <button
              key={c.id}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b border-border/40 last:border-0"
              onClick={() => { onSelect(c.id); setOpen(false); setQ(""); }}
            >
              <div className="font-medium truncate">{c.nome}</div>
              {c.cpf_cnpj && <div className="text-[10px] text-muted-foreground">{c.cpf_cnpj}</div>}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
