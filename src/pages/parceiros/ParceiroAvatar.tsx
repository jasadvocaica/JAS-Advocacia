import { iniciais } from "./types";
import { cn } from "@/lib/utils";

interface Props {
  nome: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZE: Record<string, string> = {
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-14 h-14 text-base",
  xl: "w-20 h-20 text-xl",
};

export function ParceiroAvatar({ nome, size = "md", className }: Props) {
  return (
    <div
      className={cn(
        "rounded-full bg-sidebar text-gold flex items-center justify-center font-display shrink-0 border border-gold/30",
        SIZE[size],
        className,
      )}
      aria-hidden
    >
      {iniciais(nome) || "?"}
    </div>
  );
}
