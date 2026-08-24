import { useEffect, useState } from "react";
import { useOutletContext, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  UserPlus, Briefcase, MessageSquarePlus, Paperclip, Loader2,
  Clock, CheckCircle2, XCircle, Ban,
} from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import type { PortalParceiroContext } from "../PortalParceiroLayout";

type Tipo = "cliente" | "processo" | "andamento" | "documento";
type StatusSub = "pendente" | "aprovado" | "rejeitado" | "cancelado";

interface Submissao {
  id: string;
  tipo: Tipo;
  status: StatusSub;
  titulo: string;
  payload: any;
  motivo_rejeicao: string | null;
  criado_em: string;
  revisado_em: string | null;
}

interface ProcessoMin { id: string; numero_cnj: string | null; }

const TIPO_LABEL: Record<Tipo, string> = {
  cliente: "Cliente",
  processo: "Processo",
  andamento: "Andamento",
  documento: "Documento",
};

const STATUS_BADGE: Record<StatusSub, { label: string; className: string; Icon: any }> = {
  pendente: { label: "Pendente", className: "bg-amber-500/15 text-amber-700 border-amber-300", Icon: Clock },
  aprovado: { label: "Aprovado", className: "bg-emerald-500/15 text-emerald-700 border-emerald-300", Icon: CheckCircle2 },
  rejeitado: { label: "Rejeitado", className: "bg-destructive/15 text-destructive border-destructive/30", Icon: XCircle },
  cancelado: { label: "Cancelado", className: "bg-muted text-muted-foreground border-border", Icon: Ban },
};

