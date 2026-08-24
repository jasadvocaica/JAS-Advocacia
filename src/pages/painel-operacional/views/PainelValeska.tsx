import { useMemo } from "react";
import { CalendarDays, ClipboardList, MapPin, Briefcase } from "lucide-react";
import { CardsMetricasTopo, type MetricaTopo } from "../components/CardsMetricasTopo";
import { ListaMeusItens } from "../components/ListaMeusItens";
import { ProximaDiligenciaCard } from "../components/ProximaDiligenciaCard";
import type { MeuItem } from "../hooks/useMeusItens";

function dentroDe(dataIso: string, dias: number) {
  const venc = new Date(dataIso);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const limite = new Date(hoje);
  limite.setDate(limite.getDate() + dias);
  return venc >= hoje && venc <= limite;
}
function ehHoje(dataIso: string) {
  const d = new Date(dataIso);
  const h = new Date();
  return d.toDateString() === h.toDateString();
}
function ehSemana(dataIso: string) {
  return dentroDe(dataIso, 7);
}

export function PainelValeska({ itens }: { itens: MeuItem[] }) {
  const { metricas, proxDilig, proxAud } = useMemo(() => {
    const hoje = itens.filter((i) => ehHoje(i.data_vencimento)).length;
    const sete = itens.filter((i) => dentroDe(i.data_vencimento, 7)).length;
    const dilig = itens.filter((i) => i.tipo === "diligencia").length;
    const semanaAud = itens.filter(
      (i) => (i.tipo === "audiencia" || i.tipo === "reuniao") && ehSemana(i.data_vencimento)
    ).length;
    const m: MetricaTopo[] = [
      { label: "Vencem hoje", valor: hoje, icon: CalendarDays, tone: hoje > 0 ? "destructive" : "default" },
      { label: "Próximos 7 dias", valor: sete, icon: ClipboardList },
      { label: "Diligências", valor: dilig, icon: MapPin },
      { label: "Audiências/perícias na semana", valor: semanaAud, icon: Briefcase },
    ];
    const proxDilig = itens.find((i) => i.tipo === "diligencia") ?? null;
    const proxAud =
      itens.find((i) => i.tipo === "audiencia" || /per[ií]cia/i.test(i.titulo)) ?? null;
    return { metricas: m, proxDilig, proxAud };
  }, [itens]);

  return (
    <>
      <CardsMetricasTopo metricas={metricas} />
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ListaMeusItens itens={itens} />
        </div>
        <div className="space-y-3">
          <ProximaDiligenciaCard item={proxDilig} />
          <ProximaDiligenciaCard
            item={proxAud}
            titulo="Próxima audiência/perícia"
            vazio="Nenhuma audiência ou perícia futura"
          />
        </div>
      </div>
    </>
  );
}
