// Faixa fixa exibida quando o gestor está visualizando um portal em modo preview.
import { useNavigate } from "react-router-dom";
import { Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePreviewMode } from "@/contexts/PreviewModeContext";

export function PreviewBanner() {
  const { preview, sairPreview } = usePreviewMode();
  const navigate = useNavigate();

  if (!preview) return null;

  const sair = () => {
    sairPreview();
    navigate("/", { replace: true });
  };

  const escopo =
    preview.tipo === "parceiro"
      ? "o portal do parceiro"
      : preview.tipo === "cliente"
      ? "o portal do cliente"
      : "como membro da equipe";

  return (
    <div className="sticky top-0 z-50 w-full bg-amber-500 text-amber-950 border-b border-amber-700 shadow-sm">
      <div className="px-4 sm:px-6 py-1.5 flex items-center justify-between gap-3 text-sm font-medium">
        <div className="flex items-center gap-2 min-w-0">
          <Eye className="w-4 h-4 shrink-0" />
          <div className="min-w-0">
            <p className="truncate leading-tight">
              Modo visualização — você está vendo {escopo}{" "}
              <strong className="font-semibold">{preview.nome}</strong>
            </p>
            {preview.tipo === "estagiaria" && (
              <p className="text-[11px] leading-tight text-amber-900/80">
                Menus e permissões refletem o usuário simulado. Os dados continuam carregados com a sua sessão.
              </p>
            )}
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 text-amber-950 hover:bg-amber-600/40 hover:text-amber-950"
          onClick={sair}
        >
          <X className="w-3.5 h-3.5" /> Sair do preview
        </Button>
      </div>
    </div>
  );
}
