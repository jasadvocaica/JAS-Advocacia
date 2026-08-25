import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, CheckCircle2, DollarSign, Loader2, MapPin, Plus, Receipt, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type Diligencia = {
  id: string;
  cliente_id: string | null;
  processo_id: string | null;
  contratante_nome: string;
  contratante_telefone: string | null;
  descricao: string;
  tipo: string;
  data_hora: string;
  local: string | null;
  status: string;
  pagamento_status: string;
  natureza_receita: "escritorio" | "pessoal";
  incluir_relatorio_contabil: boolean;
  valor_contratado: number | null;
  valor_recebido: number;
  paginas_impressas: number;
  km_rodado: number;
  outras_despesas: number;
  custo_total: number;
  lucro_previsto: number;
  sincronizar_google: boolean;
  google_event_id: string | null;
  data_vencimento_cobranca: string | null;
  asaas_payment_id: string | null;
  asaas_status: string | null;
  asaas_invoice_url: string | null;
  observacoes: string | null;
};

const hojeLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const FORM_INICIAL = {
  cliente_id: "_none",
  processo_id: "_none",
  contratante_nome: "",
  contratante_telefone: "",
  descricao: "",
  tipo: "audiencia",
  data_hora: hojeLocal(),
  local: "",
  status: "agendada",
  pagamento_status: "a_receber",
  natureza_receita: "escritorio",
  valor_contratado: "",
  valor_recebido: "",
  data_vencimento_cobranca: "",
  paginas_impressas: "0",
  km_rodado: "0",
  outras_despesas: "0",
  observacoes: "",
  sincronizar_google: false,
};

