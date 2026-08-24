import { useState } from "react";
import { Pin, Megaphone, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MuralAviso, Prioridade } from "@/hooks/useMuralAvisos";

interface Props {
  aviso: MuralAviso;
  lido: boolean;
  onMarcarLido: (id: string) => void;
  onEditar?: (a: MuralAviso) => void;
  onExcluir?: (id: string) => void;
  onVerLeituras?: (a: MuralAviso) => void;
  podeAdmin?: boolean;
  resumido?: boolean;
}

const ESTILO: Record<Prioridade, { card: string; badge: string; label: string }> = {
  urgente: {
    card: "bg-destructive/5 border-destructive/40",
    badge: "bg-destructive text-destructive-foreground",
    label: "URGENTE",
  },
  normal: {
    card: "bg-card border-border",
    badge: "bg-primary/15 text-primary border-primary/30",
    label: "AVISO",
  },
  informativo: {
    card: "bg-background border-border",
    badge: "bg-muted text-muted-foreground",
    label: "INFO",
  },
};

function tempoRelativo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `há ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  if (diff < 86400 * 30) return `há ${Math.floor(diff / 86400)}d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function CardAviso({
  aviso,
  lido,
  onMarcarLido,
  onEditar,
  onExcluir,
  onVerLeituras,
  podeAdmin,
  resumido,
}: Props) {
  const [expandido, setExpandido] = useState(!resumido);
  const est = ESTILO[aviso.prioridade];

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-all",
        est.card,
        !lido && "border-l-4 border-l-primary"
      )}
    >
      <div className="flex items-start gap-2">
        {aviso.fixado && <Pin className="h-3.5 w-3.5 mt-1 text-primary shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <Badge className={cn("text-[10px] font-bold px-1.5 py-0", est.badge)}>
              {est.label}
            </Badge>
            <h3 className="font-semibold text-sm text-foreground truncate flex-1">
              {aviso.titulo}
            </h3>
            {!lido && <span className="h-2 w-2 rounded-full bg-primary shrink-0" aria-label="não lido" />}
          </div>
          <p className="text-xs text-muted-foreground mb-1.5">
            Dra. Juliana · {tempoRelativo(aviso.criado_em)}
          </p>
          <p
            className={cn(
              "text-sm text-foreground/90 whitespace-pre-wrap",
              !expandido && "line-clamp-2"
            )}
          >
            {aviso.conteudo}
          </p>
          {resumido && aviso.conteudo.length > 100 && (
            <button
              onClick={() => setExpandido((v) => !v)}
              className="text-xs text-primary hover:underline mt-1"
            >
              {expandido ? "Recolher" : "Ler mais"}
            </button>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {!lido && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onMarcarLido(aviso.id)}>
                <Check className="h-3 w-3 mr-1" /> Marcar lido
              </Button>
            )}
            {podeAdmin && onVerLeituras && (
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onVerLeituras(aviso)}>
                <Megaphone className="h-3 w-3 mr-1" /> Leituras
              </Button>
            )}
            {podeAdmin && onEditar && (
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onEditar(aviso)}>
                Editar
              </Button>
            )}
            {podeAdmin && onExcluir && (
              <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => onExcluir(aviso.id)}>
                Excluir
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
