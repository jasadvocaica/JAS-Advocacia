import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import { Plus, Loader2, Plane, AlertCircle } from "lucide-react";

interface Membro { id: string; nome: string; cargo: string }
interface Ferias {
  id: string;
  membro_id: string;
  periodo_aquisitivo_inicio: string;
  periodo_aquisitivo_fim: string;
  data_inicio: string | null;
  data_fim: string | null;
  dias_gozados: number | null;
  dias_direito: number;
  dias_vendidos: number;
  status: string;
  observacao: string | null;
}
interface Afastamento {
  id: string;
  membro_id: string;
  tipo: string;
  data_inicio: string;
  data_fim: string | null;
  dias_afastamento: number | null;
  cid: string | null;
  observacao: string | null;
  status: string;
}

const TIPOS_AFASTAMENTO = [
  { v: "atestado_medico", l: "Atestado médico" },
  { v: "licenca_maternidade", l: "Licença maternidade" },
  { v: "licenca_paternidade", l: "Licença paternidade" },
  { v: "acidente_trabalho", l: "Acidente de trabalho" },
  { v: "licenca_sem_vencimento", l: "Licença sem vencimento" },
  { v: "declaracao_comparecimento", l: "Declaração de comparecimento" },
  { v: "outro", l: "Outro" },
];

const STATUS_FERIAS_LABEL: Record<string, string> = {
  pendente: "Pendente", a_gozar: "A gozar", agendado: "Agendado",
  em_gozo: "Em gozo", concluido: "Concluído", vencido: "Vencido",
};

