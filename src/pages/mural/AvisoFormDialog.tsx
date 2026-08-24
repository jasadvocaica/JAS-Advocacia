import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import type { MuralAviso, Prioridade } from "@/hooks/useMuralAvisos";

interface Membro { id: string; nome: string; user_id: string }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  aviso: MuralAviso | null;
  onSaved: () => void;
}

export function AvisoFormDialog({ open, onOpenChange, aviso, onSaved }: Props) {
  const { user } = useAuth();
  const [titulo, setTitulo] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [prioridade, setPrioridade] = useState<Prioridade>("normal");
  const [fixado, setFixado] = useState(false);
  const [destinatarias, setDestinatarias] = useState<string[]>([]);
  const [todas, setTodas] = useState(true);
  const [expira, setExpira] = useState<string>("");
  const [estagiarias, setEstagiarias] = useState<Membro[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const { data } = await supabase
        .from("equipe_membros")
        .select("id, nome, user_id, cargo, status")
        .eq("status", "ativo")
        .eq("cargo", "estagiario");
      setEstagiarias((data ?? []) as any);
    })();
  }, [open]);

  useEffect(() => {
    if (aviso) {
      setTitulo(aviso.titulo);
      setConteudo(aviso.conteudo);
      setPrioridade(aviso.prioridade);
      setFixado(aviso.fixado);
      setDestinatarias(aviso.destinatarias ?? []);
      setTodas(!aviso.destinatarias?.length);
      setExpira(aviso.expira_em ? aviso.expira_em.slice(0, 10) : "");
    } else {
      setTitulo(""); setConteudo(""); setPrioridade("normal"); setFixado(false);
      setDestinatarias([]); setTodas(true); setExpira("");
    }
  }, [aviso, open]);

  const submit = async () => {
    if (!titulo.trim() || !conteudo.trim()) {
      toast.error("Título e conteúdo são obrigatórios");
      return;
    }
    setSalvando(true);
    const dest = todas ? [] : destinatarias;
    const payload: any = {
      titulo: titulo.trim(),
      conteudo: conteudo.trim(),
      prioridade,
      fixado,
      destinatarias: dest,
      expira_em: expira ? new Date(expira + "T23:59:59").toISOString() : null,
    };

    let avisoId = aviso?.id;
    if (aviso) {
      const { error } = await (supabase as any).from("mural_avisos").update(payload).eq("id", aviso.id);
      if (error) { toast.error(error.message); setSalvando(false); return; }
    } else {
      payload.criado_por = user?.id;
      const { data, error } = await (supabase as any).from("mural_avisos").insert(payload).select("id").single();
      if (error) { toast.error(error.message); setSalvando(false); return; }
      avisoId = (data as any)?.id;

      // Notificações internas
      const destUserIds = todas
        ? estagiarias.map((e) => e.user_id).filter(Boolean)
        : estagiarias.filter((e) => dest.includes(e.id)).map((e) => e.user_id).filter(Boolean);
      if (destUserIds.length) {
        const rows = destUserIds.map((uid) => ({
          user_id: uid,
          tipo: "mural_aviso",
          titulo: prioridade === "urgente" ? `[URGENTE] ${titulo.trim()}` : `Novo aviso: ${titulo.trim()}`,
          descricao: conteudo.trim().slice(0, 140),
          link: "/mural-avisos",
        }));
        await (supabase as any).from("notificacoes").insert(rows);
      }
    }
    toast.success(aviso ? "Aviso atualizado" : "Aviso publicado");
    setSalvando(false);
    onOpenChange(false);
    onSaved();
    void avisoId;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{aviso ? "Editar aviso" : "Novo aviso"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Título *</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </div>
          <div>
            <Label>Conteúdo *</Label>
            <Textarea value={conteudo} onChange={(e) => setConteudo(e.target.value)} rows={5} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Prioridade</Label>
              <Select value={prioridade} onValueChange={(v) => setPrioridade(v as Prioridade)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgente">Urgente</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="informativo">Informativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Expira em</Label>
              <Input type="date" value={expira} onChange={(e) => setExpira(e.target.value)} />
            </div>
          </div>
          <div className="rounded-md border p-3">
            <Label className="block mb-2">Para quem</Label>
            <div className="flex items-center gap-2 mb-2">
              <Checkbox id="todas" checked={todas} onCheckedChange={(v) => setTodas(!!v)} />
              <label htmlFor="todas" className="text-sm">Todas as estagiárias</label>
            </div>
            {!todas && (
              <div className="grid gap-1 max-h-40 overflow-y-auto">
                {estagiarias.map((e) => (
                  <label key={e.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={destinatarias.includes(e.id)}
                      onCheckedChange={(v) =>
                        setDestinatarias((prev) => v ? [...prev, e.id] : prev.filter((x) => x !== e.id))
                      }
                    />
                    {e.nome}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={fixado} onCheckedChange={setFixado} id="fixar" />
            <label htmlFor="fixar" className="text-sm">Fixar no topo</label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>Cancelar</Button>
          <Button onClick={submit} disabled={salvando}>
            {salvando ? "Salvando..." : aviso ? "Salvar" : "Publicar aviso"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
