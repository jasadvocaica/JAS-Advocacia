import { useEffect, useMemo, useState } from "react";
import {
  addMonths, endOfMonth, endOfWeek, format, isSameDay, isSameMonth,
  parseISO, startOfMonth, startOfWeek, subMonths, addDays, isAfter,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ChevronLeft, ChevronRight, Plus, RefreshCcw, MapPin, Clock, ExternalLink, Loader2, CalendarDays,
} from "lucide-react";
import { toast } from "sonner";
import { EventoFormDialog } from "./EventoFormDialog";

const GOOGLE_CALENDAR_EMBED_URL =
  "https://calendar.google.com/calendar/embed?height=600&wkst=1&ctz=America%2FCampo_Grande&showPrint=0&src=anVyaWRpY29AanVsaWFuYWFyYXVqb2Fkdm9jYWNpYS5jb20&src=Zjc5ZTAzNjcxNTAwZTBkMTY3NTA1YTZiYTgzOTE4ODU3ZTdkNzc5YjczZTM2ODYyMGJkNDhiZWFjZmUyOGM2ZUBncm91cC5jYWxlbmRhci5nb29nbGUuY29t&src=ZWE2YjM4Yjg4YTdjMTU4MzJkOWM1YWY4NDFmMGQ5ZmYxNjMwMzFjMTNmMjkwNzI2MGEzYjExNjYwNjdiZjJkNkBncm91cC5jYWxlbmRhci5nb29nbGUuY29t&src=ODU3ZmM3NjQzNjY5Y2QwNzE1NTk2N2RkZGUyMmM4ZGY3NDMxOGQ5NjJlZWM3M2RhZGRlNDM2NDc3MzNhM2JlM0Bncm91cC5jYWxlbmRhci5nb29nbGUuY29t&src=Y2xpZW50ZXNqdWxpYW5hYXJhdWpvQGdtYWlsLmNvbQ&color=%23039be5&color=%23f4511e&color=%23e4c441&color=%23e4c441&color=%23f6bf26";

export interface GcalEvent {
  id: string;
  status?: string;
  htmlLink?: string;
  summary?: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: { email: string; responseStatus?: string }[];
  colorId?: string;
  creator?: { email: string };
}

function eventoInicio(e: GcalEvent): Date {
  return parseISO((e.start.dateTime || e.start.date)!);
}
function eventoFim(e: GcalEvent): Date {
  return parseISO((e.end.dateTime || e.end.date)!);
}
function isAllDay(e: GcalEvent) {
  return Boolean(e.start.date && !e.start.dateTime);
}

