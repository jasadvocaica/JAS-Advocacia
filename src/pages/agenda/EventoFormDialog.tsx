import { useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { GcalEvent } from "./Agenda";

interface Props {
  aberto: boolean;
  onFechar: () => void;
  evento: GcalEvent | null;
  dataInicial: Date;
  onSalvo: () => void;
}

const TZ = "America/Campo_Grande";

function toLocalInputValue(d: Date) {
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

export function EventoFormDialog({ aberto, onFechar, evento, dataInicial, onSalvo }: Props) {
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [local, setLocal] = useState("");
  const [diaInteiro, setDiaInteiro] = useState(false);
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [convidados, setConvidados] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Chave do rascunho: por evento (edição) ou "novo" (criação)
  const draftKey = `agenda:rascunho:${evento?.id ?? "novo"}`;

  useEffect(() => {
    if (!aberto) return;
    let restaurado = false;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw);
        setTitulo(d.titulo ?? "");
        setDescricao(d.descricao ?? "");
        setLocal(d.local ?? "");
        setDiaInteiro(Boolean(d.diaInteiro));
        setInicio(d.inicio ?? "");
        setFim(d.fim ?? "");
        setConvidados(d.convidados ?? "");
        restaurado = true;
        toast.info("Rascunho recuperado", { description: "Continuamos de onde você parou." });
      }
    } catch {}
    if (restaurado) return;

    if (evento) {
      setTitulo(evento.summary ?? "");
      setDescricao(evento.description ?? "");
      setLocal(evento.location ?? "");
      const allDay = Boolean(evento.start.date && !evento.start.dateTime);
      setDiaInteiro(allDay);
      if (allDay) {
        setInicio(evento.start.date!);
        setFim(evento.end.date!);
      } else {
        setInicio(toLocalInputValue(new Date(evento.start.dateTime!)));
        setFim(toLocalInputValue(new Date(evento.end.dateTime!)));
      }
      setConvidados((evento.attendees ?? []).map((a) => a.email).join(", "));
    } else {
      const base = new Date(dataInicial);
      base.setHours(9, 0, 0, 0);
      const baseFim = new Date(base);
      baseFim.setHours(10, 0, 0, 0);
      setTitulo("");
      setDescricao("");
      setLocal("");
      setDiaInteiro(false);
      setInicio(toLocalInputValue(base));
      setFim(toLocalInputValue(baseFim));
      setConvidados("");
    }
  }, [evento, dataInicial, aberto]);

  // Auto-salva rascunho local enquanto o usuário digita (debounce 500ms).
  // Protege contra perda de dados se a aba for minimizada/fechada.
  useEffect(() => {
    if (!aberto) return;
    const temConteudo = titulo || descricao || local || convidados;
    if (!temConteudo) return;

    const persistir = () => {
      try {
        localStorage.setItem(
          draftKey,
          JSON.stringify({ titulo, descricao, local, diaInteiro, inicio, fim, convidados }),
        );
      } catch {}
    };

    const t = setTimeout(persistir, 500);

    // Persistência imediata quando a aba é trocada/minimizada/fechada
    const flush = () => persistir();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", flush);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);

    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", flush);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
    };
  }, [aberto, draftKey, titulo, descricao, local, diaInteiro, inicio, fim, convidados]);

  const salvar = async () => {
    if (!titulo.trim()) {
      toast.error("Informe um título");
      return;
    }
    if (!inicio || !fim) {
      toast.error("Informe início e fim");
      return;
    }
    setSalvando(true);
    try {
      const attendees = convidados
        .split(/[,\s;]+/)
        .map((s) => s.trim())
        .filter((s) => s.includes("@"))
        .map((email) => ({ email }));

      const start = diaInteiro
        ? { date: inicio.slice(0, 10) }
        : { dateTime: new Date(inicio).toISOString(), timeZone: TZ };
      const end = diaInteiro
        ? { date: fim.slice(0, 10) }
        : { dateTime: new Date(fim).toISOString(), timeZone: TZ };

      const eventoBody = {
        summary: titulo,
        description: descricao || undefined,
        location: local || undefined,
        start,
        end,
        attendees: attendees.length ? attendees : undefined,
      };

      const { data, error } = await supabase.functions.invoke("google-calendar", {
        body: evento
          ? { action: "update", eventId: evento.id, event: eventoBody }
          : { action: "create", event: eventoBody },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      try { localStorage.removeItem(draftKey); } catch {}
      toast.success(evento ? "Evento atualizado" : "Evento criado");
      onSalvo();
    } catch (err: any) {
      toast.error("Erro ao salvar", { description: err?.message });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent
        className="max-w-lg"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{evento ? "Editar evento" : "Novo evento"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Título *</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Audiência, reunião…" />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <Label className="cursor-pointer">Dia inteiro</Label>
            <Switch checked={diaInteiro} onCheckedChange={setDiaInteiro} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Início *</Label>
              <Input
                type={diaInteiro ? "date" : "datetime-local"}
                value={diaInteiro ? inicio.slice(0, 10) : inicio}
                onChange={(e) => setInicio(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Fim *</Label>
              <Input
                type={diaInteiro ? "date" : "datetime-local"}
                value={diaInteiro ? fim.slice(0, 10) : fim}
                onChange={(e) => setFim(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Local</Label>
            <Input value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Fórum, link da reunião…" />
          </div>

          <div className="space-y-1.5">
            <Label>Convidados (e-mails separados por vírgula)</Label>
            <Input value={convidados} onChange={(e) => setConvidados(e.target.value)} placeholder="cliente@email.com, advogado@…" />
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {evento ? "Atualizar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
