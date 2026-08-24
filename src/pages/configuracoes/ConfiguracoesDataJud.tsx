import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ArrowLeft, LifeBuoy, Loader2, Play, Plus, Pencil } from "lucide-react";
import { DataJudErrorBanner } from "@/components/DataJudErrorBanner";
import { formatDateTime } from "@/lib/format";
import type { DataJudRegra, DataJudLog } from "@/pages/processos/types";
import { toast } from "sonner";

const ACOES: { v: DataJudRegra["acao"]; l: string }[] = [
  { v: "nenhuma", l: "Não fazer nada (só registrar)" },
  { v: "notificar", l: "Notificar responsável" },
  { v: "criar_tarefa", l: "Criar tarefa na controladoria" },
  { v: "criar_prazo", l: "Criar prazo fatal" },
  { v: "disparar_fluxo", l: "Disparar fluxo automático" },
];

export default function ConfiguracoesDataJud() {
  const { profile } = useAuth();
  const [regras, setRegras] = useState<DataJudRegra[]>([]);
  const [logs, setLogs] = useState<DataJudLog[]>([]);
  const [fluxos, setFluxos] = useState<{ id: string; nome: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [executando, setExecutando] = useState(false);
  const [editando, setEditando] = useState<DataJudRegra | null>(null);
  const [datajudErro, setDatajudErro] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<DataJudRegra>>({});

  const load = async () => {
    setLoading(true);
    const [{ data: r }, { data: l }, { data: f }] = await Promise.all([
      supabase.from("datajud_regras_acao").select("*").order("codigo_movimento"),
      supabase.from("datajud_log_execucoes").select("*").order("iniciado_em", { ascending: false }).limit(20),
      supabase.from("fluxos_templates").select("id, nome").eq("ativo", true).order("nome"),
    ]);
    setRegras((r ?? []) as any);
    setLogs((l ?? []) as any);
    setFluxos((f ?? []) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleExecutarAgora = async () => {
    setExecutando(true);
    setDatajudErro(null);
    try {
      const { data, error } = await supabase.functions.invoke("datajud-consulta", {
        body: { modo: "manual" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Job executado", {
        description: `${data.consultados} processos · ${data.novos_andamentos} andamentos · ${data.acoes_geradas} ações`,
      });
      load();
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      setDatajudErro(msg);
      toast.error("Erro ao executar", { description: msg });
    } finally {
      setExecutando(false);
    }
  };

  const openEditar = (r: DataJudRegra) => {
    setEditando(r);
    setForm({ ...r });
  };

  const openNova = () => {
    setEditando({ id: "_new" } as any);
    setForm({
      codigo_movimento: 0,
      nome_movimento: "",
      acao: "notificar",
      prazo_tipo: "uteis",
      prioridade: "alta",
      ativo: true,
    });
  };

  const salvarRegra = async () => {
    if (!form.codigo_movimento || !form.nome_movimento || !form.acao) {
      toast.error("Preencha código, nome e ação");
      return;
    }
    const payload: any = {
      codigo_movimento: form.codigo_movimento,
      nome_movimento: form.nome_movimento,
      acao: form.acao,
      prazo_dias: form.acao === "criar_prazo" ? (form.prazo_dias ?? null) : null,
      prazo_tipo: form.prazo_tipo ?? "uteis",
      fluxo_template_id: form.acao === "disparar_fluxo" ? (form.fluxo_template_id ?? null) : null,
      titulo_tarefa: form.titulo_tarefa ?? null,
      prioridade: form.prioridade ?? "alta",
      ativo: form.ativo ?? true,
    };
    let error;
    if (editando?.id === "_new") {
      ({ error } = await supabase.from("datajud_regras_acao").insert(payload));
    } else {
      ({ error } = await supabase.from("datajud_regras_acao").update(payload).eq("id", editando!.id));
    }
    if (error) return toast.error("Erro ao salvar", { description: error.message });
    toast.success("Regra salva");
    setEditando(null);
    load();
  };

  if (!profile || loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Configuração DataJud" description="Regras de ação por código TPU e histórico do job">
        <Button variant="outline" asChild><Link to="/configuracoes"><ArrowLeft className="w-4 h-4" /> Voltar</Link></Button>
        <Button variant="outline" asChild>
          <Link to="/configuracoes/datajud/troubleshooting">
            <LifeBuoy className="w-4 h-4" /> Troubleshooting
          </Link>
        </Button>
        <Button variant="gold" onClick={handleExecutarAgora} disabled={executando}>
          {executando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Executar agora
        </Button>
      </PageHeader>

      {datajudErro && (
        <DataJudErrorBanner message={datajudErro} onRetry={handleExecutarAgora} retrying={executando} />
      )}

      {/* Status do job */}
      <Card className="p-5">
        <h3 className="font-display text-xl mb-4">Última execução</h3>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma execução ainda. Clique em "Executar agora" para começar.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <div className="text-xs text-muted-foreground uppercase">Quando</div>
              <div className="text-sm font-medium">{formatDateTime(logs[0].iniciado_em)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase">Modo</div>
              <Badge variant="secondary" className="capitalize">{logs[0].modo}</Badge>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase">Consultados</div>
              <div className="text-2xl font-display">{logs[0].total_consultados}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase">Andamentos novos</div>
              <div className="text-2xl font-display text-success">{logs[0].total_andamentos_novos}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase">Erros</div>
              <div className={`text-2xl font-display ${logs[0].total_erros > 0 ? "text-destructive" : ""}`}>{logs[0].total_erros}</div>
            </div>
          </div>
        )}
      </Card>

      {/* Regras */}
      <Card>
        <div className="p-5 flex justify-between items-center border-b border-border">
          <div>
            <h3 className="font-display text-xl">Regras por código TPU</h3>
            <p className="text-sm text-muted-foreground">Define o que acontece quando o DataJud importa cada tipo de movimento.</p>
          </div>
          <Button variant="outline" onClick={openNova}><Plus className="w-4 h-4" /> Nova regra</Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">TPU</TableHead>
              <TableHead>Movimento</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Prazo</TableHead>
              <TableHead>Prioridade</TableHead>
              <TableHead>Ativa</TableHead>
              <TableHead className="text-right">Editar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {regras.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.codigo_movimento}</TableCell>
                <TableCell className="font-medium">{r.nome_movimento}</TableCell>
                <TableCell><Badge variant="outline">{ACOES.find((a) => a.v === r.acao)?.l ?? r.acao}</Badge></TableCell>
                <TableCell className="text-sm">{r.prazo_dias ? `${r.prazo_dias} dias ${r.prazo_tipo}` : "—"}</TableCell>
                <TableCell><Badge variant="secondary" className="capitalize">{r.prioridade}</Badge></TableCell>
                <TableCell>{r.ativo ? <Badge className="bg-success/10 text-success border-success/30">Sim</Badge> : <Badge variant="outline">Não</Badge>}</TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => openEditar(r)}><Pencil className="w-4 h-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Histórico */}
      <Card>
        <div className="p-5 border-b border-border">
          <h3 className="font-display text-xl">Histórico de execuções</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Início</TableHead>
              <TableHead>Modo</TableHead>
              <TableHead>Consultados</TableHead>
              <TableHead>Novos</TableHead>
              <TableHead>Ações</TableHead>
              <TableHead>Erros</TableHead>
              <TableHead>Duração</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Sem execuções registradas.</TableCell></TableRow>
            ) : logs.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="text-sm">{formatDateTime(l.iniciado_em)}</TableCell>
                <TableCell><Badge variant="secondary" className="capitalize">{l.modo}</Badge></TableCell>
                <TableCell className="font-medium">{l.total_consultados}</TableCell>
                <TableCell className="text-success">{l.total_andamentos_novos}</TableCell>
                <TableCell>{l.total_acoes_geradas}</TableCell>
                <TableCell className={l.total_erros > 0 ? "text-destructive font-medium" : ""}>{l.total_erros}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{l.duracao_ms ? `${(l.duracao_ms / 1000).toFixed(1)}s` : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Modal editar regra */}
      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{editando?.id === "_new" ? "Nova regra" : "Editar regra"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Código TPU *</Label>
                <Input
                  type="number"
                  value={form.codigo_movimento ?? ""}
                  onChange={(e) => setForm({ ...form, codigo_movimento: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Prioridade</Label>
                <Select value={form.prioridade} onValueChange={(v: any) => setForm({ ...form, prioridade: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">Baixa</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Nome do movimento *</Label>
              <Input value={form.nome_movimento ?? ""} onChange={(e) => setForm({ ...form, nome_movimento: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Ação *</Label>
              <Select value={form.acao} onValueChange={(v: any) => setForm({ ...form, acao: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ACOES.map((a) => <SelectItem key={a.v} value={a.v}>{a.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {form.acao === "criar_prazo" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Dias de prazo</Label>
                  <Input type="number" value={form.prazo_dias ?? ""} onChange={(e) => setForm({ ...form, prazo_dias: parseInt(e.target.value) || null })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo</Label>
                  <Select value={form.prazo_tipo} onValueChange={(v: any) => setForm({ ...form, prazo_tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="uteis">Dias úteis</SelectItem>
                      <SelectItem value="corridos">Dias corridos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            {form.acao === "disparar_fluxo" && (
              <div className="space-y-1.5">
                <Label>Fluxo template</Label>
                <Select value={form.fluxo_template_id ?? ""} onValueChange={(v) => setForm({ ...form, fluxo_template_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{fluxos.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {(form.acao === "criar_tarefa" || form.acao === "criar_prazo") && (
              <div className="space-y-1.5">
                <Label>Título da tarefa/prazo</Label>
                <Input
                  value={form.titulo_tarefa ?? ""}
                  onChange={(e) => setForm({ ...form, titulo_tarefa: e.target.value })}
                  placeholder="Use {{numero_processo}}, {{cliente}}, {{data}}"
                />
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.ativo ?? true} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} className="rounded border-border" />
              Regra ativa
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button variant="gold" onClick={salvarRegra}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
