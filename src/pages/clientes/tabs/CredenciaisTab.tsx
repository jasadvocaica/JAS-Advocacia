import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { KeyRound, Plus, Eye, EyeOff, Copy, Pencil, Trash2, ExternalLink, ShieldAlert, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";

interface Credencial {
  id: string;
  cliente_id: string;
  sistema: string;
  tipo: string;
  identificador: string | null;
  senha_cifrada: string;
  url: string | null;
  observacoes: string | null;
  ultima_atualizacao_senha: string | null;
  validade: string | null;
  criado_em: string;
}

const TIPO_OPTS = [
  { v: "governo", l: "Governo (gov.br, INSS)" },
  { v: "banco", l: "Banco" },
  { v: "email", l: "E-mail" },
  { v: "tribunal", l: "Tribunal/PJe" },
  { v: "outro", l: "Outro" },
];

const TIPO_CLASS: Record<string, string> = {
  governo: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  banco: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  email: "bg-violet-500/15 text-violet-600 border-violet-500/30",
  tribunal: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  outro: "bg-muted text-muted-foreground border-muted-foreground/30",
};

interface Props {
  clienteId: string;
}

export default function CredenciaisTab({ clienteId }: Props) {
  const [items, setItems] = useState<Credencial[]>([]);
  const [loading, setLoading] = useState(true);
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Credencial | null>(null);
  const [removing, setRemoving] = useState<Credencial | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<string | null>(null);

  // Form state
  const [sistema, setSistema] = useState("");
  const [tipo, setTipo] = useState("governo");
  const [identificador, setIdentificador] = useState("");
  const [senha, setSenha] = useState("");
  const [url, setUrl] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [validade, setValidade] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("cliente_credenciais")
      .select("*")
      .eq("cliente_id", clienteId)
      .order("criado_em", { ascending: false });
    if (error) toast.error("Erro ao carregar credenciais");
    setItems((data as Credencial[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // limpa senhas reveladas ao trocar cliente
    setRevealed({});
  }, [clienteId]);

  function resetForm() {
    setSistema(""); setTipo("governo"); setIdentificador("");
    setSenha(""); setUrl(""); setObservacoes(""); setValidade("");
    setEditing(null);
  }

  function openNew() {
    resetForm();
    setOpenForm(true);
  }

  function openEdit(c: Credencial) {
    setEditing(c);
    setSistema(c.sistema);
    setTipo(c.tipo);
    setIdentificador(c.identificador ?? "");
    setSenha(""); // edição opcional
    setUrl(c.url ?? "");
    setObservacoes(c.observacoes ?? "");
    setValidade(c.validade ?? "");
    setOpenForm(true);
  }

  async function handleSave() {
    if (!sistema.trim()) {
      toast.error("Informe o sistema");
      return;
    }
    if (!editing && !senha) {
      toast.error("Informe a senha");
      return;
    }
    setSaving(true);
    try {
      let senha_cifrada: string | null = null;
      if (senha) {
        const { data, error } = await supabase.functions.invoke("cofre-credencial", {
          body: { action: "encrypt", plain: senha },
        });
        if (error || !data?.cipher) throw new Error(error?.message ?? "Falha ao cifrar");
        senha_cifrada = data.cipher;
      }

      if (editing) {
        const payload: any = {
          sistema, tipo,
          identificador: identificador || null,
          url: url || null,
          observacoes: observacoes || null,
          validade: validade || null,
        };
        if (senha_cifrada) {
          payload.senha_cifrada = senha_cifrada;
          payload.ultima_atualizacao_senha = new Date().toISOString().slice(0, 10);
        }
        const { error } = await supabase
          .from("cliente_credenciais")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Credencial atualizada");
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from("cliente_credenciais").insert({
          cliente_id: clienteId,
          sistema, tipo,
          identificador: identificador || null,
          senha_cifrada: senha_cifrada!,
          url: url || null,
          observacoes: observacoes || null,
          validade: validade || null,
          ultima_atualizacao_senha: new Date().toISOString().slice(0, 10),
          criado_por: user?.id,
        });
        if (error) throw error;
        toast.success("Credencial salva");
      }

      setOpenForm(false);
      resetForm();
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function handleReveal(c: Credencial) {
    if (revealed[c.id]) {
      // ocultar
      setRevealed((prev) => {
        const cp = { ...prev };
        delete cp[c.id];
        return cp;
      });
      return;
    }
    setRevealing(c.id);
    try {
      const { data, error } = await supabase.functions.invoke("cofre-credencial", {
        body: { action: "decrypt", credencial_id: c.id },
      });
      if (error || !data?.plain) throw new Error(error?.message ?? "Falha ao decifrar");
      setRevealed((prev) => ({ ...prev, [c.id]: data.plain }));
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao revelar senha");
    } finally {
      setRevealing(null);
    }
  }

  async function handleCopy(c: Credencial) {
    try {
      let plain = revealed[c.id];
      if (!plain) {
        const { data, error } = await supabase.functions.invoke("cofre-credencial", {
          body: { action: "decrypt", credencial_id: c.id },
        });
        if (error || !data?.plain) throw new Error(error?.message ?? "Falha");
        plain = data.plain;
      }
      await navigator.clipboard.writeText(plain);
      toast.success("Senha copiada");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao copiar");
    }
  }

  async function handleDelete() {
    if (!removing) return;
    const { error } = await supabase
      .from("cliente_credenciais")
      .delete()
      .eq("id", removing.id);
    if (error) {
      toast.error("Erro ao excluir");
    } else {
      toast.success("Credencial excluída");
      setRemoving(null);
      await load();
    }
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-gold" />
          <h3 className="font-display text-lg">Cofre de credenciais</h3>
          <Badge variant="outline" className="ml-2">{items.length}</Badge>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="w-4 h-4 mr-1.5" /> Nova credencial
        </Button>
      </div>

      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 mb-4 flex gap-2 text-xs text-amber-700">
        <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <p>
          Senhas são armazenadas com criptografia AES-256-GCM. Cada visualização é registrada
          em log de auditoria acessível por gestores.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : items.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          Nenhuma credencial cadastrada para este cliente.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((c) => {
            const plain = revealed[c.id];
            const expirada = c.validade && new Date(c.validade) < new Date();
            return (
              <div
                key={c.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 hover:bg-accent/30 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{c.sistema}</span>
                    <Badge variant="outline" className={`text-[10px] ${TIPO_CLASS[c.tipo] ?? TIPO_CLASS.outro}`}>
                      {TIPO_OPTS.find((t) => t.v === c.tipo)?.l ?? c.tipo}
                    </Badge>
                    {expirada && (
                      <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/30">
                        Expirada
                      </Badge>
                    )}
                    {c.url && (
                      <a href={c.url} target="_blank" rel="noreferrer"
                        className="text-xs text-gold hover:underline inline-flex items-center gap-1">
                        <ExternalLink className="w-3 h-3" /> abrir
                      </a>
                    )}
                  </div>
                  {c.identificador && (
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{c.identificador}</p>
                  )}
                  <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    {c.ultima_atualizacao_senha && (
                      <span>senha: {formatDate(c.ultima_atualizacao_senha)}</span>
                    )}
                    {c.validade && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> validade {formatDate(c.validade)}
                      </span>
                    )}
                  </div>
                  {plain && (
                    <p className="font-mono text-sm mt-1.5 px-2 py-1 rounded bg-muted/50 inline-block">{plain}</p>
                  )}
                  {c.observacoes && (
                    <p className="text-xs text-muted-foreground italic mt-1">{c.observacoes}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon" variant="ghost"
                    onClick={() => handleReveal(c)}
                    disabled={revealing === c.id}
                    title={plain ? "Ocultar" : "Revelar"}
                  >
                    {plain ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => handleCopy(c)} title="Copiar senha">
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => openEdit(c)} title="Editar">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setRemoving(c)} title="Excluir">
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Form dialog */}
      <Dialog open={openForm} onOpenChange={(o) => { setOpenForm(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar credencial" : "Nova credencial"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Sistema *</Label>
                <Input value={sistema} onChange={(e) => setSistema(e.target.value)} placeholder="Ex.: gov.br" />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={tipo} onValueChange={setTipo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPO_OPTS.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Login / Identificador</Label>
              <Input value={identificador} onChange={(e) => setIdentificador(e.target.value)} placeholder="CPF, e-mail ou usuário" />
            </div>
            <div>
              <Label>{editing ? "Nova senha (opcional)" : "Senha *"}</Label>
              <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder={editing ? "Deixe em branco para manter" : "•••••••"} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>URL</Label>
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
              </div>
              <div>
                <Label>Validade</Label>
                <Input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenForm(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir credencial?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A credencial "{removing?.sistema}" será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
