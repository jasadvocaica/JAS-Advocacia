import { Card } from "@/components/ui/card";
import { AutoRefreshControl } from "@/components/AutoRefreshControl";

interface Props {
  nome: string;
  papel: string;
  loading?: boolean;
  onRefresh: () => void;
  ultimaCarga: Date | null;
}

export function HeaderPainel({ nome, papel, loading, onRefresh, ultimaCarga }: Props) {
  const agora = new Date();
  const hora = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dia = agora.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  const cumprimento =
    agora.getHours() < 12 ? "Bom dia" : agora.getHours() < 18 ? "Boa tarde" : "Boa noite";

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <h1 className="font-display text-2xl text-foreground">
          {cumprimento}, {nome.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground">
          {papel} · {dia} · {hora}
        </p>
      </div>
      <AutoRefreshControl
        ultimaCarga={ultimaCarga}
        onRefresh={onRefresh}
        loading={loading}
        storageKey="auto-refresh-painel-operacional"
      />
    </Card>
  );
}
