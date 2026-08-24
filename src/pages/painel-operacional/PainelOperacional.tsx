import { useAuth } from "@/contexts/AuthContext";
import { usePreviewMode } from "@/contexts/PreviewModeContext";
import { useMeusItens } from "./hooks/useMeusItens";
import { HeaderPainel } from "./components/HeaderPainel";
import { PainelValeska } from "./views/PainelValeska";
import { PainelEsther } from "./views/PainelEsther";
import { PainelLana } from "./views/PainelLana";
import { ListaMeusItens } from "./components/ListaMeusItens";
import { Skeleton } from "@/components/ui/skeleton";
import { MuralBlocoTopo } from "@/components/mural/MuralBlocoTopo";
import { CardPontoOperacional } from "@/components/ponto/CardPontoOperacional";
import { ProximoEventoCard } from "./components/ProximoEventoCard";
import { ComentariosNovosCard } from "./components/ComentariosNovosCard";

const EMAILS = {
  valeska: "valeska@julianaaraujoadvocacia.com",
  esther: "esther@julianaaraujoadvocacia.com",
  lana: "lanapriscila@julianaaraujoadvocacia.com",
};

export default function PainelOperacional() {
  const { profile, isGestor } = useAuth();
  const { preview } = usePreviewMode();
  const { itens, loading, error, ultimaCarga, recarregar } = useMeusItens();

  // Em modo preview de estagiária (apenas gestor), usa a identidade simulada para escolher a view.
  const previewEstagiaria = isGestor && preview?.tipo === "estagiaria" ? preview : null;
  const email = (previewEstagiaria?.email ?? profile?.email ?? "").toLowerCase();
  const nome = previewEstagiaria?.nome ?? profile?.nome ?? "Estagiária";

  let papel = "Painel operacional";
  let view: React.ReactNode = <ListaMeusItens itens={itens} />;

  if (email === EMAILS.valeska) {
    papel = "Comercial e atendimento";
    view = <PainelValeska itens={itens} />;
  } else if (email === EMAILS.esther) {
    papel = "Suporte e pesquisa";
    view = <PainelEsther itens={itens} />;
  } else if (email === EMAILS.lana) {
    papel = "Operacional e processual";
    view = <PainelLana itens={itens} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="flex-1">
          <HeaderPainel nome={nome} papel={papel} loading={loading} onRefresh={recarregar} ultimaCarga={ultimaCarga} />
        </div>
        <CardPontoOperacional />
      </div>
      <ComentariosNovosCard />
      <ProximoEventoCard />
      <MuralBlocoTopo />
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Erro ao carregar: {error}
        </div>
      )}
      {loading && !itens.length ? (
        <div className="grid gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        view
      )}
    </div>
  );
}