const statusLabel: Record<string, string> = {
  solicitada: "Solicitada",
  agendada: "Agendada",
  em_execucao: "Em execução",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

const pagamentoLabel: Record<string, string> = {
  nao_informado: "Não informado",
  a_receber: "A receber",
  parcial: "Parcial",
  recebido: "Recebido",
  cancelado: "Cancelado",
};

const formatBRL = (valor: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(valor ?? 0));

export default function Diligencias() {
  const { isGestor } = useAuth();
  const [itens, setItens] = useState<Diligencia[]>([]);
  const [clientes, setClientes] = useState<Array<{ id: string; nome: string }>>([]);
  const [processos, setProcessos] = useState<Array<{ id: string; numero_cnj: string | null; tipo_acao: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [cobrandoId, setCobrandoId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [mes, setMes] = useState(format(new Date(), "yyyy-MM"));
  const [filtroPagamento, setFiltroPagamento] = useState("todos");
  const [filtroNatureza, setFiltroNatureza] = useState("todos");
  const [form, setForm] = useState(FORM_INICIAL);

  async function carregar() {
    setLoading(true);
    const inicio = `${mes}-01T00:00:00-04:00`;
    const fimData = new Date(`${mes}-01T12:00:00`);
    fimData.setMonth(fimData.getMonth() + 1);
    const fim = `${format(fimData, "yyyy-MM")}-01T00:00:00-04:00`;

    let query = (supabase as any)
      .from("diligencias")
      .select("*")
      .gte("data_hora", inicio)
      .lt("data_hora", fim)
      .order("data_hora", { ascending: true });
    if (filtroPagamento !== "todos") query = query.eq("pagamento_status", filtroPagamento);
    if (filtroNatureza !== "todos") query = query.eq("natureza_receita", filtroNatureza);

    const [{ data, error }, clientesResp, processosResp] = await Promise.all([
      query,
      (supabase as any).from("clientes").select("id,nome").eq("ativo", true).order("nome").limit(500),
      (supabase as any).from("processos").select("id,numero_cnj,tipo_acao").order("criado_em", { ascending: false }).limit(500),
    ]);

    if (error) toast.error("Não foi possível carregar as diligências");
    setItens((data ?? []) as Diligencia[]);
    setClientes(clientesResp.data ?? []);
    setProcessos(processosResp.data ?? []);
    setLoading(false);
  }

  useEffect(() => { carregar(); }, [mes, filtroPagamento, filtroNatureza]);

  const totais = useMemo(() => {
    const contratados = itens.reduce((s, i) => s + Number(i.valor_contratado ?? 0), 0);
    const recebidos = itens.reduce((s, i) => s + Number(i.valor_recebido ?? 0), 0);
    const custos = itens.reduce((s, i) => s + Number(i.custo_total ?? 0), 0);
    const escritorio = itens.filter(i => i.natureza_receita === "escritorio")
      .reduce((s, i) => s + Number(i.valor_recebido ?? 0), 0);
    const pessoal = itens.filter(i => i.natureza_receita === "pessoal")
      .reduce((s, i) => s + Number(i.valor_recebido ?? 0), 0);
    return { contratados, recebidos, escritorio, pessoal, custos, aReceber: Math.max(0, contratados - recebidos), lucro: recebidos - custos };
  }, [itens]);

  async function salvar() {
    if (!form.contratante_nome.trim() || !form.descricao.trim() || !form.data_hora) {
      toast.error("Contratante, descrição e data são obrigatórios");
      return;
    }

    const paginas = Number(form.paginas_impressas || 0);
    const km = Number(form.km_rodado || 0);
    const valorRecebido = Number(form.valor_recebido || 0);
    const payload = {
      cliente_id: form.cliente_id === "_none" ? null : form.cliente_id,
      processo_id: form.processo_id === "_none" ? null : form.processo_id,
      contratante_nome: form.contratante_nome.trim(),
      contratante_telefone: form.contratante_telefone.trim() || null,
      descricao: form.descricao.trim(),
      tipo: form.tipo,
      data_hora: new Date(form.data_hora).toISOString(),
      local: form.local.trim() || null,
      status: form.status,
      pagamento_status: form.pagamento_status,
      natureza_receita: form.natureza_receita,
      valor_contratado: form.valor_contratado === "" ? null : Number(form.valor_contratado),
      valor_recebido: valorRecebido,
      data_vencimento_cobranca: form.data_vencimento_cobranca || null,
      data_recebimento: form.pagamento_status === "recebido" ? new Date().toISOString().slice(0, 10) : null,
      paginas_impressas: paginas,
      custo_papel: Number((paginas * 0.078).toFixed(2)),
      custo_tinta: Number((paginas * 0.08).toFixed(2)),
      km_rodado: km,
      custo_combustivel: Number((km * 0.8767).toFixed(2)),
      outras_despesas: Number(form.outras_despesas || 0),
      observacoes: form.observacoes.trim() || null,
      sincronizar_google: false,
    };

    setSalvando(true);
    const operacao = editandoId
      ? (supabase as any).from("diligencias").update(payload).eq("id", editandoId).select("id").single()
      : (supabase as any).from("diligencias").insert(payload).select("id").single();
    const { data: salvo, error } = await operacao;
    if (error) {
      toast.error(error.message);
      setSalvando(false);
      return;
    }

    toast.success(editandoId ? "Diligência atualizada" : "Diligência cadastrada");
    setForm({ ...FORM_INICIAL, data_hora: hojeLocal() });
    setEditandoId(null);
    setOpen(false);
    setSalvando(false);
    carregar();
  }

  async function gerarCobranca(item: Diligencia) {
    if (item.natureza_receita !== "escritorio") {
      return toast.error("Recebimentos pessoais não são enviados ao Asaas nem à contabilidade");
    }
    if (!item.cliente_id) return toast.error("Vincule a diligência a um cliente antes de cobrar");
    if (!item.valor_contratado || item.valor_contratado <= item.valor_recebido) return toast.error("Não existe saldo para cobrar");
    const vencimento = item.data_vencimento_cobranca || window.prompt("Data de vencimento (AAAA-MM-DD)", new Date().toISOString().slice(0, 10));
    if (!vencimento) return;
    setCobrandoId(item.id);
    const { data, error } = await supabase.functions.invoke("asaas-cobranca", {
      body: { action: "criar_cobranca_diligencia", diligencia_id: item.id, billing_type: "UNDEFINED", due_date: vencimento },
    });
    setCobrandoId(null);
    if (error || data?.error) return toast.error(data?.error || error?.message || "Erro ao gerar cobrança");
    toast.success(data?.ja_existente ? "Cobrança já existente" : "Cobrança criada no Asaas Sandbox");
    if (data?.invoice_url) window.open(data.invoice_url, "_blank", "noopener,noreferrer");
    carregar();
  }

  async function marcarRecebido(item: Diligencia) {
    const valor = Number(item.valor_contratado ?? 0);
    const { error } = await (supabase as any).from("diligencias").update({
      pagamento_status: "recebido",
      valor_recebido: valor,
      data_recebimento: new Date().toISOString().slice(0, 10),
    }).eq("id", item.id);
    if (error) return toast.error(error.message);
    toast.success("Recebimento confirmado");
    carregar();
  }

  function editar(item: Diligencia) {
    const d = new Date(item.data_hora);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    setForm({
      cliente_id: item.cliente_id || "_none",
      processo_id: item.processo_id || "_none",
      contratante_nome: item.contratante_nome,
      contratante_telefone: item.contratante_telefone || "",
      descricao: item.descricao,
      tipo: item.tipo,
      data_hora: d.toISOString().slice(0, 16),
      local: item.local || "",
      status: item.status,
      pagamento_status: item.pagamento_status,
      natureza_receita: item.natureza_receita ?? "escritorio",
      valor_contratado: item.valor_contratado == null ? "" : String(item.valor_contratado),
      valor_recebido: String(item.valor_recebido || 0),
      data_vencimento_cobranca: item.data_vencimento_cobranca || "",
      paginas_impressas: String(item.paginas_impressas || 0),
      km_rodado: String(item.km_rodado || 0),
      outras_despesas: String(item.outras_despesas || 0),
      observacoes: item.observacoes || "",
      sincronizar_google: item.sincronizar_google,
    });
    setEditandoId(item.id);
    setOpen(true);
  }

  function abrirGoogleAgenda(item: Diligencia) {
    const inicio = new Date(item.data_hora);
    const fim = new Date(inicio.getTime() + 60 * 60 * 1000);
    const compacta = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: `⚖️ Diligência — ${item.descricao}`,
      dates: `${compacta(inicio)}/${compacta(fim)}`,
      details: `Contratante: ${item.contratante_nome}\n${item.observacoes || ""}\n\nCriado pelo sistema JAS Advocacia.`,
      location: item.local || "",
      ctz: "America/Cuiaba",
    });
    window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, "_blank", "noopener,noreferrer");
  }

  async function excluir(id: string) {
    if (!confirm("Excluir esta diligência?")) return;
    const { error } = await (supabase as any).from("diligencias").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Diligência excluída");
    carregar();
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Diligências" description="Agenda, execução, custos, cobrança e lucro das diligências">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="gold" onClick={() => { setEditandoId(null); setForm({ ...FORM_INICIAL, data_hora: hojeLocal() }); }}><Plus className="w-4 h-4" /> Nova diligência</Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editandoId ? "Editar diligência" : "Nova diligência"}</DialogTitle></DialogHeader>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label>Contratante *</Label><Input value={form.contratante_nome} onChange={e => setForm({ ...form, contratante_nome: e.target.value })} /></div>
              <div><Label>Telefone</Label><Input value={form.contratante_telefone} onChange={e => setForm({ ...form, contratante_telefone: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label>Diligência / descrição *</Label><Input value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} /></div>
              <div>
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="audiencia">Audiência</SelectItem><SelectItem value="protocolo">Protocolo</SelectItem>
                    <SelectItem value="digitalizacao">Digitalização</SelectItem><SelectItem value="copia">Cópia</SelectItem>
                    <SelectItem value="despacho">Despacho</SelectItem><SelectItem value="outra">Outra</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Situação</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="solicitada">Solicitada</SelectItem><SelectItem value="agendada">Agendada</SelectItem><SelectItem value="em_execucao">Em execução</SelectItem><SelectItem value="concluida">Concluída</SelectItem><SelectItem value="cancelada">Cancelada</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Data e horário *</Label><Input type="datetime-local" value={form.data_hora} onChange={e => setForm({ ...form, data_hora: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label>Local</Label><Input value={form.local} onChange={e => setForm({ ...form, local: e.target.value })} /></div>
              <div>
                <Label>Cliente do escritório (opcional)</Label>
                <Select value={form.cliente_id} onValueChange={v => setForm({ ...form, cliente_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="_none">Sem vínculo</SelectItem>{clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Processo (opcional)</Label>
                <Select value={form.processo_id} onValueChange={v => setForm({ ...form, processo_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="_none">Sem vínculo</SelectItem>{processos.map(p => <SelectItem key={p.id} value={p.id}>{p.numero_cnj || p.tipo_acao || "Processo sem número"}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Valor contratado (R$)</Label><Input type="number" step="0.01" value={form.valor_contratado} onChange={e => setForm({ ...form, valor_contratado: e.target.value })} /></div>
              <div>
                <Label>Destino do recebimento *</Label>
                <Select value={form.natureza_receita} onValueChange={v => setForm({ ...form, natureza_receita: v as "escritorio" | "pessoal" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="escritorio">Faturar pelo escritório</SelectItem>
                    <SelectItem value="pessoal">Recebimento pessoal — fora da contabilidade</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Receitas pessoais ficam no controle gerencial, mas não entram no relatório contábil nem no Asaas.
                </p>
              </div>
              <div>
                <Label>Pagamento</Label>
                <Select value={form.pagamento_status} onValueChange={v => setForm({ ...form, pagamento_status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="nao_informado">Não informado</SelectItem><SelectItem value="a_receber">A receber</SelectItem><SelectItem value="parcial">Parcial</SelectItem><SelectItem value="recebido">Recebido</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Valor já recebido (R$)</Label><Input type="number" step="0.01" value={form.valor_recebido} onChange={e => setForm({ ...form, valor_recebido: e.target.value })} /></div>
              <div><Label>Vencimento da cobrança</Label><Input type="date" value={form.data_vencimento_cobranca} onChange={e => setForm({ ...form, data_vencimento_cobranca: e.target.value })} /></div>
              <div><Label>Páginas impressas</Label><Input type="number" value={form.paginas_impressas} onChange={e => setForm({ ...form, paginas_impressas: e.target.value })} /></div>
              <div><Label>Km rodado (ida e volta)</Label><Input type="number" step="0.1" value={form.km_rodado} onChange={e => setForm({ ...form, km_rodado: e.target.value })} /></div>
              <div><Label>Outras despesas (R$)</Label><Input type="number" step="0.01" value={form.outras_despesas} onChange={e => setForm({ ...form, outras_despesas: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label>Observações</Label><Textarea value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} /></div>
              <div className="sm:col-span-2 rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                A agenda é adicionada manualmente pelo botão “Agenda” após salvar a diligência.
              </div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button variant="gold" disabled={salvando} onClick={salvar}>{salvando && <Loader2 className="w-4 h-4 animate-spin" />} Salvar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        <Kpi icon={<Receipt className="w-4 h-4" />} label="Contratado" value={formatBRL(totais.contratados)} />
        <Kpi icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />} label="Recebido total" value={formatBRL(totais.recebidos)} />
        <Kpi icon={<Receipt className="w-4 h-4 text-primary" />} label="Escritório · contábil" value={formatBRL(totais.escritorio)} />
        <Kpi icon={<Wallet className="w-4 h-4 text-violet-600" />} label="Pessoal · fora contábil" value={formatBRL(totais.pessoal)} />
        <Kpi icon={<Wallet className="w-4 h-4 text-amber-600" />} label="A receber" value={formatBRL(totais.aReceber)} />
        <Kpi icon={<DollarSign className="w-4 h-4 text-destructive" />} label="Custos" value={formatBRL(totais.custos)} />
        <Kpi icon={<DollarSign className="w-4 h-4 text-primary" />} label="Lucro realizado" value={formatBRL(totais.lucro)} />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 mb-4">
          <div><Label className="text-xs">Mês</Label><Input type="month" value={mes} onChange={e => setMes(e.target.value)} className="w-44" /></div>
          <div>
            <Label className="text-xs">Pagamento</Label>
            <Select value={filtroPagamento} onValueChange={setFiltroPagamento}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="todos">Todos</SelectItem><SelectItem value="a_receber">A receber</SelectItem><SelectItem value="parcial">Parcial</SelectItem><SelectItem value="recebido">Recebido</SelectItem></SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Destino da receita</Label>
            <Select value={filtroNatureza} onValueChange={setFiltroNatureza}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="escritorio">Escritório · contabilidade</SelectItem>
                <SelectItem value="pessoal">Pessoal · fora da contabilidade</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div> : itens.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">Nenhuma diligência neste período.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Diligência</TableHead><TableHead>Contratante</TableHead><TableHead>Valor</TableHead><TableHead>Custos</TableHead><TableHead>Destino</TableHead><TableHead>Pagamento</TableHead><TableHead>Agenda</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>{itens.map(item => (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-nowrap"><div className="font-medium">{format(new Date(item.data_hora), "dd/MM/yyyy", { locale: ptBR })}</div><div className="text-xs text-muted-foreground">{format(new Date(item.data_hora), "HH:mm")}</div></TableCell>
                  <TableCell><div className="font-medium">{item.descricao}</div><div className="flex gap-2 mt-1"><Badge variant="outline">{statusLabel[item.status] ?? item.status}</Badge>{item.local && <span className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />{item.local}</span>}</div></TableCell>
                  <TableCell>{item.contratante_nome}</TableCell>
                  <TableCell className="font-mono">{formatBRL(item.valor_contratado)}</TableCell>
                  <TableCell className="font-mono">{formatBRL(item.custo_total)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={item.natureza_receita === "pessoal" ? "border-violet-300 text-violet-700" : "border-primary/30 text-primary"}>
                      {item.natureza_receita === "pessoal" ? "Pessoal · fora contábil" : "Escritório · contábil"}
                    </Badge>
                  </TableCell>
                  <TableCell><Badge className={item.pagamento_status === "recebido" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>{pagamentoLabel[item.pagamento_status] ?? item.pagamento_status}</Badge></TableCell>
                  <TableCell><span className="text-xs text-muted-foreground">Adição manual</span></TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {!item.google_event_id && item.status !== "cancelada" && <Button size="sm" variant="ghost" onClick={() => abrirGoogleAgenda(item)}><CalendarDays className="w-4 h-4" /> Agenda</Button>}
                    {item.asaas_invoice_url ? <Button size="sm" variant="ghost" onClick={() => window.open(item.asaas_invoice_url!, "_blank", "noopener,noreferrer")}>Fatura</Button> : item.natureza_receita === "escritorio" && item.pagamento_status !== "recebido" && item.valor_contratado !== null && <Button size="sm" variant="ghost" disabled={cobrandoId === item.id} onClick={() => gerarCobranca(item)}>{cobrandoId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />} Cobrar</Button>}
                    {item.pagamento_status !== "recebido" && item.valor_contratado !== null && <Button size="sm" variant="ghost" onClick={() => marcarRecebido(item)}>Recebi</Button>}
                    <Button size="sm" variant="ghost" onClick={() => editar(item)}>Editar</Button>
                    {isGestor && <Button size="icon" variant="ghost" onClick={() => excluir(item.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>}
                  </TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <Card className="p-4"><div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">{icon}{label}</div><div className="font-display text-xl mt-1">{value}</div></Card>;
}
