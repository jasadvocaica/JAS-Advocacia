import { forwardRef, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface LogoUploaderProps {
  /** URL atual (vinda das configurações) */
  value: string;
  /** Chamado quando a URL muda (após upload ou remoção) */
  onChange: (novaUrl: string) => void;
  /** Texto do label */
  label?: string;
}

/**
 * Uploader de logo do escritório. Envia o arquivo para o bucket público
 * `branding` e devolve a URL pública. Permite também colar uma URL externa
 * manualmente (caso o escritório hospede a imagem em outro lugar).
 */
export const LogoUploader = forwardRef<HTMLDivElement, LogoUploaderProps>(function LogoUploader(
  { value, onChange, label = "Logotipo do menu" },
  forwardedRef,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleArquivo(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem (PNG, JPG, SVG…)");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx. 4 MB)");
      return;
    }

    setEnviando(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("branding")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      const { data } = supabase.storage.from("branding").getPublicUrl(path);
      onChange(data.publicUrl);
      toast.success("Logo enviada com sucesso");
    } catch (err) {
      console.error("[LogoUploader] erro:", err);
      toast.error("Falha ao enviar a logo", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div ref={forwardedRef} className="space-y-2 md:col-span-2">
      <Label>{label}</Label>
      <div className="flex items-start gap-4">
        {/* Preview com o mesmo fundo escuro do menu */}
        <div className="shrink-0 w-44 h-44 rounded-md bg-sidebar flex items-center justify-center p-2 border border-border">
          {value ? (
            <img
              src={value}
              alt="Pré-visualização da logo"
              className="max-h-full max-w-full object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <span className="text-xs text-sidebar-foreground/60 text-center px-2">
              Nenhuma logo customizada — o sistema usará a padrão.
            </span>
          )}
        </div>

        <div className="flex-1 space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleArquivo(f);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={enviando}
            >
              {enviando ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              {enviando ? "Enviando…" : "Enviar imagem"}
            </Button>
            {value && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange("")}
                disabled={enviando}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Remover
              </Button>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="logo_url_input" className="text-xs text-muted-foreground">
              Ou cole uma URL externa
            </Label>
            <Input
              id="logo_url_input"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="https://…"
              className="text-xs"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Recomendado: PNG transparente, proporção quadrada, mínimo 400×400 px.
            Aparece no topo do menu lateral em todas as telas.
          </p>
        </div>
      </div>
    </div>
  );
});
