import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface StatusOption {
  id: string;
  nome: string;
  cor: string;
  tipo_processo: string; // "ambos" | "judicial" | "administrativo"
}

interface BaseProps {
  status: string | null | undefined;
  options: StatusOption[];
  className?: string;
  size?: "sm" | "md";
}

interface StaticProps extends BaseProps {
  editable?: false;
}

interface EditableProps extends BaseProps {
  editable: true;
  tipoProcesso: "judicial" | "administrativo";
  onChange: (novo: string) => Promise<void> | void;
}

type Props = StaticProps | EditableProps;

const SIZE_CLS = {
  sm: "h-5 px-1.5 text-[10px] gap-1",
  md: "h-7 px-2.5 text-xs gap-1.5",
};

function styleFromColor(cor: string): React.CSSProperties {
  return {
    backgroundColor: `${cor}1a`,
    color: cor,
    borderColor: `${cor}55`,
  };
}

const VAZIO_COR = "#A32D2D";

export function StatusBadge(props: Props) {
  const { status, options, className, size = "md" } = props;
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  const opt = status ? options.find((o) => o.nome === status) : null;
  const cor = opt?.cor ?? VAZIO_COR;
  const label = status || "Preencher status";
  const isVazio = !status;

  const inner = (
    <span
      className={cn(
        "inline-flex items-center rounded-md border font-medium leading-none whitespace-nowrap transition-colors duration-150",
        SIZE_CLS[size],
        className,
      )}
      style={styleFromColor(cor)}
    >
      {isVazio && <AlertTriangle className="w-3 h-3" />}
      {label}
      {props.editable && !saving && <ChevronDown className="w-3 h-3 opacity-70" />}
      {saving && <Loader2 className="w-3 h-3 animate-spin" />}
    </span>
  );

  if (!props.editable) return inner;

  const candidatos = options.filter(
    (o) => o.tipo_processo === "ambos" || o.tipo_processo === props.tipoProcesso,
  );

  const handleSelect = async (nome: string) => {
    if (nome === status) {
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      await props.onChange(nome);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="cursor-pointer hover:brightness-110 active:scale-[0.98] transition disabled:cursor-wait"
          disabled={saving}
          aria-label={`Status atual: ${label}. Clique para alterar.`}
        >
          {inner}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-1 w-64">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1.5">
          Alterar status
        </div>
        <div className="max-h-72 overflow-y-auto">
          {candidatos.map((o) => {
            const ativo = o.nome === status;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => handleSelect(o.nome)}
                className={cn(
                  "w-full flex items-center justify-between gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted text-left",
                  ativo && "bg-muted/60",
                )}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: o.cor }}
                  />
                  <span className="truncate">{o.nome}</span>
                </span>
                {ativo && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
