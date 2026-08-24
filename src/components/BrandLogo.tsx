import { cn } from "@/lib/utils";
import { useBrandingLogo } from "@/hooks/useBrandingLogo";

type Variant = "auto" | "dark" | "light";

interface BrandLogoProps {
  variant?: Variant;
  className?: string;
  /** Altura do bloco (Tailwind classe), ex: "h-16", "h-20", "h-44" */
  size?: string;
  showTagline?: boolean;
  taglineClassName?: string;
  /**
   * Se true, ignora a logo customizada salva nas configurações e usa
   * sempre o fallback textual. Útil para a tela de Login/Auth.
   */
  forceDefault?: boolean;
}

/**
 * BrandLogo — exibe a identidade visual do escritório.
 *
 * - Se houver uma logo customizada salva em `configuracoes_sistema`
 *   (Configurações → Escritório → logo_url), exibe a imagem.
 * - Caso contrário, exibe o nome do escritório em texto estilizado
 *   (Juliana Araujo • Advocacia & Assessoria Jurídica).
 */
export function BrandLogo({
  variant = "auto",
  className,
  size = "h-20",
  showTagline = false,
  taglineClassName,
  forceDefault = false,
}: BrandLogoProps) {
  const resolved: Exclude<Variant, "auto"> = variant === "auto" ? "light" : variant;
  const { logoUrl } = useBrandingLogo();

  const usandoCustom = !forceDefault && Boolean(logoUrl);

  const isDark = resolved === "dark";

  return (
    <div className={cn("flex flex-col items-center gap-2 text-center", className)}>
      {usandoCustom ? (
        <img
          src={logoUrl as string}
          alt="Logotipo do escritório"
          className={cn(size, "w-auto object-contain")}
        />
      ) : (
        <div className="flex flex-col items-center gap-1 px-2 py-1">
          <span
            className={cn(
              "font-display font-semibold leading-tight tracking-wide text-xl sm:text-2xl",
              isDark ? "text-white" : "text-primary",
            )}
          >
            Juliana Araujo
          </span>
          <span
            className={cn(
              "h-px w-10",
              isDark ? "bg-white/50" : "bg-gold",
            )}
          />
          <span
            className={cn(
              "text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.25em]",
              isDark ? "text-white/85" : "text-gold-dark",
            )}
          >
            Advocacia &amp; Assessoria Jurídica
          </span>
        </div>
      )}

      {showTagline && !usandoCustom === false && (
        <p
          className={cn(
            "text-[10px] tracking-[0.3em] uppercase font-semibold",
            isDark ? "text-sidebar-foreground/70" : "text-muted-foreground",
            taglineClassName,
          )}
        >
          Advocacia &amp; Assessoria
        </p>
      )}
    </div>
  );
}

export default BrandLogo;
