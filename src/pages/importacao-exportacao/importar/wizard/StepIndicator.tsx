interface Props {
  passoAtual: 1 | 2 | 3 | 4;
}

const PASSOS = [
  { num: "01", label: "Upload" },
  { num: "02", label: "Mapeamento" },
  { num: "03", label: "Validação" },
  { num: "04", label: "Finalização" },
];

/**
 * Indicador de etapas do wizard de importação — estilo "Auditoria Legal".
 * Linha horizontal contínua com 4 marcadores; o ativo recebe fundo gold.
 */
export function StepIndicator({ passoAtual }: Props) {
  return (
    <nav className="flex justify-between relative mt-2">
      <div className="absolute top-4 left-0 w-full h-px bg-border -z-10" />
      {PASSOS.map((p, idx) => {
        const num = idx + 1;
        const ativo = num === passoAtual;
        const concluido = num < passoAtual;
        return (
          <div
            key={p.num}
            className={`flex items-center gap-3 bg-background ${
              idx === 0 ? "pr-4" : idx === PASSOS.length - 1 ? "pl-4" : "px-4"
            } ${!ativo && !concluido ? "opacity-40" : ""}`}
          >
            <span
              className={`size-8 rounded-full border flex items-center justify-center text-xs font-semibold ${
                ativo
                  ? "border-gold bg-gold text-gold-foreground"
                  : concluido
                    ? "border-foreground bg-foreground text-background"
                    : "border-foreground"
              }`}
            >
              {p.num}
            </span>
            <span
              className={`text-xs sm:text-sm font-semibold uppercase tracking-tight ${
                ativo ? "text-gold" : ""
              }`}
            >
              {p.label}
            </span>
          </div>
        );
      })}
    </nav>
  );
}
