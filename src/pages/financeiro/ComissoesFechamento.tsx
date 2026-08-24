import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Loader2, HandCoins, ExternalLink, CheckCircle2, Calculator, Users, Percent } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatBRL, formatDate } from "@/lib/format";
import { toast } from "sonner";

type Status = "pendente" | "calculada" | "confirmada" | "cancelada";

interface Row {
  id: string;
  cliente_id: string;
  fechador_user_id: string;
  contrato_id: string | null;
  valor_base: number | null;
  percentual: number | null;
  valor_comissao: number | null;
  status: Status;
  data_confirmacao: string | null;
  observacao: string | null;
  criado_em: string;
  cliente_nome?: string;
  fechador_nome?: string;
}

interface Contrato {
  id: string;
  cliente_id: string;
  tipo: string;
  valor_fixo: number | null;
  status: string;
}

interface Membro {
  id: string;
  user_id: string;
  nome: string;
  cargo: string;
  status: string;
  percentual_comissao_fechamento: number | null;
}

const STATUS_LABEL: Record<Status, string> = {
  pendente: "Pendente de cálculo",
  calculada: "Calculada (aguarda pagamento)",
  confirmada: "Confirmada",
  cancelada: "Cancelada",
};

const STATUS_TONE: Record<Status, string> = {
  pendente: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  calculada: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  confirmada: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  cancelada: "bg-muted text-muted-foreground border-border",
};

