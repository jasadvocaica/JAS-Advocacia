import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X, Tag as TagIcon, MessageSquarePlus, UserPlus, Loader2, Plus, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface Props {
  selecionados: string[];
  onLimpar: () => void;
  onAtualizar: () => void;
}

type Modal = null | "tags" | "andamento" | "parceiro";

interface Tag { id: string; nome: string; cor: string; }
interface Parceiro { id: string; nome: string; estado: string | null; oab: string | null; }

export function BulkActionsBar({ selecionados, onLimpar, onAtualizar }: Props) {
  const [modal, setModal] = useState<Modal>(null);

  return (
    <>
      <div className="sticky top-0 z-30 -mx-1 px-4 py-2.5 bg-gold text-navy rounded-xl shadow-lg flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-full bg-navy text-gold inline-flex items-center justify-center text-sm font-bold">
            {selecionados.length}
          </span>
          <span className="font-display text-base">
            processo{selecionados.length > 1 ? "s" : ""} selecionado{selecionados.length > 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="secondary" onClick={() => setModal("tags")} className="gap-1.5">
            <TagIcon className="w-3.5 h-3.5" /> Tags
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setModal("andamento")} className="gap-1.5">
            <MessageSquarePlus className="w-3.5 h-3.5" /> Andamento
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setModal("parceiro")} className="gap-1.5">
            <UserPlus className="w-3.5 h-3.5" /> Parceiro
          </Button>
          <Button size="sm" variant="ghost" onClick={onLimpar} className="text-navy hover:bg-navy/10 gap-1">
            <X className="w-3.5 h-3.5" /> Cancelar
          </Button>
        </div>
      </div>

      {modal === "tags" && (
        <ModalTags
          processoIds={selecionados}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); onAtualizar(); }}
        />
      )}
      {modal === "andamento" && (
        <ModalAndamento
          processoIds={selecionados}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); onAtualizar(); }}
        />
      )}
      {modal === "parceiro" && (
        <ModalParceiro
          processoIds={selecionados}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); onAtualizar(); }}
        />
      )}
    </>
  );
}

// ============== TAGS ==============

