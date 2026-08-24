import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Calendar, ExternalLink, CheckCircle2, AlertCircle, Stethoscope, Gavel, Handshake, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const TIPOS_EVENTO = ["audiencia", "pericia", "conciliacao", "reuniao"] as const;
const ICONES: Record<string, any> = {
  audiencia: Gavel, pericia: Stethoscope, conciliacao: Handshake, reuniao: Users,
};
const LABELS: Record<string, string> = {
  audiencia: "Audiência", pericia: "Perícia", conciliacao: "Conciliação", reuniao: "Reunião",
};

interface Evento {
  id: string; titulo: string; tipo: string; data_vencimento: string;
  local: string | null; link_virtual: string | null; cliente_confirmado: boolean | null;
  cliente: { nome: string } | null;
}

export function ProximoEventoCard() {
  const { profile } = useAuth();
  const [ev, setEv] = useState<Evento | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      const { data } = await supabase
        .from("controladoria_itens")
        .select("id, titulo, tipo, data_vencimento, local, link_virtual, cliente_confirmado, cliente:clientes(nome)")
        .eq("responsavel_id", profile.id)
        .in("tipo", TIPOS_EVENTO)
        .gte("data_vencimento", new Date().toISOString())
        .not("status", "in", "(concluido,cancelado)")
        .order("data_vencimento", { ascending: true })
        .limit(1)
        .maybeSingle();
      setEv(data as any);
      setLoading(false);
    })();
  }, [profile?.id]);

  if (loading) return null;

  const Icone = ev ? ICONES[ev.tipo] ?? Calendar : Calendar;
  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground">Próximo evento</h3>
      {!ev ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-center text-xs text-muted-foreground">
          Nenhum evento agendado
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <Icone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="flex-1">
              <Link to={`/controladoria?item=${ev.id}`} className="block font-medium text-foreground hover:underline">
                {ev.titulo}
              </Link>
              <Badge variant="outline" className="mt-1 text-[10px]">{LABELS[ev.tipo]}</Badge>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            {new Date(ev.data_vencimento).toLocaleString("pt-BR", {
              weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
            })}
          </div>
          {ev.local && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />{ev.local}
            </div>
          )}
          {ev.link_virtual && (
            <a href={ev.link_virtual} target="_blank" rel="noopener noreferrer"
               className="flex items-center gap-1.5 text-xs text-primary hover:underline">
              <ExternalLink className="h-3.5 w-3.5" />Link virtual
            </a>
          )}
          {ev.cliente && <div className="text-xs text-muted-foreground">Cliente: {ev.cliente.nome}</div>}
          <div className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ${
            ev.cliente_confirmado ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
          }`}>
            {ev.cliente_confirmado
              ? <><CheckCircle2 className="h-3.5 w-3.5" />Cliente confirmou</>
              : <><AlertCircle className="h-3.5 w-3.5" />Cliente ainda não confirmou</>}
          </div>
        </div>
      )}
    </Card>
  );
}
