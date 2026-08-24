import { useDashboardGestorData } from "./hooks/useDashboardGestorData";
import { useMetaMensal } from "./hooks/useMetaMensal";
import { HeaderExecutivo } from "./components/HeaderExecutivo";
import { AlertaControladoria } from "./components/AlertaControladoria";
import { CardsMetricas } from "./components/CardsMetricas";
import { GraficoFaturamento } from "./components/GraficoFaturamento";
import { CarteiraPorArea } from "./components/CarteiraPorArea";
import { DesempenhoEquipe } from "./components/DesempenhoEquipe";
import { RevisoesProtocolo } from "./components/RevisoesProtocolo";
import { SaudeEscritorioCard } from "./components/SaudeEscritorio";
import { HonorariosPendentes } from "./components/HonorariosPendentes";
import { ParceirosAtivos } from "./components/ParceirosAtivos";
import { SkeletonSecao } from "./components/SkeletonSecao";

export default function DashboardGestor() {
  const { dados, loading, error, ultimaCarga, recarregar } = useDashboardGestorData();
  const { meta, salvar: salvarMeta } = useMetaMensal();

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 p-4 md:p-6">
      <HeaderExecutivo ultimaCarga={ultimaCarga} onRefresh={recarregar} loading={loading} />

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Erro ao carregar dados: {error}
        </div>
      )}

      {/* Seção 1 — Alerta */}
      {!dados ? <SkeletonSecao height={88} /> : <AlertaControladoria itens={dados.itensAtrasados} />}

      {/* Seção 2 — 4 cards */}
      {!dados ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonSecao key={i} height={104} />
          ))}
        </div>
      ) : (
        <CardsMetricas metricas={dados.metricas} meta={meta} onSalvarMeta={salvarMeta} />
      )}

      {/* Seção 3 — Gráfico + Carteira */}
      {!dados ? (
        <div className="grid gap-3 lg:grid-cols-3">
          <SkeletonSecao height={320} />
          <SkeletonSecao height={320} />
          <SkeletonSecao height={320} />
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <GraficoFaturamento
              faturamento={dados.faturamento6m}
              meta={meta}
              recebidoMes={dados.metricas.recebidoMes}
            />
          </div>
          <CarteiraPorArea areas={dados.carteiraPorArea} total={dados.totalProcessosAtivos} />
        </div>
      )}

      {/* Seção 4 — 3 cards */}
      {!dados ? (
        <div className="grid gap-3 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonSecao key={i} height={280} />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          <DesempenhoEquipe equipe={dados.equipe} />
          <RevisoesProtocolo revisoes={dados.revisoesPendentes} protocolo={dados.filaProtocolo} />
          <SaudeEscritorioCard saude={dados.saude} />
        </div>
      )}

      {/* Seção 5 — 2 cards */}
      {!dados ? (
        <div className="grid gap-3 md:grid-cols-2">
          <SkeletonSecao height={280} />
          <SkeletonSecao height={280} />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <HonorariosPendentes itens={dados.honorariosPendentes} total={dados.totalPendenteMes} />
          <ParceirosAtivos parceiros={dados.parceiros} totalEstados={dados.totalEstadosParceiros} />
        </div>
      )}
    </div>
  );
}
