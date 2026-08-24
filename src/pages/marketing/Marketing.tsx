import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Plus, TrendingUp, Users, Target, Calendar as CalIcon } from "lucide-react";
import {
  CANAIS_LEAD, CANAIS_CAMPANHA, STATUS_LEAD, MOTIVOS_PERDA, AREAS_DIREITO,
  STATUS_CAMPANHA, CANAIS_CONTEUDO, FORMATOS_CONTEUDO, STATUS_CONTEUDO,
  type CanalLead, type StatusLead,
} from "./types";

const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hoje = new Date();

export default function Marketing() {
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketing"
        description="Campanhas, leads, calendário editorial e ROI por canal"
      />

      <div className="flex items-center gap-2">
        <Label className="text-sm">Período:</Label>
        <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <SelectItem key={m} value={String(m)}>
                {new Date(2000, m - 1).toLocaleString("pt-BR", { month: "long" })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[ano - 1, ano, ano + 1].map((a) => (
              <SelectItem key={a} value={String(a)}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="dashboard"><TrendingUp className="w-4 h-4 mr-1" />Dashboard</TabsTrigger>
          <TabsTrigger value="leads"><Users className="w-4 h-4 mr-1" />Leads</TabsTrigger>
          <TabsTrigger value="campanhas"><Target className="w-4 h-4 mr-1" />Campanhas</TabsTrigger>
          <TabsTrigger value="calendario"><CalIcon className="w-4 h-4 mr-1" />Calendário</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-6"><DashboardTab mes={mes} ano={ano} /></TabsContent>
        <TabsContent value="leads" className="mt-6"><LeadsTab /></TabsContent>
        <TabsContent value="campanhas" className="mt-6"><CampanhasTab /></TabsContent>
        <TabsContent value="calendario" className="mt-6"><CalendarioTab mes={mes} ano={ano} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ============ DASHBOARD ============
function DashboardTab({ mes, ano }: { mes: number; ano: number }) {
  const ini = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fim = new Date(ano, mes, 0).toISOString().split("T")[0];

  const { data: leads = [] } = useQuery({
    queryKey: ["mkt_dash_leads", mes, ano],
    queryFn: async () => {
      const { data } = await supabase
        .from("mkt_leads")
        .select("canal, status, valor_contrato")
        .gte("criado_em", ini)
        .lte("criado_em", fim + "T23:59:59");
      return data ?? [];
    },
  });

  const { data: gastos = [] } = useQuery({
    queryKey: ["mkt_dash_gastos", mes, ano],
    queryFn: async () => {
      const { data } = await supabase
        .from("financeiro_marketing_lancamentos")
        .select("valor, categoria")
        .eq("mes", mes).eq("ano", ano);
      return data ?? [];
    },
  });

  const { data: fechamento } = useQuery({
    queryKey: ["mkt_dash_fech", mes, ano],
    queryFn: async () => {
      const { data } = await supabase
        .from("financeiro_fechamento")
        .select("valor_marketing, receita_total, percentual_marketing")
        .eq("mes", mes).eq("ano", ano).maybeSingle();
      return data;
    },
  });

  const total = leads.length;
  const convertidos = leads.filter((l) => l.status === "convertido");
  const taxaConv = total > 0 ? (convertidos.length / total) * 100 : 0;
  const receitaGerada = convertidos.reduce((a, l) => a + Number(l.valor_contrato ?? 0), 0);
  const gastoTotal = gastos.reduce((a, g) => a + Number(g.valor), 0);
  const verba = Number(fechamento?.valor_marketing ?? 0);
  const custoLead = total > 0 ? gastoTotal / total : 0;
  const custoCli = convertidos.length > 0 ? gastoTotal / convertidos.length : 0;
  const roi = gastoTotal > 0 ? ((receitaGerada - gastoTotal) / gastoTotal) * 100 : 0;

  const porCanal = useMemo(() => {
    return Object.keys(CANAIS_LEAD).map((c) => {
      const ls = leads.filter((l) => l.canal === c);
      const conv = ls.filter((l) => l.status === "convertido");
      return {
        canal: c as CanalLead,
        leads: ls.length,
        convertidos: conv.length,
        receita: conv.reduce((a, l) => a + Number(l.valor_contrato ?? 0), 0),
      };
    }).filter((x) => x.leads > 0);
  }, [leads]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard title="Verba do mês" value={fmtBRL(verba)} sub={`${fechamento?.percentual_marketing ?? 0}% da receita`} />
        <KpiCard title="Gasto realizado" value={fmtBRL(gastoTotal)} sub={verba > 0 ? `${((gastoTotal / verba) * 100).toFixed(0)}% da verba` : "—"} />
        <KpiCard title="Saldo" value={fmtBRL(verba - gastoTotal)} sub={verba - gastoTotal >= 0 ? "sobrou" : "estourou"} />
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard title="Leads" value={String(total)} sub="este mês" />
        <KpiCard title="Convertidos" value={String(convertidos.length)} />
        <KpiCard title="Taxa conv." value={`${taxaConv.toFixed(1)}%`} />
        <KpiCard title="Custo/cliente" value={fmtBRL(custoCli)} sub={`Custo/lead: ${fmtBRL(custoLead)}`} />
      </div>

      <Card>
        <CardHeader><CardTitle>ROI por canal</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2">Canal</th>
                  <th className="py-2 text-right">Leads</th>
                  <th className="py-2 text-right">Convertidos</th>
                  <th className="py-2 text-right">Receita</th>
                </tr>
              </thead>
              <tbody>
                {porCanal.length === 0 ? (
                  <tr><td colSpan={4} className="py-4 text-center text-muted-foreground">Sem leads no período</td></tr>
                ) : porCanal.map((c) => (
                  <tr key={c.canal} className="border-t">
                    <td className="py-2 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: CANAIS_LEAD[c.canal].cor }} />
                      {CANAIS_LEAD[c.canal].label}
                    </td>
                    <td className="py-2 text-right">{c.leads}</td>
                    <td className="py-2 text-right">{c.convertidos}</td>
                    <td className="py-2 text-right">{fmtBRL(c.receita)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t font-semibold">
                <tr>
                  <td className="py-2">Total</td>
                  <td className="py-2 text-right">{total}</td>
                  <td className="py-2 text-right">{convertidos.length}</td>
                  <td className="py-2 text-right">{fmtBRL(receitaGerada)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="mt-3 text-sm text-muted-foreground">
            ROI consolidado: <span className={`font-semibold ${roi >= 0 ? "text-green-600" : "text-red-600"}`}>{roi.toFixed(1)}%</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{title}</div>
        <div className="text-2xl font-bold mt-1">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

// ============ LEADS (Kanban) ============
function LeadsTab() {
  const qc = useQueryClient();
  const [novoOpen, setNovoOpen] = useState(false);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [perdaId, setPerdaId] = useState<string | null>(null);
  const [convId, setConvId] = useState<string | null>(null);

  const { data: leads = [] } = useQuery({
    queryKey: ["mkt_leads"],
    queryFn: async () => {
      const { data } = await supabase
        .from("mkt_leads")
        .select("*, mkt_campanhas(nome), parceiros(nome)")
        .order("criado_em", { ascending: false });
      return data ?? [];
    },
  });

  const updStatus = useMutation({
    mutationFn: async (p: { id: string; status: StatusLead }) => {
      const { error } = await supabase.from("mkt_leads").update({ status: p.status }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mkt_leads"] }),
  });

  const cols: StatusLead[] = ["novo", "em_atendimento", "proposta_enviada", "convertido", "perdido"];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setNovoOpen(true)}><Plus className="w-4 h-4 mr-1" />Novo lead</Button>
      </div>

      <div className="grid gap-3 grid-cols-1 md:grid-cols-3 lg:grid-cols-5">
        {cols.map((col) => {
          const items = leads.filter((l) => l.status === col);
          return (
            <div key={col} className="bg-muted/40 rounded-lg p-3 min-h-[200px]">
              <div className="flex items-center justify-between mb-3">
                <Badge className={STATUS_LEAD[col].cor}>{STATUS_LEAD[col].label}</Badge>
                <span className="text-xs text-muted-foreground">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((l) => (
                  <Card key={l.id} className="cursor-pointer hover:shadow-md transition" onClick={() => setDetalheId(l.id)}>
                    <CardContent className="p-3 space-y-1">
                      <div className="font-semibold text-sm">{l.nome}</div>
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="w-2 h-2 rounded-full" style={{ background: CANAIS_LEAD[l.canal as CanalLead]?.cor }} />
                        <span className="text-muted-foreground">{CANAIS_LEAD[l.canal as CanalLead]?.label}</span>
                      </div>
                      {l.area_direito && (
                        <div className="text-xs text-muted-foreground">{AREAS_DIREITO[l.area_direito as keyof typeof AREAS_DIREITO]}</div>
                      )}
                    </CardContent>
                  </Card>
                ))}
                {items.length === 0 && <div className="text-xs text-muted-foreground text-center py-4">Vazio</div>}
              </div>
            </div>
          );
        })}
      </div>

      <NovoLeadDialog open={novoOpen} onOpenChange={setNovoOpen} />
      {detalheId && (
        <LeadDetalheDialog
          leadId={detalheId}
          onClose={() => setDetalheId(null)}
          onConverter={(id) => { setDetalheId(null); setConvId(id); }}
          onPerder={(id) => { setDetalheId(null); setPerdaId(id); }}
          onMudarStatus={(id, status) => updStatus.mutate({ id, status })}
        />
      )}
      {convId && <ConverterDialog leadId={convId} onClose={() => setConvId(null)} />}
      {perdaId && <PerderDialog leadId={perdaId} onClose={() => setPerdaId(null)} />}
    </div>
  );
}

function NovoLeadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>({ nome: "", canal: "instagram_organico" });
  const { data: campanhas = [] } = useQuery({
    queryKey: ["mkt_campanhas_select"],
    queryFn: async () => (await supabase.from("mkt_campanhas").select("id, nome").eq("status", "ativa")).data ?? [],
  });
  const { data: parceiros = [] } = useQuery({
    queryKey: ["parceiros_select"],
    queryFn: async () => (await supabase.from("parceiros").select("id, nome").eq("ativo", true)).data ?? [],
  });

  const criar = useMutation({
    mutationFn: async () => {
      if (!form.nome) throw new Error("Nome é obrigatório");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("mkt_leads").insert({ ...form, registrado_por: u.user?.id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mkt_leads"] });
      toast({ title: "Lead criado" });
      onOpenChange(false);
      setForm({ nome: "", canal: "instagram_organico" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo lead</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nome *</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>WhatsApp</Label><Input value={form.whatsapp ?? ""} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></div>
            <div><Label>E-mail</Label><Input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          </div>
          <div>
            <Label>Canal</Label>
            <Select value={form.canal} onValueChange={(v) => setForm({ ...form, canal: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CANAIS_LEAD).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {form.canal === "meta_ads" && (
            <div>
              <Label>Campanha</Label>
              <Select value={form.campanha_id ?? ""} onValueChange={(v) => setForm({ ...form, campanha_id: v || null })}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{campanhas.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {form.canal === "indicacao_parceiro" && (
            <div>
              <Label>Parceiro</Label>
              <Select value={form.parceiro_id ?? ""} onValueChange={(v) => setForm({ ...form, parceiro_id: v || null })}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{parceiros.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Área de interesse</Label>
            <Select value={form.area_direito ?? ""} onValueChange={(v) => setForm({ ...form, area_direito: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>{Object.entries(AREAS_DIREITO).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Descrição</Label><Textarea value={form.descricao_interesse ?? ""} onChange={(e) => setForm({ ...form, descricao_interesse: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => criar.mutate()} disabled={criar.isPending}>Criar lead</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeadDetalheDialog({
  leadId, onClose, onConverter, onPerder, onMudarStatus,
}: {
  leadId: string;
  onClose: () => void;
  onConverter: (id: string) => void;
  onPerder: (id: string) => void;
  onMudarStatus: (id: string, status: StatusLead) => void;
}) {
  const { data: lead } = useQuery({
    queryKey: ["mkt_lead", leadId],
    queryFn: async () => (await supabase.from("mkt_leads").select("*").eq("id", leadId).single()).data,
  });
  if (!lead) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{lead.nome}</DialogTitle></DialogHeader>
        <div className="space-y-2 text-sm">
          <div><strong>Canal:</strong> {CANAIS_LEAD[lead.canal as CanalLead]?.label}</div>
          {lead.whatsapp && <div><strong>WhatsApp:</strong> {lead.whatsapp}</div>}
          {lead.email && <div><strong>E-mail:</strong> {lead.email}</div>}
          {lead.area_direito && <div><strong>Área:</strong> {AREAS_DIREITO[lead.area_direito as keyof typeof AREAS_DIREITO]}</div>}
          {lead.descricao_interesse && <div><strong>Interesse:</strong> {lead.descricao_interesse}</div>}
          <div><strong>Status:</strong> <Badge className={STATUS_LEAD[lead.status as StatusLead].cor}>{STATUS_LEAD[lead.status as StatusLead].label}</Badge></div>
          <div className="pt-2">
            <Label className="text-xs">Mudar status</Label>
            <Select value={lead.status} onValueChange={(v) => onMudarStatus(lead.id, v as StatusLead)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["novo", "em_atendimento", "proposta_enviada"] as StatusLead[]).map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LEAD[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          {lead.status !== "convertido" && lead.status !== "perdido" && (
            <>
              <Button variant="destructive" onClick={() => onPerder(lead.id)}>Marcar como perdido</Button>
              <Button onClick={() => onConverter(lead.id)}>Converter em cliente</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConverterDialog({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [valor, setValor] = useState("");
  const converter = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("converter_lead_em_cliente", {
        _lead_id: leadId,
        _valor_contrato: valor ? Number(valor) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mkt_leads"] });
      toast({ title: "Lead convertido em cliente" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Converter em cliente</DialogTitle></DialogHeader>
        <div>
          <Label>Valor do contrato (opcional)</Label>
          <Input type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => converter.mutate()} disabled={converter.isPending}>Converter</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PerderDialog({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [motivo, setMotivo] = useState<string>("");
  const [obs, setObs] = useState("");
  const perder = useMutation({
    mutationFn: async () => {
      if (!motivo) throw new Error("Motivo é obrigatório");
      const { error } = await supabase.from("mkt_leads").update({
        status: "perdido", motivo_perda: motivo, observacao_perda: obs,
      }).eq("id", leadId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["mkt_leads"] }); toast({ title: "Lead arquivado" }); onClose(); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Marcar como perdido</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Motivo *</Label>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>{Object.entries(MOTIVOS_PERDA).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Observação</Label><Textarea value={obs} onChange={(e) => setObs(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" onClick={() => perder.mutate()} disabled={perder.isPending}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ CAMPANHAS ============
function CampanhasTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ nome: "", canal: "meta_ads", data_inicio: new Date().toISOString().split("T")[0], status: "planejada" });

  const { data: campanhas = [] } = useQuery({
    queryKey: ["mkt_campanhas"],
    queryFn: async () => (await supabase.from("mkt_campanhas").select("*").order("data_inicio", { ascending: false })).data ?? [],
  });

  const criar = useMutation({
    mutationFn: async () => {
      if (!form.nome) throw new Error("Nome obrigatório");
      const { data: u } = await supabase.auth.getUser();
      const payload = {
        ...form,
        orcamento_total: Number(form.orcamento_total ?? 0),
        criado_por: u.user?.id,
      };
      const { error } = await supabase.from("mkt_campanhas").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mkt_campanhas"] });
      toast({ title: "Campanha criada" });
      setOpen(false);
      setForm({ nome: "", canal: "meta_ads", data_inicio: new Date().toISOString().split("T")[0], status: "planejada" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" />Nova campanha</Button>
      </div>

      <div className="grid gap-3">
        {campanhas.length === 0 && <div className="text-center text-muted-foreground py-8">Nenhuma campanha cadastrada</div>}
        {campanhas.map((c: any) => {
          const pct = c.orcamento_total > 0 ? (c.gasto_realizado / c.orcamento_total) * 100 : 0;
          return (
            <Card key={c.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="font-semibold">{c.nome}</div>
                    <div className="text-xs text-muted-foreground">
                      {CANAIS_CAMPANHA[c.canal as keyof typeof CANAIS_CAMPANHA]} ·{" "}
                      {new Date(c.data_inicio).toLocaleDateString("pt-BR")}
                      {c.data_fim && ` → ${new Date(c.data_fim).toLocaleDateString("pt-BR")}`}
                    </div>
                  </div>
                  <Badge>{STATUS_CAMPANHA[c.status as keyof typeof STATUS_CAMPANHA]}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div><div className="text-xs text-muted-foreground">Orçamento</div><div className="font-medium">{fmtBRL(c.orcamento_total ?? 0)}</div></div>
                  <div><div className="text-xs text-muted-foreground">Gasto</div><div className="font-medium">{fmtBRL(c.gasto_realizado ?? 0)} ({pct.toFixed(0)}%)</div></div>
                  <div><div className="text-xs text-muted-foreground">Leads gerados</div><div className="font-medium">{c.leads_gerados ?? 0}</div></div>
                  <div><div className="text-xs text-muted-foreground">Cliques</div><div className="font-medium">{c.cliques ?? 0}</div></div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova campanha</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome *</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Canal</Label>
                <Select value={form.canal} onValueChange={(v) => setForm({ ...form, canal: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(CANAIS_CAMPANHA).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(STATUS_CAMPANHA).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Início *</Label><Input type="date" value={form.data_inicio} onChange={(e) => setForm({ ...form, data_inicio: e.target.value })} /></div>
              <div><Label>Fim</Label><Input type="date" value={form.data_fim ?? ""} onChange={(e) => setForm({ ...form, data_fim: e.target.value || null })} /></div>
            </div>
            <div><Label>Orçamento total (R$)</Label><Input type="number" step="0.01" value={form.orcamento_total ?? ""} onChange={(e) => setForm({ ...form, orcamento_total: e.target.value })} /></div>
            <div><Label>Observações</Label><Textarea value={form.observacoes ?? ""} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => criar.mutate()} disabled={criar.isPending}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ CALENDÁRIO ============
function CalendarioTab({ mes, ano }: { mes: number; ano: number }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ titulo: "", canal: "instagram", formato: "reels", data_planejada: new Date().toISOString().split("T")[0], status: "ideia" });

  const ini = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fim = new Date(ano, mes, 0).toISOString().split("T")[0];

  const { data: posts = [] } = useQuery({
    queryKey: ["mkt_conteudo", mes, ano],
    queryFn: async () => (await supabase
      .from("mkt_conteudo")
      .select("*")
      .gte("data_planejada", ini).lte("data_planejada", fim)
      .order("data_planejada")).data ?? [],
  });

  const criar = useMutation({
    mutationFn: async () => {
      if (!form.titulo) throw new Error("Título obrigatório");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("mkt_conteudo").insert({ ...form, criado_por: u.user?.id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mkt_conteudo"] });
      toast({ title: "Post criado" });
      setOpen(false);
      setForm({ titulo: "", canal: "instagram", formato: "reels", data_planejada: new Date().toISOString().split("T")[0], status: "ideia" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // Kanban por status
  const cols = Object.keys(STATUS_CONTEUDO) as (keyof typeof STATUS_CONTEUDO)[];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" />Novo post</Button>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
        {cols.map((col) => {
          const items = posts.filter((p: any) => p.status === col);
          return (
            <div key={col} className="bg-muted/40 rounded-lg p-2 min-h-[150px]">
              <div className="text-xs font-medium mb-2">{STATUS_CONTEUDO[col]} <span className="text-muted-foreground">({items.length})</span></div>
              <div className="space-y-2">
                {items.map((p: any) => (
                  <Card key={p.id}>
                    <CardContent className="p-2 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: CANAIS_CONTEUDO[p.canal as keyof typeof CANAIS_CONTEUDO]?.cor }} />
                        <span className="text-[10px] text-muted-foreground uppercase">{CANAIS_CONTEUDO[p.canal as keyof typeof CANAIS_CONTEUDO]?.label}</span>
                      </div>
                      <div className="text-xs font-medium">{p.titulo}</div>
                      <div className="text-[10px] text-muted-foreground">{new Date(p.data_planejada).toLocaleDateString("pt-BR")}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo post</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Título / tema *</Label><Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Canal</Label>
                <Select value={form.canal} onValueChange={(v) => setForm({ ...form, canal: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(CANAIS_CONTEUDO).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Formato</Label>
                <Select value={form.formato} onValueChange={(v) => setForm({ ...form, formato: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(FORMATOS_CONTEUDO).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Data planejada *</Label><Input type="date" value={form.data_planejada} onChange={(e) => setForm({ ...form, data_planejada: e.target.value })} /></div>
            <div><Label>Pauta</Label><Textarea value={form.pauta ?? ""} onChange={(e) => setForm({ ...form, pauta: e.target.value })} /></div>
            <div><Label>Legenda</Label><Textarea value={form.legenda ?? ""} onChange={(e) => setForm({ ...form, legenda: e.target.value })} /></div>
            <div><Label>Link do material</Label><Input value={form.link_material ?? ""} onChange={(e) => setForm({ ...form, link_material: e.target.value })} placeholder="Canva, Drive..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => criar.mutate()} disabled={criar.isPending}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
