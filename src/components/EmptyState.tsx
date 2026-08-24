import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface EmptyStateAction {
  label: string;
  onClick?: () => void;
  to?: string;
  variant?: "gold" | "outline" | "default" | "secondary";
  icon?: LucideIcon;
}

interface Props {
  icon: LucideIcon;
  title: string;
  description?: string;
  actions?: EmptyStateAction[];
  className?: string;
  size?: "sm" | "md";
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actions,
  className,
  size = "md",
}: Props) {
  const padding = size === "sm" ? "py-8" : "py-12";
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center px-6 gap-3",
        padding,
        className,
      )}
    >
      <Icon className="w-10 h-10 text-muted-foreground/60" strokeWidth={1.5} />
      <div className="space-y-1 max-w-sm">
        <p className="text-[15px] font-medium text-foreground">{title}</p>
        {description && (
          <p className="text-[13px] text-muted-foreground leading-relaxed">{description}</p>
        )}
      </div>
      {actions && actions.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center pt-1">
          {actions.map((a, i) => {
            const ActionIcon = a.icon;
            const content = (
              <>
                {ActionIcon && <ActionIcon className="w-4 h-4" />}
                {a.label}
              </>
            );
            if (a.to) {
              return (
                <Button key={i} asChild variant={a.variant ?? (i === 0 ? "gold" : "outline")} size="sm">
                  <a href={a.to}>{content}</a>
                </Button>
              );
            }
            return (
              <Button
                key={i}
                onClick={a.onClick}
                variant={a.variant ?? (i === 0 ? "gold" : "outline")}
                size="sm"
              >
                {content}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
