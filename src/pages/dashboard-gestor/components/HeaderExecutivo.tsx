import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { LayoutDashboard } from "lucide-react";
import { AutoRefreshControl } from "@/components/AutoRefreshControl";

interface Props {
  ultimaCarga: Date | null;
  onRefresh: () => void;
  loading: boolean;
}

export function HeaderExecutivo({ ultimaCarga, onRefresh, loading }: Props) {
  const [agora, setAgora] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 pb-2">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <LayoutDashboard className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Painel executivo</h1>
          <p className="text-xs text-muted-foreground">
            JAS Advocacia ·{" "}
            {agora.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline" className="gap-2 border-success/50 bg-success/10 text-success">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
          ao vivo
        </Badge>
        <AutoRefreshControl
          ultimaCarga={ultimaCarga}
          onRefresh={onRefresh}
          loading={loading}
          storageKey="auto-refresh-dashboard-gestor"
        />
      </div>
    </header>
  );
}
