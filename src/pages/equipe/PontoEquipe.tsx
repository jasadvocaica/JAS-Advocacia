import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Check, Loader2, Clock, Plus as PlusIcon, Minus, Calculator } from "lucide-react";
import { SimuladorBancoHorasDialog } from "./SimuladorBancoHorasDialog";

interface Membro { id: string; nome: string; cargo: string }
interface Registro {
  id: string;
  membro_id: string;
  data: string;
  entrada: string | null;
  saida_almoco: string | null;
  retorno_almoco: string | null;
  saida: string | null;
  horas_trabalhadas: number | null;
  horas_esperadas: number;
  horas_extras: number;
  horas_falta: number;
  status: string;
  justificativa: string | null;
}
interface Saldo { membro_id: string; saldo_total: number }

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export default function PontoEquipe() {
  const { isGestor } = useAuth();
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [membroFilter, setMembroFilter] = useState<string>("todos");
  const [statusFilter, setStatusFilter] = useState<string>("todos");

  const [loading, setLoading] = useState(true);
  const [membros, setMembros] = useState<Membro[]>([]);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [saldos, setSaldos] = useState<Map<string, number>>(new Map());
  const [simuladorOpen, setSimuladorOpen] = useState(false);

  const [registroForm, setRegistroForm] = useState<{
    open: boolean;
    id?: string;
    membro_id: string;
    data: string;
    entrada: string;
    saida_almoco: string;
    retorno_almoco: string;
    saida: string;
    justificativa: string;
  }>({ open: false, membro_id: "", data: "", entrada: "08:00", saida_almoco: "12:00", retorno_almoco: "13:00", saida: "17:00", justificativa: "" });

  const carregar = async () => {
    setLoading(true);
    const inicioMes = new Date(ano, mes - 1, 1).toISOString().slice(0, 10);
    const fimMes = new Date(ano, mes, 0).toISOString().slice(0, 10);

    const [{ data: ms }, { data: regs }, { data: sds }] = await Promise.all([
      supabase.from("equipe_membros").select("id,nome,cargo").eq("status", "ativo").order("nome"),
      supabase
        .from("gp_ponto_registros")
        .select("*")
        .gte("data", inicioMes)
        .lte("data", fimMes)
        .order("data", { ascending: false }),
      supabase.from("gp_banco_horas_saldo").select("membro_id,saldo_total"),
    ]);
    setMembros((ms ?? []) as Membro[]);
    setRegistros((regs ?? []) as Registro[]);
    const map = new Map<string, number>();
    (sds ?? []).forEach((s: any) => map.set(s.membro_id, Number(s.saldo_total) || 0));
    setSaldos(map);
    setLoading(false);
  };

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [mes, ano]);

  const registrosFiltrados = useMemo(() => {
    return registros.filter((r) => {
      if (membroFilter !== "todos" && r.membro_id !== membroFilter) return false;
      if (statusFilter !== "todos" && r.status !== statusFilter) return false;
      return true;
    });
  }, [registros, membroFilter, statusFilter]);

  const resumo = useMemo(() => {
    const total = registros.length;
    const pendentes = registros.filter((r) => r.status === "pendente").length;
    const horas = registros.reduce((s, r) => s + (Number(r.horas_trabalhadas) || 0), 0);
    const extras = registros.reduce((s, r) => s + (Number(r.horas_extras) || 0), 0);
    return { total, pendentes, horas, extras };
  }, [registros]);

  const nomeMembro = (id: string) => membros.find((m) => m.id === id)?.nome ?? "—";

  const abrirNovoRegistro = () => {
    setRegistroForm({
      open: true,
      membro_id: membros[0]?.id ?? "",
      data: new Date().toISOString().slice(0, 10),
      entrada: "08:00",
      saida_almoco: "12:00",
      retorno_almoco: "13:00",
      saida: "17:00",
      justificativa: "",
    });
  };

  const editarRegistro = (r: Registro) => {
    setRegistroForm({
      open: true,
      id: r.id,
      membro_id: r.membro_id,
      data: r.data,
      entrada: r.entrada ?? "",
      saida_almoco: r.saida_almoco ?? "",
      retorno_almoco: r.retorno_almoco ?? "",
      saida: r.saida ?? "",
      justificativa: r.justificativa ?? "",
    });
  };

  const salvarRegistro = async () => {
    const f = registroForm;
    if (!f.membro_id || !f.data) { toast.error("Selecione membro e data"); return; }
    const payload = {
      membro_id: f.membro_id,
      data: f.data,
      entrada: f.entrada || null,
      saida_almoco: f.saida_almoco || null,
      retorno_almoco: f.retorno_almoco || null,
      saida: f.saida || null,
      justificativa: f.justificativa || null,
      status: "aprovado",
      tipo_registro: f.id ? "correcao" : "manual",
    };
    const { error } = f.id
      ? await supabase.from("gp_ponto_registros").update(payload).eq("id", f.id)
      : await supabase.from("gp_ponto_registros").upsert(payload, { onConflict: "membro_id,data" });
    if (error) { toast.error("Erro ao salvar", { description: error.message }); return; }
    toast.success(f.id ? "Registro atualizado" : "Ponto registrado");
    setRegistroForm((p) => ({ ...p, open: false }));
    carregar();
  };

  const aprovarRegistro = async (id: string) => {
    const { error } = await supabase
      .from("gp_ponto_registros")
      .update({ status: "aprovado", aprovado_em: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast.error("Erro ao aprovar", { description: error.message }); return; }
    toast.success("Registro aprovado");
    carregar();
  };

  const aprovarLote = async () => {
    const ids = registros.filter((r) => r.status === "pendente").map((r) => r.id);
    if (!ids.length) { toast.info("Nenhum registro pendente"); return; }
    const { error } = await supabase
      .from("gp_ponto_registros")
      .update({ status: "aprovado", aprovado_em: new Date().toISOString() })
      .in("id", ids);
    if (error) { toast.error("Erro ao aprovar lote", { description: error.message }); return; }
    toast.success(`${ids.length} registro(s) aprovados`);
    carregar();
  };

  const ajusteBanco = async (membro_id: string, horas: number, descricao: string) => {
    const { error } = await supabase.from("gp_banco_horas").insert({
      membro_id,
      data: new Date().toISOString().slice(0, 10),
      horas,
      tipo: horas > 0 ? "credito" : "debito",
      descricao,
    });
    if (error) { toast.error("Erro no ajuste", { description: error.message }); return; }
    toast.success("Banco de horas atualizado");
    carregar();
  };

  if (!isGestor) {
    return (
      <div className="space-y-6">
        <PageHeader title="Meu ponto" description="Visualize seus registros de ponto e saldo de banco de horas" />
        <Card><CardContent className="py-10 text-center text-muted-foreground">
          Em breve: visualização completa do seu próprio ponto. Por enquanto, fale com a gestão.
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Controle de ponto"
        description="Jornada, registros, banco de horas e aprovações da equipe"
      >
        {resumo.pendentes > 0 && (
          <Button variant="outline" onClick={aprovarLote}>
            <Check className="w-4 h-4" /> Aprovar {resumo.pendentes} pendente(s)
          </Button>
        )}
        <Button onClick={abrirNovoRegistro}>
          <Plus className="w-4 h-4" /> Registrar ponto
        </Button>
      </PageHeader>

      {/* Filtros de período */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Mês</Label>
          <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{MESES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Ano</Label>
          <Input type="number" className="w-28" value={ano} onChange={(e) => setAno(Number(e.target.value))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Membro</Label>
          <Select value={membroFilter} onValueChange={setMembroFilter}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {membros.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="aprovado">Aprovado</SelectItem>
              <SelectItem value="ajustado">Ajustado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Resumo do período */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Registros</p>
          <p className="text-2xl font-display">{resumo.total}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Pendentes</p>
          <p className="text-2xl font-display text-warning">{resumo.pendentes}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Horas trabalhadas</p>
          <p className="text-2xl font-display">{resumo.horas.toFixed(1)}h</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Horas extras</p>
          <p className="text-2xl font-display text-gold">{resumo.extras.toFixed(1)}h</p>
        </CardContent></Card>
      </div>

      {/* Banco de horas por membro */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gold" />
            <h3 className="font-display text-lg">Banco de horas — saldo atual</h3>
            <Button size="sm" variant="gold" className="ml-auto" onClick={() => setSimuladorOpen(true)}>
              <Calculator className="w-4 h-4" /> Simular pagamento
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {membros.map((m) => {
              const saldo = saldos.get(m.id) ?? 0;
              const corSaldo = saldo > 0 ? "text-success" : saldo < 0 ? "text-destructive" : "text-muted-foreground";
              return (
                <div key={m.id} className="flex items-center justify-between p-3 rounded-md border">
                  <div>
                    <p className="text-sm font-medium">{m.nome}</p>
                    <p className={`text-lg font-display ${corSaldo}`}>{saldo > 0 ? "+" : ""}{saldo.toFixed(2)}h</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button size="sm" variant="ghost" onClick={() => {
                      const v = window.prompt(`Crédito em horas para ${m.nome} (ex: 1.5)`);
                      const desc = v ? window.prompt("Descrição") : null;
                      const n = v ? parseFloat(v.replace(",", ".")) : NaN;
                      if (!isNaN(n) && n > 0) ajusteBanco(m.id, n, desc ?? "");
                    }}>
                      <PlusIcon className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => {
                      const v = window.prompt(`Débito em horas para ${m.nome} (ex: 1.5)`);
                      const desc = v ? window.prompt("Descrição") : null;
                      const n = v ? parseFloat(v.replace(",", ".")) : NaN;
                      if (!isNaN(n) && n > 0) ajusteBanco(m.id, -n, desc ?? "");
                    }}>
                      <Minus className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
            {!membros.length && (
              <p className="text-sm text-muted-foreground col-span-full text-center py-4">
                Nenhum membro ativo cadastrado.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabela de registros */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gold" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Membro</TableHead>
                  <TableHead>Entrada</TableHead>
                  <TableHead>Almoço</TableHead>
                  <TableHead>Saída</TableHead>
                  <TableHead className="text-right">Horas</TableHead>
                  <TableHead className="text-right">Extras / Falta</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {registrosFiltrados.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => editarRegistro(r)}>
                    <TableCell>{new Date(r.data + "T00:00").toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell className="font-medium">{nomeMembro(r.membro_id)}</TableCell>
                    <TableCell>{r.entrada?.slice(0, 5) ?? "—"}</TableCell>
                    <TableCell>{r.saida_almoco?.slice(0, 5) ?? "—"} → {r.retorno_almoco?.slice(0, 5) ?? "—"}</TableCell>
                    <TableCell>{r.saida?.slice(0, 5) ?? "—"}</TableCell>
                    <TableCell className="text-right">{Number(r.horas_trabalhadas ?? 0).toFixed(2)}h</TableCell>
                    <TableCell className="text-right">
                      {r.horas_extras > 0 && <span className="text-success">+{Number(r.horas_extras).toFixed(2)}h </span>}
                      {r.horas_falta > 0 && <span className="text-destructive">-{Number(r.horas_falta).toFixed(2)}h</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.status === "aprovado" ? "default" : r.status === "pendente" ? "secondary" : "outline"}>
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {r.status === "pendente" && (
                        <Button size="sm" variant="ghost" onClick={() => aprovarRegistro(r.id)}>
                          <Check className="w-4 h-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!registrosFiltrados.length && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-12">
                      Nenhum registro de ponto neste período. Use "Registrar ponto" para começar.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modal registrar/editar */}
      <Dialog open={registroForm.open} onOpenChange={(open) => setRegistroForm((p) => ({ ...p, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{registroForm.id ? "Editar registro" : "Registrar ponto manual"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label>Membro</Label>
              <Select value={registroForm.membro_id} onValueChange={(v) => setRegistroForm((p) => ({ ...p, membro_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>
                  {membros.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Data</Label>
              <Input type="date" value={registroForm.data} onChange={(e) => setRegistroForm((p) => ({ ...p, data: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Entrada</Label>
              <Input type="time" value={registroForm.entrada} onChange={(e) => setRegistroForm((p) => ({ ...p, entrada: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Saída almoço</Label>
              <Input type="time" value={registroForm.saida_almoco} onChange={(e) => setRegistroForm((p) => ({ ...p, saida_almoco: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Retorno almoço</Label>
              <Input type="time" value={registroForm.retorno_almoco} onChange={(e) => setRegistroForm((p) => ({ ...p, retorno_almoco: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Saída</Label>
              <Input type="time" value={registroForm.saida} onChange={(e) => setRegistroForm((p) => ({ ...p, saida: e.target.value }))} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Justificativa (opcional)</Label>
              <Input value={registroForm.justificativa} onChange={(e) => setRegistroForm((p) => ({ ...p, justificativa: e.target.value }))} placeholder="Ex: atestado, atraso etc." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRegistroForm((p) => ({ ...p, open: false }))}>Cancelar</Button>
            <Button onClick={salvarRegistro}>Salvar registro</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SimuladorBancoHorasDialog
        open={simuladorOpen}
        onOpenChange={setSimuladorOpen}
        membros={membros}
        saldos={saldos}
        onRegistrouPagamento={carregar}
      />
    </div>
  );
}