function ModalTags({ processoIds, onClose, onDone }: { processoIds: string[]; onClose: () => void; onDone: () => void; }) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [acao, setAcao] = useState<"adicionar" | "remover">("adicionar");
  const [novaTag, setNovaTag] = useState("");
  const [loading, setLoading] = useState(false);

  const carregar = async () => {
    const { data } = await supabase.from("tags").select("*").order("nome");
    setTags((data ?? []) as Tag[]);
  };
  useEffect(() => { carregar(); }, []);

  const toggle = (id: string) => {
    setSelecionadas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const criarTag = async () => {
    if (!novaTag.trim()) return;
    const { data, error } = await supabase
      .from("tags")
      .insert({ nome: novaTag.trim(), cor: "#BC943F" })
      .select()
      .single();
    if (error) return toast.error("Erro ao criar tag", { description: error.message });
    setTags((prev) => [...prev, data as Tag].sort((a, b) => a.nome.localeCompare(b.nome)));
    setSelecionadas((prev) => new Set(prev).add((data as Tag).id));
    setNovaTag("");
  };

  const aplicar = async () => {
    if (selecionadas.size === 0) return toast.error("Selecione ao menos uma tag");
    setLoading(true);
    try {
      if (acao === "adicionar") {
        const rows = processoIds.flatMap((pid) =>
          Array.from(selecionadas).map((tid) => ({ processo_id: pid, tag_id: tid }))
        );
        const { error } = await supabase.from("processos_tags").upsert(rows, { onConflict: "processo_id,tag_id" });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("processos_tags")
          .delete()
          .in("processo_id", processoIds)
          .in("tag_id", Array.from(selecionadas));
        if (error) throw error;
      }
      toast.success(`Tags ${acao === "adicionar" ? "adicionadas a" : "removidas de"} ${processoIds.length} processo(s)`);
      onDone();
    } catch (e: any) {
      toast.error("Falha", { description: e.message ?? String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><TagIcon className="w-5 h-5 text-gold" /> Tags em lote</DialogTitle>
          <DialogDescription>Selecione tags para {acao === "adicionar" ? "adicionar a" : "remover de"} {processoIds.length} processo(s).</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Select value={acao} onValueChange={(v: any) => setAcao(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="adicionar">Adicionar tags</SelectItem>
              <SelectItem value="remover">Remover tags</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto p-1">
            {tags.map((t) => {
              const sel = selecionadas.has(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggle(t.id)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all"
                  style={{
                    backgroundColor: sel ? t.cor : `${t.cor}15`,
                    color: sel ? "#fff" : t.cor,
                    borderColor: t.cor,
                  }}
                >
                  {sel && <Check className="w-3 h-3" />}
                  {t.nome}
                </button>
              );
            })}
            {tags.length === 0 && <span className="text-xs text-muted-foreground">Nenhuma tag cadastrada.</span>}
          </div>

          <div className="flex gap-2">
            <Input
              value={novaTag}
              onChange={(e) => setNovaTag(e.target.value)}
              placeholder="Criar nova tag…"
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), criarTag())}
            />
            <Button type="button" variant="outline" onClick={criarTag} disabled={!novaTag.trim()}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={aplicar} disabled={loading || selecionadas.size === 0} className="gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Aplicar a {processoIds.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============== ANDAMENTO ==============

function ModalAndamento({ processoIds, onClose, onDone }: { processoIds: string[]; onClose: () => void; onDone: () => void; }) {
  const { user } = useAuth();
  const [descricao, setDescricao] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  const aplicar = async () => {
    if (!descricao.trim()) return toast.error("Descreva o andamento");
    setLoading(true);
    try {
      const rows = processoIds.map((pid) => ({
        processo_id: pid,
        descricao: descricao.trim(),
        data,
        fonte: "manual",
        criado_por: user?.id ?? null,
      }));
      const { error } = await supabase.from("andamentos").insert(rows);
      if (error) throw error;
      toast.success(`Andamento registrado em ${processoIds.length} processo(s)`);
      onDone();
    } catch (e: any) {
      toast.error("Falha", { description: e.message ?? String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><MessageSquarePlus className="w-5 h-5 text-gold" /> Registrar andamento</DialogTitle>
          <DialogDescription>O mesmo andamento será criado em {processoIds.length} processo(s).</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Descrição *</Label>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={5}
              placeholder="Ex: Petição de juntada de documentos protocolada."
            />
          </div>
          <div>
            <Label>Data</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={aplicar} disabled={loading || !descricao.trim()} className="gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Registrar em {processoIds.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============== PARCEIRO ==============

function ModalParceiro({ processoIds, onClose, onDone }: { processoIds: string[]; onClose: () => void; onDone: () => void; }) {
  const [parceiros, setParceiros] = useState<Parceiro[]>([]);
  const [parceiroId, setParceiroId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from("parceiros").select("id, nome, estado, oab").eq("ativo", true).order("nome")
      .then(({ data }) => setParceiros((data ?? []) as Parceiro[]));
  }, []);

  const aplicar = async () => {
    setLoading(true);
    try {
      const valor = parceiroId === "__nenhum__" ? null : parceiroId;
      const { error } = await supabase
        .from("processos")
        .update({ parceiro_id: valor })
        .in("id", processoIds);
      if (error) throw error;
      toast.success(valor
        ? `Parceiro atribuído a ${processoIds.length} processo(s)`
        : `Parceiro removido de ${processoIds.length} processo(s)`);
      onDone();
    } catch (e: any) {
      toast.error("Falha", { description: e.message ?? String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserPlus className="w-5 h-5 text-gold" /> Atribuir parceiro</DialogTitle>
          <DialogDescription>Define o parceiro responsável em {processoIds.length} processo(s).</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Label>Parceiro</Label>
          <Select value={parceiroId} onValueChange={setParceiroId}>
            <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__nenhum__">— Nenhum (remover) —</SelectItem>
              {parceiros.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome}{p.estado ? ` · ${p.estado}` : ""}{p.oab ? ` · ${p.oab}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {parceiros.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhum parceiro ativo cadastrado.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={aplicar} disabled={loading || !parceiroId} className="gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
