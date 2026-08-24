import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TipoItem, TIPO_LABELS, TIPO_CLASS, TIPO_ICON } from "./types";

interface Props {
  tipo: TipoItem;
  size?: "sm" | "md";
  iconOnly?: boolean;
  className?: string;
}

export function TipoBadge({ tipo, size = "sm", iconOnly = false, className }: Props) {
  const Icon = TIPO_ICON[tipo];
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 font-medium border",
        TIPO_CLASS[tipo],
        size === "sm" ? "text-xs px-1.5 py-0.5" : "text-sm px-2 py-1",
        className,
      )}
    >
      <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {!iconOnly && <span>{TIPO_LABELS[tipo]}</span>}
    </Badge>
  );
}