export default function ComissoesFechamento() {
  const { isGestor } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [membros, setMembros] = useState<Membro[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("todos");
  const [fechador, setFechador] = useState<string>("todos");
  const [editando, setEditando] = useState<Row | null>(null);
  const [form, setForm] = useState({
    contrato_id: "",
    valor_base: "",
    percentual: "",
    observacao: "",
  });
  const [contratosCliente, setContratosCliente] = useState<Contrato[]>([]);

  const carregar = async () => {
    setLoading(true);
    const [r1, r2] = await Promise.all([
      supabase
        .from("clientes_comissoes_fechamento")
        .select("*, clientes:cliente_id(nome), fechador:fechador_user_id(nome)")
        .order("criado_em", { ascending: false }),
      supabase
        .from("equipe_membros")
        .select("id, user_id, nome, cargo, status, percentual_comissao_fechamento")
        .order("nome"),
    ]);
    setRows(((r1.data as any[]) ?? []).map((r) => ({
      ...r,
      cliente_nome: r.clientes?.nome,
      fechador_nome: r.fechador?.nome,
    })));
    setMembros((r2.data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    carregar();
  }, []);

  const abrir = async (row: Row) => {
    setEditando(row);
    setForm({
      contrato_id: row.contrato_id ?? "",
      valor_base: row.valor_base?.toString() ?? "",
      percentual: row.percentual?.toString() ?? "",
      observacao: row.observacao ?? "",
    });
    const { data } = await supabase
      .from("honorarios_contratos")
      .select("id, cliente_id, tipo, valor_fixo, status")
      .eq("cliente_id", row.cliente_id);
    setContratosCliente((data as any) ?? []);
  };

  const valorCalculado = useMemo(() => {
    const b = Number(form.valor_base.replace(",", "."));
    const p = Number(form.percentual.replace(",", "."));
    if (isNaN(b) || isNaN(p)) return 0;
    return Math.round(b * p) / 100;
  }, [form.valor_base, form.percentual]);

  const salvar = async () => {
    if (!editando) return;
    const b = Number(form.valor_base.replace(",", "."));
    const p = Number(form.percentual.replace(",", "."));
    if (!b || !p) {
      toast.error("Informe valor base e percentual");
      return;
    }
    const { error } = await supabase
      .from("clientes_comissoes_fechamento")
      .update({
        contrato_id: form.contrato_id || null,
        valor_base: b,
        percentual: p,
        valor_comissao: valorCalculado,
        observacao: form.observacao || null,
        status: editando.status === "confirmada" ? "confirmada" : "calculada",
        lancado_por: (await supabase.auth.getUser()).data.user?.id,
        lancado_em: new Date().toISOString(),
      })
      .eq("id", editando.id);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }
    toast.success("Comissão lançada");
    setEditando(null);
    carregar();
  };

  const confirmar = async (row: Row) => {
    const { error } = await supabase
      .from("clientes_comissoes_fechamento")
      .update({ status: "confirmada", data_confirmacao: new Date().toISOString().slice(0, 10) })
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Comissão confirmada");
    carregar();
  };

  const cancelar = async (row: Row) => {
    if (!confirm("Cancelar esta comissão?")) return;
    const { error } = await supabase
      .from("clientes_comissoes_fechamento")
      .update({ status: "cancelada" })
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    carregar();
  };

  const atualizarPctMembro = async (membroId: string, pct: number) => {
    const { error } = await supabase
      .from("equipe_membros")
      .update({ percentual_comissao_fechamento: pct })
      .eq("id", membroId);
    if (error) return toast.error(error.message);
    toast.success("% padrão atualizado");
    carregar();
  };

  const filtrado = rows.filter(
    (r) =>
      (status === "todos" || r.status === status) &&
      (fechador === "todos" || r.fechador_user_id === fechador),
  );

  const totais = useMemo(() => {
    const por = (s: Status) =>
      rows
        .filter((r) => r.status === s)
        .reduce((acc, r) => acc + Number(r.valor_comissao ?? 0), 0);
    return {
      pendente: rows.filter((r) => r.status === "pendente").length,
      calculada: por("calculada"),
      confirmada: por("confirmada"),
    };
  }, [rows]);

  if (!isGestor) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">Acesso restrito a gestores.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/financeiro"><ArrowLeft className="w-4 h-4 mr-1" /> Voltar</Link>
      </Button>
      <PageHeader
        title="Comissões de fechamento"
        description="Clientes fechados pela equipe — calcule e confirme após o pagamento"
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Pendentes de cálculo</div>
          <div className="text-2xl font-semibold mt-1">{totais.pendente}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Lançadas (aguardando pagamento)</div>
          <div className="text-2xl font-semibold mt-1">{formatBRL(totais.calculada)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Confirmadas (pagas)</div>
          <div className="text-2xl font-semibold mt-1 text-emerald-700">{formatBRL(totais.confirmada)}</div>
        </Card>
      </div>

      <Tabs defaultValue="lista">
        <TabsList>
          <TabsTrigger value="lista"><HandCoins className="w-4 h-4 mr-1.5" />Comissões</TabsTrigger>
          <TabsTrigger value="config"><Percent className="w-4 h-4 mr-1.5" />% padrão por pessoa</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="space-y-3 mt-4">
          <div className="flex flex-wrap gap-2">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="pendente">Pendentes</SelectItem>
                <SelectItem value="calculada">Calculadas</SelectItem>
                <SelectItem value="confirmada">Confirmadas</SelectItem>
                <SelectItem value="cancelada">Canceladas</SelectItem>
              </SelectContent>
            </Select>
            <Select value={fechador} onValueChange={setFechador}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os fechadores</SelectItem>
                {membros.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>{m.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <Card className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></Card>
          ) : filtrado.length === 0 ? (
            <Card className="p-12 text-center text-muted-foreground">
              Nenhuma comissão neste filtro.
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="text-left p-3">Cliente</th>
                      <th className="text-left p-3">Fechado por</th>
                      <th className="text-right p-3">Base</th>
                      <th className="text-right p-3">%</th>
                      <th className="text-right p-3">Comissão</th>
                      <th className="text-left p-3">Status</th>
                      <th className="p-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrado.map((r) => (
                      <tr key={r.id} className="border-t hover:bg-muted/20">
                        <td className="p-3">
                          <Link to={`/clientes/${r.cliente_id}`} className="hover:underline flex items-center gap-1">
                            {r.cliente_nome || "—"}
                            <ExternalLink className="w-3 h-3 opacity-50" />
                          </Link>
                          <div className="text-xs text-muted-foreground">{formatDate(r.criado_em)}</div>
                        </td>
                        <td className="p-3">{r.fechador_nome || "—"}</td>
                        <td className="p-3 text-right">{r.valor_base ? formatBRL(r.valor_base) : "—"}</td>
                        <td className="p-3 text-right">{r.percentual ? `${r.percentual}%` : "—"}</td>
                        <td className="p-3 text-right font-medium">{r.valor_comissao ? formatBRL(r.valor_comissao) : "—"}</td>
                        <td className="p-3">
                          <Badge variant="outline" className={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                          {r.data_confirmacao && (
                            <div className="text-xs text-muted-foreground mt-0.5">em {formatDate(r.data_confirmacao)}</div>
                          )}
                        </td>
                        <td className="p-3 text-right whitespace-nowrap">
                          {r.status !== "cancelada" && (
                            <Button size="sm" variant="outline" onClick={() => abrir(r)}>
                              <Calculator className="w-3.5 h-3.5 mr-1" />
                              {r.status === "pendente" ? "Calcular" : "Editar"}
                            </Button>
                          )}
                          {r.status === "calculada" && (
                            <Button size="sm" variant="ghost" className="ml-1" onClick={() => confirmar(r)}>
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                              Confirmar
                            </Button>
                          )}
                          {r.status !== "cancelada" && r.status !== "confirmada" && (
                            <Button size="sm" variant="ghost" className="ml-1 text-muted-foreground" onClick={() => cancelar(r)}>
                              Cancelar
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="config" className="space-y-3 mt-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-display text-lg">% padrão de comissão por pessoa</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Este percentual é sugerido automaticamente quando uma nova comissão é gerada. Você pode ajustar caso a caso no lançamento.
            </p>
            <div className="space-y-2">
              {membros.filter((m) => m.status === "ativo").map((m) => (
                <PctRow key={m.id} membro={m} onSave={atualizarPctMembro} />
              ))}
              {membros.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum membro ativo na equipe.</p>
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog de cálculo */}
      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Lançar comissão de fechamento</DialogTitle>
            <DialogDescription>
              {editando?.cliente_nome} · fechado por {editando?.fechador_nome}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Contrato vinculado (opcional, necessário para confirmar via pagamento)</Label>
              <Select value={form.contrato_id || "nenhum"} onValueChange={(v) => {
                const id = v === "nenhum" ? "" : v;
                const c = contratosCliente.find((x) => x.id === id);
                setForm((f) => ({
                  ...f,
                  contrato_id: id,
                  valor_base: c?.valor_fixo ? String(c.valor_fixo) : f.valor_base,
                }));
              }}>
                <SelectTrigger><SelectValue placeholder="Selecione o contrato" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">— Nenhum —</SelectItem>
                  {contratosCliente.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.tipo} · {c.valor_fixo ? formatBRL(c.valor_fixo) : "sem valor"} · {c.status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Valor base (R$) *</Label>
                <Input
                  inputMode="decimal"
                  value={form.valor_base}
                  onChange={(e) => setForm({ ...form, valor_base: e.target.value })}
                  placeholder="0,00"
                />
              </div>
              <div>
                <Label>Percentual (%) *</Label>
                <Input
                  inputMode="decimal"
                  value={form.percentual}
                  onChange={(e) => setForm({ ...form, percentual: e.target.value })}
                  placeholder="Ex.: 5"
                />
              </div>
            </div>
            <div className="bg-muted/40 rounded-md p-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Comissão calculada</span>
              <span className="text-lg font-semibold text-emerald-700">{formatBRL(valorCalculado)}</span>
            </div>
            <div>
              <Label>Observação</Label>
              <Textarea rows={2} value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
            </div>
            <p className="text-xs text-muted-foreground">
              Após salvar, a comissão fica como <strong>Calculada</strong> e só vira <strong>Confirmada</strong> quando o pagamento do contrato vinculado é registrado (ou manualmente pelo botão Confirmar).
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button variant="gold" onClick={salvar}>Salvar lançamento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PctRow({ membro, onSave }: { membro: Membro; onSave: (id: string, pct: number) => void }) {
  const [v, setV] = useState(membro.percentual_comissao_fechamento?.toString() ?? "0");
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
      <div>
        <div className="font-medium text-sm">{membro.nome}</div>
        <div className="text-xs text-muted-foreground capitalize">{membro.cargo}</div>
      </div>
      <div className="flex items-center gap-2">
        <Input
          className="w-24 text-right"
          inputMode="decimal"
          value={v}
          onChange={(e) => setV(e.target.value)}
        />
        <span className="text-sm text-muted-foreground">%</span>
        <Button size="sm" variant="outline" onClick={() => onSave(membro.id, Number(v.replace(",", ".")) || 0)}>
          Salvar
        </Button>
      </div>
    </div>
  );
}