export default function IndicacoesParceiro() {
  const { parceiro } = useOutletContext<PortalParceiroContext>();
  const location = useLocation();
  const [lista, setLista] = useState<Submissao[]>([]);
  const [processos, setProcessos] = useState<ProcessoMin[]>([]);
  const [loading, setLoading] = useState(true);
  const [aberto, setAberto] = useState<Tipo | null>(null);

  // Abrir dialog automaticamente quando navegado de outras páginas via state.abrir
  useEffect(() => {
    const abrir = (location.state as { abrir?: Tipo } | null)?.abrir;
    if (abrir && ["cliente", "processo", "andamento", "documento"].includes(abrir)) {
      setAberto(abrir);
    }
  }, [location.state]);

  async function carregar() {
    setLoading(true);
    const [{ data: subs }, { data: procs }] = await Promise.all([
      supabase
        .from("parceiro_submissoes")
        .select("id, tipo, status, titulo, payload, motivo_rejeicao, criado_em, revisado_em")
        .order("criado_em", { ascending: false })
        .limit(50),
      supabase
        .from("processo_parceiros")
        .select("processo_id, processos(id, numero_cnj)")
        .eq("parceiro_id", parceiro.id),
    ]);
    setLista((subs as Submissao[]) ?? []);
    const procsList: ProcessoMin[] = ((procs as any[]) ?? [])
      .map((r) => r.processos)
      .filter(Boolean);
    setProcessos(procsList);
    setLoading(false);
  }

  useEffect(() => { carregar(); }, [parceiro.id]);

  async function cancelar(id: string) {
    const { error } = await supabase
      .from("parceiro_submissoes")
      .update({ status: "cancelado" })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Indicação cancelada");
    carregar();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Minhas indicações"
        description="Cadastre clientes, processos, andamentos e documentos. O escritório revisa e aprova."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <BotaoTipo Icon={UserPlus} label="Indicar cliente" onClick={() => setAberto("cliente")} />
        <BotaoTipo Icon={Briefcase} label="Indicar processo" onClick={() => setAberto("processo")} />
        <BotaoTipo Icon={MessageSquarePlus} label="Novo andamento" onClick={() => setAberto("andamento")} />
        <BotaoTipo Icon={Paperclip} label="Enviar documento" onClick={() => setAberto("documento")} />
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg">Histórico</h2>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </div>
        {!loading && lista.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Você ainda não enviou nenhuma indicação.
          </p>
        )}
        <div className="space-y-2">
          {lista.map((s) => {
            const meta = STATUS_BADGE[s.status];
            const Icon = meta.Icon;
            return (
              <div key={s.id} className="flex items-start justify-between gap-3 p-3 rounded-md border border-border bg-card hover:bg-accent/30 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">{TIPO_LABEL[s.tipo]}</Badge>
                    <span className="font-medium text-sm truncate">{s.titulo}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Enviado em {formatDate(s.criado_em)}
                    {s.revisado_em && ` · Revisado em ${formatDate(s.revisado_em)}`}
                  </p>
                  {s.status === "rejeitado" && s.motivo_rejeicao && (
                    <p className="text-xs text-destructive mt-1">Motivo: {s.motivo_rejeicao}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge className={`${meta.className} border gap-1`}>
                    <Icon className="w-3 h-3" /> {meta.label}
                  </Badge>
                  {s.status === "pendente" && (
                    <Button variant="ghost" size="sm" onClick={() => cancelar(s.id)}>
                      Cancelar
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {aberto && (
        <DialogIndicacao
          tipo={aberto}
          parceiroId={parceiro.id}
          processos={processos}
          onClose={(salvou) => { setAberto(null); if (salvou) carregar(); }}
        />
      )}
    </div>
  );
}

function BotaoTipo({ Icon, label, onClick }: { Icon: any; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-center gap-2 p-4 rounded-lg border border-border bg-card hover:bg-accent/40 hover:border-gold/40 transition-all"
    >
      <div className="w-10 h-10 rounded-full bg-gold/10 flex items-center justify-center group-hover:bg-gold/20 transition-colors">
        <Icon className="w-5 h-5 text-gold" />
      </div>
      <span className="text-xs sm:text-sm font-medium text-center">{label}</span>
    </button>
  );
}

function DialogIndicacao({
  tipo, parceiroId, processos, onClose,
}: {
  tipo: Tipo;
  parceiroId: string;
  processos: ProcessoMin[];
  onClose: (salvou: boolean) => void;
}) {
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [arquivo, setArquivo] = useState<File | null>(null);

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function salvar() {
    setSalvando(true);
    try {
      let titulo = "";
      let payload: Record<string, any> = {};
      let processo_id: string | null = null;

      if (tipo === "cliente") {
        if (!form.nome?.trim()) throw new Error("Informe o nome do cliente");
        titulo = form.nome;
        payload = {
          nome: form.nome,
          cpf_cnpj: form.cpf_cnpj || null,
          whatsapp: form.whatsapp || null,
          email: form.email || null,
          cidade: form.cidade || null,
          estado: form.estado || null,
          tipo_pessoa: form.tipo_pessoa || "fisica",
          observacoes: form.observacoes || null,
        };
      } else if (tipo === "processo") {
        if (!form.descricao?.trim()) throw new Error("Descreva o caso");
        titulo = form.numero_cnj?.trim() || `Caso — ${form.descricao.slice(0, 40)}`;
        payload = {
          numero_cnj: form.numero_cnj || null,
          area_direito: form.area_direito || null,
          comarca: form.comarca || null,
          vara: form.vara || null,
          tipo: form.tipo_proc || "judicial",
          descricao: form.descricao,
          cliente_nome: form.cliente_nome || null,
        };
      } else if (tipo === "andamento") {
        if (!form.processo_id) throw new Error("Selecione um processo");
        if (!form.descricao?.trim()) throw new Error("Descreva o andamento");
        processo_id = form.processo_id;
        const proc = processos.find((p) => p.id === processo_id);
        titulo = `Andamento — ${proc?.numero_cnj ?? "processo"}`;
        payload = { descricao: form.descricao, data: form.data || null };
      } else if (tipo === "documento") {
        if (!form.processo_id) throw new Error("Selecione um processo");
        if (!arquivo) throw new Error("Anexe um arquivo");
        processo_id = form.processo_id;
        const path = `parceiro/${parceiroId}/${Date.now()}-${arquivo.name}`;
        const { error: upErr } = await supabase.storage
          .from("documentos")
          .upload(path, arquivo, { upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("documentos").getPublicUrl(path);
        titulo = form.titulo || arquivo.name;
        payload = {
          arquivo_path: path,
          arquivo_url: pub.publicUrl,
          arquivo_nome: arquivo.name,
          observacoes: form.observacoes || null,
        };
      }

      const { error } = await supabase.from("parceiro_submissoes").insert({
        parceiro_id: parceiroId,
        tipo,
        titulo,
        payload,
        processo_id,
        observacoes_parceiro: form.observacoes || null,
      });
      if (error) throw error;
      toast.success("Indicação enviada para aprovação");
      onClose(true);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao enviar");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova indicação · {TIPO_LABEL[tipo]}</DialogTitle>
          <DialogDescription>
            Os dados serão revisados pelo escritório antes de virarem registro oficial.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {tipo === "cliente" && (
            <>
              <Campo label="Nome completo *">
                <Input value={form.nome ?? ""} onChange={(e) => set("nome", e.target.value)} />
              </Campo>
              <div className="grid grid-cols-2 gap-3">
                <Campo label="CPF/CNPJ">
                  <Input value={form.cpf_cnpj ?? ""} onChange={(e) => set("cpf_cnpj", e.target.value)} />
                </Campo>
                <Campo label="WhatsApp">
                  <Input value={form.whatsapp ?? ""} onChange={(e) => set("whatsapp", e.target.value)} />
                </Campo>
              </div>
              <Campo label="E-mail">
                <Input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
              </Campo>
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Cidade">
                  <Input value={form.cidade ?? ""} onChange={(e) => set("cidade", e.target.value)} />
                </Campo>
                <Campo label="Estado (UF)">
                  <Input maxLength={2} value={form.estado ?? ""} onChange={(e) => set("estado", e.target.value.toUpperCase())} />
                </Campo>
              </div>
              <Campo label="Observações">
                <Textarea rows={3} value={form.observacoes ?? ""} onChange={(e) => set("observacoes", e.target.value)} />
              </Campo>
            </>
          )}

          {tipo === "processo" && (
            <>
              <Campo label="Cliente envolvido">
                <Input
                  placeholder="Nome do cliente (se já existir, o escritório vinculará)"
                  value={form.cliente_nome ?? ""}
                  onChange={(e) => set("cliente_nome", e.target.value)}
                />
              </Campo>
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Número CNJ">
                  <Input value={form.numero_cnj ?? ""} onChange={(e) => set("numero_cnj", e.target.value)} />
                </Campo>
                <Campo label="Tipo">
                  <Select value={form.tipo_proc ?? "judicial"} onValueChange={(v) => set("tipo_proc", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="judicial">Judicial</SelectItem>
                      <SelectItem value="administrativo">Administrativo</SelectItem>
                    </SelectContent>
                  </Select>
                </Campo>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Área do direito">
                  <Input value={form.area_direito ?? ""} onChange={(e) => set("area_direito", e.target.value)} />
                </Campo>
                <Campo label="Comarca">
                  <Input value={form.comarca ?? ""} onChange={(e) => set("comarca", e.target.value)} />
                </Campo>
              </div>
              <Campo label="Vara">
                <Input value={form.vara ?? ""} onChange={(e) => set("vara", e.target.value)} />
              </Campo>
              <Campo label="Descrição do caso *">
                <Textarea rows={4} value={form.descricao ?? ""} onChange={(e) => set("descricao", e.target.value)} />
              </Campo>
            </>
          )}

          {tipo === "andamento" && (
            <>
              <Campo label="Processo *">
                <SelectProcesso processos={processos} value={form.processo_id} onChange={(v) => set("processo_id", v)} />
              </Campo>
              <Campo label="Data">
                <Input type="date" value={form.data ?? ""} onChange={(e) => set("data", e.target.value)} />
              </Campo>
              <Campo label="Descrição *">
                <Textarea rows={4} value={form.descricao ?? ""} onChange={(e) => set("descricao", e.target.value)} />
              </Campo>
            </>
          )}

          {tipo === "documento" && (
            <>
              <Campo label="Processo *">
                <SelectProcesso processos={processos} value={form.processo_id} onChange={(v) => set("processo_id", v)} />
              </Campo>
              <Campo label="Título">
                <Input value={form.titulo ?? ""} onChange={(e) => set("titulo", e.target.value)} />
              </Campo>
              <Campo label="Arquivo *">
                <Input type="file" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
              </Campo>
              <Campo label="Observações">
                <Textarea rows={3} value={form.observacoes ?? ""} onChange={(e) => set("observacoes", e.target.value)} />
              </Campo>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Enviar para aprovação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function SelectProcesso({
  processos, value, onChange,
}: {
  processos: ProcessoMin[];
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  if (processos.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-2">
        Você ainda não tem processos vinculados. Indique primeiro um processo para depois enviar andamentos/documentos.
      </p>
    );
  }
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
      <SelectContent>
        {processos.map((p) => (
          <SelectItem key={p.id} value={p.id}>{p.numero_cnj ?? p.id.slice(0, 8)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
