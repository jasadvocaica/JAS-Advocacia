import { useMemo } from "react";
import { CalendarDays, MapPin, BookOpen, ClipboardList } from "lucide-react";
import { CardsMetricasTopo, type MetricaTopo } from "../components/CardsMetricasTopo";
import { ListaMeusItens } from "../components/ListaMeusItens";
import { ProximaDiligenciaCard } from "../components/ProximaDiligenciaCard";
import { PesquisasAbertasCard } from "../components/PesquisasAbertasCard";
import type { MeuItem } from "../hooks/useMeusItens";

const REGEX_PESQUISA = /^(pesquisa|pesquisar|estudo)\b/i;

function ehHoje(d: string) {
  return new Date(d).toDateString() === new Date().toDateString();
}
function dentroDe(d: string, dias: number) {
  const v = new Date(d);
  const h = new Date();
  h.setHours(0, 0, 0, 0);
  const l = new Date(h);
  l.setDate(l.getDate() + dias);
  return v >= h && v <= l;
}

export function PainelEsther({ itens }: { itens: MeuItem[] }) {
  const { metricas, pesquisas, proxDilig } = useMemo(() => {
    const pesquisas = itens.filter((i) => REGEX_PESQUISA.test(i.titulo));
    const hoje = itens.filter((i) => ehHoje(i.data_vencimento)).length;
    const dilig = itens.filter((i) => i.tipo === "diligencia").length;
    const sete = itens.filter((i) => dentroDe(i.data_vencimento, 7)).length;
    const m: MetricaTopo[] = [
      { label: "Vencem hoje", valor: hoje, icon: CalendarDays, tone: hoje > 0 ? "destructive" : "default" },
      { label: "Diligências", valor: dilig, icon: MapPin },
      { label: "Pesquisas abertas", valor: pesquisas.length, icon: BookOpen },
      { label: "Próximos 7 dias", valor: sete, icon: ClipboardList },
    ];
    const proxDilig = itens.find((i) => i.tipo === "diligencia") ?? null;
    return { metricas: m, pesquisas, proxDilig };
  }, [itens]);

  return (
    <>
      <CardsMetricasTopo metricas={metricas} />
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ListaMeusItens itens={itens} mostrarSolicitante />
        </div>
        <div className="space-y-3">
          <PesquisasAbertasCard itens={pesquisas} />
          <ProximaDiligenciaCard item={proxDilig} />
        </div>
      </div>
    </>
  );
}
