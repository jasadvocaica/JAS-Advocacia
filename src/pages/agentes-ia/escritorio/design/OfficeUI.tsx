import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
export function OfficeStatus({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "working";
}) {
  return (
    <span className={cn("op-status", `op-status-${tone}`)}>
      <i aria-hidden />
      {children}
    </span>
  );
}
export function OfficePanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("op-panel", className)}>{children}</div>;
}
export function OfficeEmpty({
  icon: Icon,
  title,
  children,
}: {
  icon?: React.ElementType;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="op-empty">
      {Icon && (
        <span className="op-empty-icon">
          <Icon size={22} />
        </span>
      )}
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