export default function FeriasEquipe() {
  const { isGestor } = useAuth();
  const [loading, setLoading] = useState(true);
  const [membros, setMembros] = useState<Membro[]>([]);
  const [ferias, setFerias] = useState<Ferias[]>([]);
  const [afastamentos, setAfastamentos] = useState<Afastamento[]>([]);

  const [feriasForm, setFeriasForm] = useState<{
    open: boolean; id?: string; membro_id: string;
    periodo_aquisitivo_inicio: string; periodo_aquisitivo_fim: string;
    data_inicio: string; data_fim: string;
    dias_vendidos: string; status: string; observacao: string;
  }>({
    open: false, membro_id: "",
    periodo_aquisitivo_inicio: "", periodo_aquisitivo_fim: "",
    data_inicio: "", data_fim: "",
    dias_vendidos: "0", status: "a_gozar", observacao: "",
  });

  const [afastForm, setAfastForm] = useState<{
    open: boolean; id?: string; membro_id: string;
    tipo: string; data_inicio: string; data_fim: string;
    cid: string; observacao: string;
  }>({
    open: false, membro_id: "", tipo: "atestado_medico",
    data_inicio: "", data_fim: "", cid: "", observacao: "",
  });

  const carregar = async () => {
    setLoading(true);
    const [{ data: ms }, { data: fs }, { data: as }] = await Promise.all([
      supabase.from("equipe_membros").select("id,nome,cargo").eq("status", "ativo").order("nome"),
      supabase.from("gp_ferias").select("*").order("periodo_aquisitivo_inicio", { ascending: false }),
      supabase.from("gp_afastamentos").select("*").order("data_inicio", { ascending: false }),
    ]);
    setMembros((ms ?? []) as Membro[]);
    setFerias((fs ?? []) as Ferias[]);
    setAfastamentos((as ?? []) as Afastamento[]);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  const nomeMembro = (id: string) => membros.find((m) => m.id === id)?.nome ?? "—";
  const tipoLabel = (v: string) => TIPOS_AFASTAMENTO.find((t) => t.v === v)?.l ?? v;

  const feriasVencendo = useMemo(() => {
    const hoje = new Date();
    return ferias.filter((f) => {
      if (f.status === "concluido" || f.status === "em_gozo") return false;
      const fim = new Date(f.periodo_aquisitivo_fim);
      const dias = (fim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24);
      return dias <= 60;
    });
  }, [ferias]);

  const abrirNovaFerias = () => {
    const hoje = new Date();
    const ini = new Date(hoje); ini.setFullYear(ini.getFullYear() - 1);
    setFeriasForm({
      open: true, membro_id: membros[0]?.id ?? "",
      periodo_aquisitivo_inicio: ini.toISOString().slice(0, 10),
      periodo_aquisitivo_fim: hoje.toISOString().slice(0, 10),
      data_inicio: "", data_fim: "",
      dias_vendidos: "0", status: "a_gozar", observacao: "",
    });
  };

  const salvarFerias = async () => {
    const f = feriasForm;
    if (!f.membro_id) { toast.error("Selecione o membro"); return; }
    const dias_gozados = f.data_inicio && f.data_fim
      ? Math.round((new Date(f.data_fim).getTime() - new Date(f.data_inicio).getTime()) / (1000 * 60 * 60 * 24)) + 1
      : null;
    const payload = {
      membro_id: f.membro_id,
      periodo_aquisitivo_inicio: f.periodo_aquisitivo_inicio,
      periodo_aquisitivo_fim: f.periodo_aquisitivo_fim,
      data_inicio: f.data_inicio || null,
      data_fim: f.data_fim || null,
      dias_gozados,
      dias_vendidos: parseInt(f.dias_vendidos) || 0,
      status: f.status,
      observacao: f.observacao || null,
    };
    const { error } = f.id
      ? await supabase.from("gp_ferias").update(payload).eq("id", f.id)
      : await supabase.from("gp_ferias").insert(payload);
    if (error) { toast.error("Erro ao salvar", { description: error.message }); return; }
    toast.success("Férias salvas");
    setFeriasForm((p) => ({ ...p, open: false }));
    carregar();
  };

  const editarFerias = (f: Ferias) => {
    setFeriasForm({
      open: true, id: f.id, membro_id: f.membro_id,
      periodo_aquisitivo_inicio: f.periodo_aquisitivo_inicio,
      periodo_aquisitivo_fim: f.periodo_aquisitivo_fim,
      data_inicio: f.data_inicio ?? "", data_fim: f.data_fim ?? "",
      dias_vendidos: String(f.dias_vendidos),
      status: f.status, observacao: f.observacao ?? "",
    });
  };

  const abrirNovoAfastamento = () => {
    setAfastForm({
      open: true, membro_id: membros[0]?.id ?? "",
      tipo: "atestado_medico",
      data_inicio: new Date().toISOString().slice(0, 10),
      data_fim: "", cid: "", observacao: "",
    });
  };

  const salvarAfastamento = async () => {
    const f = afastForm;
    if (!f.membro_id || !f.data_inicio) { toast.error("Membro e data de início obrigatórios"); return; }
    const dias = f.data_fim
      ? Math.round((new Date(f.data_fim).getTime() - new Date(f.data_inicio).getTime()) / (1000 * 60 * 60 * 24)) + 1
      : null;
    const payload = {
      membro_id: f.membro_id, tipo: f.tipo,
      data_inicio: f.data_inicio, data_fim: f.data_fim || null,
      dias_afastamento: dias, cid: f.cid || null,
      observacao: f.observacao || null, status: "ativo",
    };
    const { error } = f.id
      ? await supabase.from("gp_afastamentos").update(payload).eq("id", f.id)
      : await supabase.from("gp_afastamentos").insert(payload);
    if (error) { toast.error("Erro ao salvar", { description: error.message }); return; }
    toast.success("Afastamento registrado");
    setAfastForm((p) => ({ ...p, open: false }));
    carregar();
  };

  if (!isGestor) {
    return (
      <div className="space-y-6">
        <PageHeader title="Minhas férias" description="Visualize seu período de férias e afastamentos" />
        <Card><CardContent className="py-10 text-center text-muted-foreground">
          Em breve: visualização do seu próprio histórico de férias.
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Férias e afastamentos" description="Gerencie períodos aquisitivos, gozo de férias e licenças">
        <Button variant="outline" onClick={abrirNovoAfastamento}>
          <Plus className="w-4 h-4" /> Afastamento
        </Button>
        <Button onClick={abrirNovaFerias}>
          <Plus className="w-4 h-4" /> Registrar férias
        </Button>
      </PageHeader>

      {feriasVencendo.length > 0 && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-warning mt-0.5" />
            <div>
              <p className="font-medium">{feriasVencendo.length} período(s) aquisitivo(s) vencendo nos próximos 60 dias</p>
              <p className="text-xs text-muted-foreground">
                {feriasVencendo.map((f) => nomeMembro(f.membro_id)).join(", ")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de férias */}
      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <Plane className="w-4 h-4 text-gold" />
            <h3 className="font-display text-lg">Férias</h3>
          </div>
          {loading ? (
            <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gold" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Membro</TableHead>
                  <TableHead>Período aquisitivo</TableHead>
                  <TableHead>Gozo</TableHead>
                  <TableHead className="text-right">Dias</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ferias.map((f) => (
                  <TableRow key={f.id} className="cursor-pointer" onClick={() => editarFerias(f)}>
                    <TableCell className="font-medium">{nomeMembro(f.membro_id)}</TableCell>
                    <TableCell className="text-sm">
                      {new Date(f.periodo_aquisitivo_inicio + "T00:00").toLocaleDateString("pt-BR")} →{" "}
                      {new Date(f.periodo_aquisitivo_fim + "T00:00").toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-sm">
                      {f.data_inicio
                        ? `${new Date(f.data_inicio + "T00:00").toLocaleDateString("pt-BR")} → ${
                            f.data_fim ? new Date(f.data_fim + "T00:00").toLocaleDateString("pt-BR") : "?"
                          }`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {f.dias_gozados ?? 0}/{f.dias_direito}
                      {f.dias_vendidos > 0 && <span className="text-muted-foreground"> (+{f.dias_vendidos} vendidos)</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        f.status === "em_gozo" ? "default" :
                        f.status === "vencido" ? "destructive" :
                        f.status === "concluido" ? "outline" : "secondary"
                      }>
                        {STATUS_FERIAS_LABEL[f.status] ?? f.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {!ferias.length && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                    Nenhum período de férias registrado.
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Lista de afastamentos */}
      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b">
            <h3 className="font-display text-lg">Afastamentos e licenças</h3>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Membro</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Período</TableHead>
                <TableHead className="text-right">Dias</TableHead>
                <TableHead>CID</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {afastamentos.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{nomeMembro(a.membro_id)}</TableCell>
                  <TableCell>{tipoLabel(a.tipo)}</TableCell>
                  <TableCell className="text-sm">
                    {new Date(a.data_inicio + "T00:00").toLocaleDateString("pt-BR")}
                    {a.data_fim ? ` → ${new Date(a.data_fim + "T00:00").toLocaleDateString("pt-BR")}` : " → em curso"}
                  </TableCell>
                  <TableCell className="text-right">{a.dias_afastamento ?? "—"}</TableCell>
                  <TableCell className="text-xs">{a.cid ?? "—"}</TableCell>
                  <TableCell><Badge variant={a.status === "ativo" ? "default" : "outline"}>{a.status}</Badge></TableCell>
                </TableRow>
              ))}
              {!afastamentos.length && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                  Nenhum afastamento registrado.
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal férias */}
      <Dialog open={feriasForm.open} onOpenChange={(open) => setFeriasForm((p) => ({ ...p, open }))}>
        <DialogContent>
          <DialogHeader><DialogTitle>{feriasForm.id ? "Editar férias" : "Registrar férias"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label>Membro</Label>
              <Select value={feriasForm.membro_id} onValueChange={(v) => setFeriasForm((p) => ({ ...p, membro_id: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{membros.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Período aquisitivo — início</Label>
              <Input type="date" value={feriasForm.periodo_aquisitivo_inicio} onChange={(e) => setFeriasForm((p) => ({ ...p, periodo_aquisitivo_inicio: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Período aquisitivo — fim</Label>
              <Input type="date" value={feriasForm.periodo_aquisitivo_fim} onChange={(e) => setFeriasForm((p) => ({ ...p, periodo_aquisitivo_fim: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Início do gozo</Label>
              <Input type="date" value={feriasForm.data_inicio} onChange={(e) => setFeriasForm((p) => ({ ...p, data_inicio: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Fim do gozo</Label>
              <Input type="date" value={feriasForm.data_fim} onChange={(e) => setFeriasForm((p) => ({ ...p, data_fim: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Dias vendidos (abono)</Label>
              <Input type="number" min={0} max={10} value={feriasForm.dias_vendidos} onChange={(e) => setFeriasForm((p) => ({ ...p, dias_vendidos: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={feriasForm.status} onValueChange={(v) => setFeriasForm((p) => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_FERIAS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Observação</Label>
              <Textarea rows={2} value={feriasForm.observacao} onChange={(e) => setFeriasForm((p) => ({ ...p, observacao: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFeriasForm((p) => ({ ...p, open: false }))}>Cancelar</Button>
            <Button onClick={salvarFerias}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal afastamento */}
      <Dialog open={afastForm.open} onOpenChange={(open) => setAfastForm((p) => ({ ...p, open }))}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar afastamento</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label>Membro</Label>
              <Select value={afastForm.membro_id} onValueChange={(v) => setAfastForm((p) => ({ ...p, membro_id: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{membros.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Tipo</Label>
              <Select value={afastForm.tipo} onValueChange={(v) => setAfastForm((p) => ({ ...p, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS_AFASTAMENTO.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Início</Label>
              <Input type="date" value={afastForm.data_inicio} onChange={(e) => setAfastForm((p) => ({ ...p, data_inicio: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Fim (opcional)</Label>
              <Input type="date" value={afastForm.data_fim} onChange={(e) => setAfastForm((p) => ({ ...p, data_fim: e.target.value }))} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>CID (atestado)</Label>
              <Input value={afastForm.cid} onChange={(e) => setAfastForm((p) => ({ ...p, cid: e.target.value }))} placeholder="Ex: M54.5" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Observação</Label>
              <Textarea rows={2} value={afastForm.observacao} onChange={(e) => setAfastForm((p) => ({ ...p, observacao: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAfastForm((p) => ({ ...p, open: false }))}>Cancelar</Button>
            <Button onClick={salvarAfastamento}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
