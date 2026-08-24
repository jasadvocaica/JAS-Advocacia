import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Sparkles, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { FichaAtendimentoConteudo } from "../FichaAtendimentoConteudo";

interface Props {
  atendimentoId: string;
  clienteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}

export function FichaAtendimentoSheet({
  atendimentoId,
  clienteId,
  open,
  onOpenChange,
  onChanged,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[min(900px,100vw)] sm:max-w-none flex flex-col p-0">
        <SheetHeader className="px-5 py-4 border-b">
          <div className="flex items-center justify-between gap-2">
            <div>
              <SheetTitle className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" /> Ficha de atendimento
              </SheetTitle>
              <SheetDescription>
                Documentos, análise da Bia e conversão em processo ou diligência.
              </SheetDescription>
            </div>
            <Button asChild variant="outline" size="sm" className="gap-1">
              <Link to={`/atendimentos/${atendimentoId}`} onClick={() => onOpenChange(false)}>
                <ExternalLink className="w-3.5 h-3.5" /> Abrir página
              </Link>
            </Button>
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-5">
          {open && (
            <FichaAtendimentoConteudo
              atendimentoId={atendimentoId}
              clienteId={clienteId}
              onChanged={onChanged}
              onClose={() => onOpenChange(false)}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