export default function Agenda() {
  const { hasPermission } = useAuth();
  const podeCriar = hasPermission("controladoria", "criar");
  const podeEditar = hasPermission("controladoria", "editar");

  const [mesRef, setMesRef] = useState(() => new Date());
  const [eventos, setEventos] = useState<GcalEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [diaSelecionado, setDiaSelecionado] = useState<Date>(new Date());
  const [formAberto, setFormAberto] = useState(false);
  const [eventoEdit, setEventoEdit] = useState<GcalEvent | null>(null);
  const [visualizacao, setVisualizacao] = useState<"sistema" | "google">("google");

  const carregar = async () => {
    setLoading(true);
    try {
      // pega 6 semanas que aparecem no grid + buffer
      const inicio = startOfWeek(startOfMonth(mesRef), { weekStartsOn: 0 });
      const fim = endOfWeek(endOfMonth(mesRef), { weekStartsOn: 0 });
      const { data, error } = await supabase.functions.invoke("google-calendar", {
        body: {
          action: "list",
          timeMin: inicio.toISOString(),
          timeMax: addDays(fim, 1).toISOString(),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setEventos((data?.items ?? []) as GcalEvent[]);
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao carregar agenda", { description: err?.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visualizacao === "sistema") carregar();
    /* eslint-disable-next-line */
  }, [mesRef, visualizacao]);

  const dias = useMemo(() => {
    const inicio = startOfWeek(startOfMonth(mesRef), { weekStartsOn: 0 });
    const fim = endOfWeek(endOfMonth(mesRef), { weekStartsOn: 0 });
    const arr: Date[] = [];
    let cur = inicio;
    while (cur <= fim) { arr.push(cur); cur = addDays(cur, 1); }
    return arr;
  }, [mesRef]);

  const eventosPorDia = useMemo(() => {
    const map = new Map<string, GcalEvent[]>();
    for (const e of eventos) {
      const k = format(eventoInicio(e), "yyyy-MM-dd");
      const arr = map.get(k) ?? [];
      arr.push(e);
      map.set(k, arr);
    }
    return map;
  }, [eventos]);

  const proximos = useMemo(() => {
    const agora = new Date();
    return [...eventos]
      .filter((e) => isAfter(eventoFim(e), agora))
      .sort((a, b) => eventoInicio(a).getTime() - eventoInicio(b).getTime())
      .slice(0, 8);
  }, [eventos]);

  const eventosDoDia = (eventosPorDia.get(format(diaSelecionado, "yyyy-MM-dd")) ?? [])
    .sort((a, b) => eventoInicio(a).getTime() - eventoInicio(b).getTime());

  const novoEvento = () => {
    setEventoEdit(null);
    setFormAberto(true);
  };
  const editarEvento = (e: GcalEvent) => {
    setEventoEdit(e);
    setFormAberto(true);
  };
  const excluirEvento = async (e: GcalEvent) => {
    if (!confirm(`Excluir "${e.summary ?? "evento"}"?`)) return;
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar", {
        body: { action: "delete", eventId: e.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Evento excluído");
      carregar();
    } catch (err: any) {
      toast.error("Erro ao excluir", { description: err?.message });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agenda"
        description="Compromissos do escritório sincronizados com Google Calendar"
      >
        {visualizacao === "google" ? (
          <Button asChild variant="outline">
            <a href={GOOGLE_CALENDAR_EMBED_URL} target="_blank" rel="noreferrer">
              <ExternalLink className="w-4 h-4 mr-2" /> Abrir no Google Agenda
            </a>
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={carregar} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
              Atualizar
            </Button>
            {podeCriar && (
              <Button onClick={novoEvento}>
                <Plus className="w-4 h-4 mr-2" /> Novo evento
              </Button>
            )}
          </>
        )}
      </PageHeader>

      <div className="flex w-fit rounded-lg border border-border bg-muted/40 p-1" role="tablist" aria-label="Visualização da agenda">
        <Button
          type="button"
          size="sm"
          variant={visualizacao === "google" ? "default" : "ghost"}
          onClick={() => setVisualizacao("google")}
          role="tab"
          aria-selected={visualizacao === "google"}
        >
          Visão Google
        </Button>
        <Button
          type="button"
          size="sm"
          variant={visualizacao === "sistema" ? "default" : "ghost"}
          onClick={() => setVisualizacao("sistema")}
          role="tab"
          aria-selected={visualizacao === "sistema"}
        >
          Agenda do sistema
        </Button>
      </div>

      {visualizacao === "google" ? (
        <Card className="overflow-hidden">
          <div className="border-b border-border px-4 py-3 sm:px-6">
            <h2 className="font-display text-base">Agenda Google consolidada</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Visualização conjunta das agendas do escritório. Para incluir ou alterar um compromisso, use “Novo evento” ou a Agenda do sistema.
            </p>
          </div>
          <iframe
            title="Agenda Google consolidada do escritório"
            src={GOOGLE_CALENDAR_EMBED_URL}
            className="block h-[70vh] min-h-[600px] w-full border-0 bg-background"
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </Card>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
        {/* Calendário mensal */}
        <Card className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setMesRef(subMonths(mesRef, 1))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <h2 className="text-lg font-display capitalize min-w-[160px] text-center">
                {format(mesRef, "MMMM 'de' yyyy", { locale: ptBR })}
              </h2>
              <Button variant="ghost" size="icon" onClick={() => setMesRef(addMonths(mesRef, 1))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={() => { setMesRef(new Date()); setDiaSelecionado(new Date()); }}>
              Hoje
            </Button>
          </div>

          <div className="grid grid-cols-7 text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
              <div key={d} className="px-2 py-1 text-center">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-px bg-border rounded-md overflow-hidden border border-border">
            {dias.map((dia) => {
              const k = format(dia, "yyyy-MM-dd");
              const evs = eventosPorDia.get(k) ?? [];
              const isCurMonth = isSameMonth(dia, mesRef);
              const isHoje = isSameDay(dia, new Date());
              const isSel = isSameDay(dia, diaSelecionado);
              return (
                <button
                  key={k}
                  onClick={() => setDiaSelecionado(dia)}
                  className={cn(
                    "min-h-[88px] p-1.5 text-left bg-card transition-colors hover:bg-accent/40 flex flex-col gap-1",
                    !isCurMonth && "opacity-40",
                    isSel && "ring-2 ring-primary ring-inset"
                  )}
                >
                  <span className={cn(
                    "text-xs font-semibold inline-flex items-center justify-center w-6 h-6 rounded-full",
                    isHoje && "bg-primary text-primary-foreground"
                  )}>{format(dia, "d")}</span>
                  <div className="space-y-0.5 overflow-hidden">
                    {evs.slice(0, 3).map((e) => (
                      <div key={e.id} className="text-[10px] truncate px-1 py-0.5 rounded bg-primary/10 text-primary font-medium">
                        {!isAllDay(e) && format(eventoInicio(e), "HH:mm") + " "}
                        {e.summary ?? "(sem título)"}
                      </div>
                    ))}
                    {evs.length > 3 && (
                      <div className="text-[10px] text-muted-foreground px-1">+{evs.length - 3} mais</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Lateral: dia selecionado + próximos */}
        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="font-display text-base mb-3 capitalize">
              {format(diaSelecionado, "EEEE, d 'de' MMMM", { locale: ptBR })}
            </h3>
            {eventosDoDia.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Sem compromissos.</p>
            ) : (
              <div className="space-y-3">
                {eventosDoDia.map((e) => (
                  <EventoCard key={e.id} evento={e}
                    podeEditar={podeEditar}
                    onEditar={() => editarEvento(e)}
                    onExcluir={() => excluirEvento(e)}
                  />
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-display text-base">Próximos compromissos</h3>
            </div>
            {proximos.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nada agendado.</p>
            ) : (
              <div className="space-y-3">
                {proximos.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => { setMesRef(eventoInicio(e)); setDiaSelecionado(eventoInicio(e)); }}
                    className="w-full text-left p-2 rounded-md hover:bg-accent/40 transition-colors"
                  >
                    <p className="text-sm font-medium leading-tight truncate">{e.summary ?? "(sem título)"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(eventoInicio(e), "dd/MM HH:mm", { locale: ptBR })}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
      )}

      {formAberto && (
        <EventoFormDialog
          aberto={formAberto}
          onFechar={() => setFormAberto(false)}
          evento={eventoEdit}
          dataInicial={diaSelecionado}
          onSalvo={() => { setFormAberto(false); carregar(); }}
        />
      )}
    </div>
  );
}

function EventoCard({
  evento, podeEditar, onEditar, onExcluir,
}: {
  evento: GcalEvent;
  podeEditar: boolean;
  onEditar: () => void;
  onExcluir: () => void;
}) {
  const inicio = eventoInicio(evento);
  const fim = eventoFim(evento);
  const allDay = isAllDay(evento);
  return (
    <div className="rounded-md border border-border p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium leading-tight flex-1">{evento.summary ?? "(sem título)"}</p>
        {allDay && <Badge variant="secondary" className="text-[10px]">Dia inteiro</Badge>}
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="w-3 h-3" />
        {allDay
          ? format(inicio, "dd/MM/yyyy", { locale: ptBR })
          : `${format(inicio, "HH:mm")} – ${format(fim, "HH:mm")}`}
      </div>
      {evento.location && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="w-3 h-3" /> <span className="truncate">{evento.location}</span>
        </div>
      )}
      {evento.description && (
        <p className="text-xs text-muted-foreground whitespace-pre-line line-clamp-3">{evento.description}</p>
      )}
      <div className="flex gap-2 pt-1">
        {evento.htmlLink && (
          <Button asChild variant="outline" size="sm">
            <a href={evento.htmlLink} target="_blank" rel="noreferrer">
              <ExternalLink className="w-3 h-3 mr-1.5" /> Abrir
            </a>
          </Button>
        )}
        {podeEditar && (
          <>
            <Button variant="ghost" size="sm" onClick={onEditar}>Editar</Button>
            <Button variant="ghost" size="sm" className="text-destructive" onClick={onExcluir}>Excluir</Button>
          </>
        )}
      </div>
    </div>
  );
}
