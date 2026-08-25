import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Pencil, Search, Upload, XCircle, AlertTriangle, Users, Scale } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { validarCNJ } from "@/lib/datajud";

type Registro = {
  id: string;
  linha_origem: number;
  nome: string;
  area: string | null;
  servico_demanda: string | null;
  status_origem: string | null;
  numero_processo: string | null;
  responsavel: string | null;
  prioridade: string | null;
  proxima_acao: string | null;
  observacoes: string | null;
  caminho_pasta: string | null;
  situacao_validacao: string;
  alertas: string[];
  cliente_criado_id: string | null;
  processo_criado_id: string | null;
};

type Auditoria = {
  clientes_total: number; clientes_sem_documento: number; clientes_sem_email: number; clientes_sem_whatsapp: number;
  processos_total: number; judiciais_sem_cnj: number; processos_sem_responsavel: number;
  migracao_total: number; migracao_revisar: number; migracao_prontos: number; migracao_importados: number;
};

const labels: Record<string, string> = {
  pendente: "Pendente", revisar: "Revisar", pronto: "Pronto",
  ignorado: "Ignorado", importado: "Importado", erro: "Erro",
};

export default function MigracaoClientesProcessos() {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [status, setStatus] = useState("revisar");
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState<string | null>(null);
  const [editando, setEditando] = useState<Registro | null>(null);
  const [auditoria, setAuditoria] = useState<Auditoria | null>(null);
  const [importandoLote, setImportandoLote] = useState(false);

  async function carregar() {
    setLoading(true);
    let q = (supabase as any).from("migracao_clientes_processos").select("*").order("linha_origem").limit(500);
    if (status !== "todos") q = q.eq("situacao_validacao", status);
    const [{ data, error }, auditRes] = await Promise.all([
      q,
      (supabase as any).rpc("auditar_base_clientes_processos"),
    ]);
    if (error) toast.error(error.message);
    setRegistros(data ?? []);
    if (!auditRes.error && !auditRes.data?.erro) setAuditoria(auditRes.data as Auditoria);
    setLoading(false);
  }

  useEffect(() => { carregar(); }, [status]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    if (!termo) return registros;
    return registros.filter(r =>
      [r.nome, r.area, r.servico_demanda, r.numero_processo, r.responsavel]
        .some(v => String(v ?? "").toLocaleLowerCase("pt-BR").includes(termo))
    );
  }, [registros, busca]);

  async function salvarRevisao(situacao: "revisar" | "pronto" | "ignorado") {
    if (!editando) return;
    if (!editando.nome.trim()) return toast.error("O nome é obrigatório");
    if (situacao === "pronto" && editando.numero_processo && !validarCNJ(editando.numero_processo)) {
      return toast.error("Revise o número CNJ antes de aprovar este registro");
    }
    const { error } = await (supabase as any).from("migracao_clientes_processos").update({
      nome: editando.nome.trim(),
      area: editando.area || null,
      servico_demanda: editando.servico_demanda || null,
      status_origem: editando.status_origem || null,
      numero_processo: editando.numero_processo || null,
      responsavel: editando.responsavel || null,
      prioridade: editando.prioridade || null,
      proxima_acao: editando.proxima_acao || null,
      observacoes: editando.observacoes || null,
      situacao_validacao: situacao,
      revisado_em: new Date().toISOString(),
    }).eq("id", editando.id);
    if (error) return toast.error(error.message);
    toast.success(situacao === "pronto" ? "Registro aprovado para importação" : situacao === "ignorado" ? "Registro ignorado" : "Revisão salva");
    setEditando(null);
    carregar();
  }

  async function importar(r: Registro) {
    if (!confirm(`Importar "${r.nome}" para o cadastro oficial?`)) return;
    setProcessando(r.id);
    const { data, error } = await (supabase as any).rpc("importar_registro_migracao", { p_registro_id: r.id });
    setProcessando(null);
    if (error) return toast.error(error.message);
    toast.success(data?.processo_id ? "Cliente e processo importados" : "Cliente importado; processo não criado por falta de número CNJ válido");
    carregar();
  }

  async function importarProntos() {
    const { data: prontos, error } = await (supabase as any).from("migracao_clientes_processos")
      .select("id,nome").eq("situacao_validacao", "pronto").order("linha_origem").limit(500);
    if (error) return toast.error(error.message);
    if (!prontos?.length) return toast.info("Nenhum registro aprovado aguardando importação");
    if (!confirm(`Importar ${prontos.length} registro(s) aprovados para a base oficial?`)) return;
    setImportandoLote(true);
    let ok = 0, falhas = 0;
    for (const item of prontos) {
      const res = await (supabase as any).rpc("importar_registro_migracao", { p_registro_id: item.id });
      res.error ? falhas++ : ok++;
    }
    setImportandoLote(false);
    falhas ? toast.warning(`${ok} importados e ${falhas} com erro`) : toast.success(`${ok} registros importados com segurança`);
    carregar();
  }

  const counts = useMemo(() => registros.reduce((a, r) => {
    a[r.situacao_validacao] = (a[r.situacao_validacao] || 0) + 1;
    return a;
  }, {} as Record<string, number>), [registros]);

  return (
    <div className="space-y-6">
      <PageHeader title="Migração de clientes e processos" description="Revise os dados da planilha antes de levá-los ao cadastro oficial">
        <Button asChild variant="outline"><Link to="/importacao-exportacao"><ArrowLeft className="w-4 h-4" /> Voltar</Link></Button>
        <Button variant="gold" onClick={importarProntos} disabled={importandoLote || !auditoria?.migracao_prontos}>
          {importandoLote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Importar aprovados ({auditoria?.migracao_prontos ?? 0})
        </Button>
      </PageHeader>

      {auditoria && <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4"><div className="flex items-center gap-2 text-xs uppercase text-muted-foreground"><Users className="w-4 h-4" /> Clientes oficiais</div><p className="font-display text-2xl mt-1">{auditoria.clientes_total}</p><p className="text-xs text-muted-foreground">{auditoria.clientes_sem_documento} sem documento · {auditoria.clientes_sem_whatsapp} sem WhatsApp</p></Card>
        <Card className="p-4"><div className="flex items-center gap-2 text-xs uppercase text-muted-foreground"><Scale className="w-4 h-4" /> Processos oficiais</div><p className="font-display text-2xl mt-1">{auditoria.processos_total}</p><p className="text-xs text-muted-foreground">{auditoria.judiciais_sem_cnj} judiciais sem CNJ · {auditoria.processos_sem_responsavel} sem responsável</p></Card>
        <Card className="p-4"><div className="flex items-center gap-2 text-xs uppercase text-muted-foreground"><AlertTriangle className="w-4 h-4 text-amber-600" /> A revisar</div><p className="font-display text-2xl mt-1">{auditoria.migracao_revisar}</p><p className="text-xs text-muted-foreground">permanecem fora da base oficial</p></Card>
        <Card className="p-4"><div className="flex items-center gap-2 text-xs uppercase text-muted-foreground"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Aprovados / importados</div><p className="font-display text-2xl mt-1">{auditoria.migracao_prontos} / {auditoria.migracao_importados}</p><p className="text-xs text-muted-foreground">prontos para importar / concluídos</p></Card>
      </div>}

      <Card className="p-4 border-amber-200 bg-amber-50/60">
        <p className="font-medium">Importação protegida</p>
        <p className="text-sm text-muted-foreground mt-1">Registros marcados como “A confirmar” permanecem em revisão. Somente itens aprovados podem ser importados.</p>
      </Card>

      <div className="flex flex-wrap gap-3 items-end">
        <div><Label className="text-xs">Situação</Label><Select value={status} onValueChange={setStatus}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem><SelectItem value="revisar">Revisar</SelectItem><SelectItem value="pronto">Prontos</SelectItem><SelectItem value="importado">Importados</SelectItem><SelectItem value="ignorado">Ignorados</SelectItem></SelectContent></Select></div>
        <div className="relative flex-1 min-w-64"><Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" /><Input className="pl-9" placeholder="Buscar nome, área, processo ou responsável" value={busca} onChange={e => setBusca(e.target.value)} /></div>
        <Badge variant="outline">{visiveis.length} registros</Badge>
      </div>

      <Card className="overflow-hidden">
        {loading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" /></div> : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Linha</TableHead><TableHead>Cliente</TableHead><TableHead>Área / demanda</TableHead><TableHead>Processo</TableHead><TableHead>Alertas</TableHead><TableHead>Situação</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>{visiveis.map(r => (
                <TableRow key={r.id}>
                  <TableCell>{r.linha_origem}</TableCell>
                  <TableCell><div className="font-medium">{r.nome}</div><div className="text-xs text-muted-foreground">{r.responsavel || "Responsável não definido"}</div></TableCell>
                  <TableCell><div>{r.area || "—"}</div><div className="text-xs text-muted-foreground">{r.servico_demanda || "Demanda não confirmada"}</div></TableCell>
                  <TableCell className="font-mono text-xs">{r.numero_processo || "A confirmar"}</TableCell>
                  <TableCell>{(r.alertas || []).slice(0, 2).map(a => <div key={a} className="text-xs text-amber-700">{a}</div>)}</TableCell>
                  <TableCell><Badge variant="outline">{labels[r.situacao_validacao] || r.situacao_validacao}</Badge></TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {!["importado", "ignorado"].includes(r.situacao_validacao) && <Button size="icon" variant="ghost" onClick={() => setEditando({ ...r })}><Pencil className="w-4 h-4" /></Button>}
                    {r.situacao_validacao === "pronto" && <Button size="sm" variant="gold" disabled={processando === r.id} onClick={() => importar(r)}>{processando === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Importar</Button>}
                    {r.situacao_validacao === "importado" && <CheckCircle2 className="inline w-5 h-5 text-emerald-600" />}
                  </TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Dialog open={!!editando} onOpenChange={o => !o && setEditando(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Revisar registro da planilha</DialogTitle></DialogHeader>
          {editando && <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><Label>Nome *</Label><Input value={editando.nome} onChange={e => setEditando({ ...editando, nome: e.target.value })} /></div>
            <div><Label>Área</Label><Input value={editando.area || ""} onChange={e => setEditando({ ...editando, area: e.target.value })} /></div>
            <div><Label>Serviço / demanda</Label><Input value={editando.servico_demanda || ""} onChange={e => setEditando({ ...editando, servico_demanda: e.target.value })} /></div>
            <div><Label>Status</Label><Input value={editando.status_origem || ""} onChange={e => setEditando({ ...editando, status_origem: e.target.value })} /></div>
            <div><Label>Número do processo</Label><Input value={editando.numero_processo || ""} onChange={e => setEditando({ ...editando, numero_processo: e.target.value })} /></div>
            <div><Label>Responsável</Label><Input value={editando.responsavel || ""} onChange={e => setEditando({ ...editando, responsavel: e.target.value })} /></div>
            <div><Label>Prioridade</Label><Input value={editando.prioridade || ""} onChange={e => setEditando({ ...editando, prioridade: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>Próxima ação</Label><Textarea value={editando.proxima_acao || ""} onChange={e => setEditando({ ...editando, proxima_acao: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>Observações</Label><Textarea value={editando.observacoes || ""} onChange={e => setEditando({ ...editando, observacoes: e.target.value })} /></div>
          </div>}
          <DialogFooter className="flex-wrap">
            <Button variant="ghost" onClick={() => salvarRevisao("ignorado")}><XCircle className="w-4 h-4" /> Ignorar</Button>
            <Button variant="outline" onClick={() => salvarRevisao("revisar")}>Salvar revisão</Button>
            <Button variant="gold" onClick={() => salvarRevisao("pronto")}><CheckCircle2 className="w-4 h-4" /> Aprovar para importar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
