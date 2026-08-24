import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import type { DesempenhoMembro } from "../hooks/useDashboardGestorData";

const PALETA = ["bg-success/20 text-success", "bg-warning/20 text-warning", "bg-primary/20 text-primary"];

function iniciais(nome: string) {
  return nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function DesempenhoEquipe({ equipe }: { equipe: DesempenhoMembro[] }) {
  return (
    <Card className="flex h-full flex-col p-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground">Desempenho da equipe</h3>
      {equipe.length === 0 ? (
        <p className="my-auto text-center text-sm text-muted-foreground">
          Dados disponíveis após 1ª semana de uso
        </p>
      ) : (
        <ul className="space-y-3">
          {equipe.map((m, idx) => (
            <li key={m.user_id} className="space-y-2">
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className={PALETA[idx % PALETA.length]}>
                    {iniciais(m.nome)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{m.nome}</div>
                  <div className="text-xs text-muted-foreground">Estagiária</div>
                </div>
                <span className="text-xs font-semibold tabular-nums text-foreground">
                  {m.taxaCumprimento}%
                </span>
              </div>
              <div className="flex gap-3 pl-12 text-[11px] text-muted-foreground">
                <span><span className="font-semibold text-success">{m.concluidos}</span> concluídas</span>
                <span><span className="font-semibold text-foreground">{m.emAndamento}</span> em andamento</span>
                <span><span className="font-semibold text-destructive">{m.atrasadas}</span> atrasadas</span>
              </div>
              <Progress value={m.taxaCumprimento} className="h-1 ml-12" />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
