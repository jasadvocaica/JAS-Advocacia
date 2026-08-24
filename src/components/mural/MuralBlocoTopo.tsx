import { Link } from "react-router-dom";
import { Megaphone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useMuralAvisos } from "@/hooks/useMuralAvisos";
import { CardAviso } from "./CardAviso";

export function MuralBlocoTopo() {
  const { avisos, naoLidos, ehLido, marcarLido, loading } = useMuralAvisos();

  if (loading && !avisos.length) return null;

  const visiveis = avisos.slice(0, 3);
  if (!visiveis.length) return null;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-sm">Mural de avisos</h2>
          {naoLidos > 0 && (
            <span className="rounded-full bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0.5 font-bold">
              {naoLidos} {naoLidos === 1 ? "novo" : "novos"}
            </span>
          )}
        </div>
        <Button asChild variant="ghost" size="sm" className="text-xs h-7">
          <Link to="/mural-avisos">Ver todos</Link>
        </Button>
      </div>
      <div className="grid gap-2">
        {visiveis.map((a) => (
          <CardAviso
            key={a.id}
            aviso={a}
            lido={ehLido(a)}
            onMarcarLido={marcarLido}
            resumido
          />
        ))}
      </div>
    </Card>
  );
}
