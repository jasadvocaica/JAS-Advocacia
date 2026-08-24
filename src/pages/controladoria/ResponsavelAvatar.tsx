import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { iniciaisDe, corAvatar } from "@/pages/controladoria/equipe";

interface Props {
  nome: string | null | undefined;
  id?: string | null;
  size?: "xs" | "sm" | "md";
  showTooltip?: boolean;
  className?: string;
}

const SIZE: Record<NonNullable<Props["size"]>, string> = {
  xs: "w-5 h-5 text-[9px]",
  sm: "w-6 h-6 text-[10px]",
  md: "w-8 h-8 text-xs",
};

export function ResponsavelAvatar({ nome, id, size = "sm", showTooltip = true, className }: Props) {
  const cor = id ? corAvatar(id) : "bg-muted text-muted-foreground";
  const iniciais = iniciaisDe(nome);
  const node = (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold ring-1 ring-border shrink-0 select-none",
        SIZE[size],
        cor,
        className,
      )}
      aria-label={nome ?? "Sem responsável"}
    >
      {iniciais}
    </span>
  );
  if (!showTooltip) return node;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{node}</TooltipTrigger>
        <TooltipContent side="top">{nome ?? "Sem responsável"}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
