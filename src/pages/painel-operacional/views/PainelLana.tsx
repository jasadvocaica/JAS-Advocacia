import { useEffect, useMemo, useState } from "react";
import { AlertOctagon, CalendarClock, CheckCircle2, ClipboardList } from "lucide-react";
import { CardsMetricasTopo, type MetricaTopo } from "../components/CardsMetricasTopo";
import { ListaMeusItens } from "../components/ListaMeusItens";
import { AlertaProtocolo } from "../components/AlertaProtocolo";
import { ProtocolarAgoraCard } from "../components/ProtocolarAgoraCard";
import { AndamentosRecentesCard } from "../components/AndamentosRecentesCard";
import { SuporteEstherCard } from "../components/SuporteEstherCard";
import type { MeuItem } from "../hooks/useMeusItens";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const EMAIL_ESTHER = "esther@julianaaraujoadvocacia.com";

function dentroDe(d: string, dias: number) {
  const v = new Date(d);
  const h = new Date();
  h.setHours(0, 0, 0, 0);
  const l = new Date(h);
  l.setDate(l.getDate() + dias);
  return v >= h && v <= l;
}
function atrasado(d: string) {
  const v = new Date(d);
  v.setHours(0, 0, 0, 0);
  const h = new Date();
  h.setHours(0, 0, 0, 0);
  return v < h;
}

export function PainelLana({ itens }: { itens: MeuItem[] }) {
  const { profile } = useAuth();
  const [estherId, setEstherId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .ilike("email", EMAIL_ESTHER)
        .maybeSingle();
      setEstherId((data as any)?.id ?? null);
    })();
  }, []);

  const { metricas, paraProtocolar, emRevisao } = useMemo(() => {
    const paraProtocolar = itens.filter((i) => i.tipo === "protocolo" && i.status === "pendente");
    const emRevisao = itens.filter((i) => i.status === "aguardando").length;
    const atrasados = itens.filter((i) => atrasado(i.data_vencimento)).length;
    const sete = itens.filter((i) => dentroDe(i.data_vencimento, 7)).length;
    const m: MetricaTopo[] = [
      { label: "Atrasados", valor: atrasados, icon: AlertOctagon, tone: atrasados > 0 ? "destructive" : "default" },
      { label: "Prazos 7 dias", valor: sete, icon: CalendarClock },
      { label: "Para protocolar", valor: paraProtocolar.length, icon: CheckCircle2, tone: paraProtocolar.length > 0 ? "success" : "default" },
      { label: "Em revisão", valor: emRevisao, icon: ClipboardList, tone: "warning" },
    ];
    return { metricas: m, paraProtocolar, emRevisao };
  }, [itens]);

  return (
    <>
      <AlertaProtocolo pecas={paraProtocolar} />
      <CardsMetricasTopo metricas={metricas} />
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          <ListaMeusItens itens={itens} titulo="Meus prazos e tarefas" destacarAtrasados />
          <AndamentosRecentesCard profileId={profile?.id} />
        </div>
        <div className="space-y-3">
          <ProtocolarAgoraCard pecas={paraProtocolar} />
          <SuporteEstherCard meuId={profile?.id} estherProfileId={estherId} />
        </div>
      </div>
    </>
  );
}
