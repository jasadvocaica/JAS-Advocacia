import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Copy, Check, MessageCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { whatsappLinkComTexto } from "@/lib/whatsapp-mensagens";
import { cn } from "@/lib/utils";

export interface MensagemItem {
  id: string;
  nome: string;
  whatsapp?: string | null;
  mensagem: string;
}

interface WhatsAppMsgModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titulo?: string;
  mensagens: MensagemItem[];
}

// Renderiza *negrito* e _itálico_ como <strong>/<em>
function renderWhatsAppText(texto: string) {
  const linhas = texto.split("\n");
  return linhas.map((linha, i) => {
    // Escape HTML primeiro
    const safe = linha
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const comBold = safe.replace(/\*([^*\n]+)\*/g, "<strong>$1</strong>");
    const comItal = comBold.replace(/_([^_\n]+)_/g, "<em>$1</em>");
    return (
      <span key={i}>
        <span dangerouslySetInnerHTML={{ __html: comItal }} />
        {i < linhas.length - 1 && <br />}
      </span>
    );
  });
}

export function WhatsAppMsgModal({ open, onOpenChange, titulo, mensagens }: WhatsAppMsgModalProps) {
  const [activeId, setActiveId] = useState(mensagens[0]?.id ?? "");
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (mensagens.length && !mensagens.find((m) => m.id === activeId)) {
      setActiveId(mensagens[0].id);
    }
  }, [mensagens, activeId]);

  const atual = useMemo(
    () => mensagens.find((m) => m.id === activeId) ?? mensagens[0],
    [mensagens, activeId]
  );

  if (!atual) return null;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(atual.mensagem);
      setCopiado(true);
      toast.success("Mensagem copiada");
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const linkWa = whatsappLinkComTexto(atual.whatsapp ?? undefined, atual.mensagem);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="w-4 h-4" />
            {titulo || "Mensagem WhatsApp"}
          </DialogTitle>
        </DialogHeader>

        {mensagens.length > 1 && (
          <Tabs value={activeId} onValueChange={(v) => { setActiveId(v); setCopiado(false); }}>
            <TabsList className="w-full justify-start rounded-none h-auto bg-transparent border-b px-2 overflow-x-auto flex-nowrap">
              {mensagens.map((m) => (
                <TabsTrigger
                  key={m.id}
                  value={m.id}
                  className="text-xs data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none whitespace-nowrap"
                >
                  {m.nome}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        {/* Preview estilo WhatsApp */}
        <div className="px-3 py-3">
          <div className="rounded-xl overflow-hidden border" style={{ background: "#ECE5DD" }}>
            <div className="flex items-center gap-2.5 px-3.5 py-2.5" style={{ background: "#075E54" }}>
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium text-white shrink-0"
                style={{ background: "#25D366" }}
              >
                {atual.nome?.charAt(0).toUpperCase() || "?"}
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-white truncate">{atual.nome}</div>
                {atual.whatsapp && (
                  <div className="text-[11px] text-white/70 truncate">{atual.whatsapp}</div>
                )}
              </div>
            </div>
            <div className="p-3">
              <div
                className="rounded-lg px-3 py-2.5 text-[13px] leading-relaxed max-h-[40vh] overflow-y-auto"
                style={{ background: "#E7FFDB", color: "#111", borderRadius: "8px 8px 0 8px" }}
              >
                {renderWhatsAppText(atual.mensagem)}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 px-3 pb-4">
          <Button
            onClick={copiar}
            className={cn("w-full text-white", copiado ? "bg-green-700 hover:bg-green-700" : "")}
            style={!copiado ? { background: "#25D366" } : undefined}
          >
            {copiado ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                Copiado!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 mr-2" />
                Copiar mensagem
              </>
            )}
          </Button>

          {linkWa && (
            <Button asChild variant="outline" className="w-full">
              <a href={linkWa} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 mr-2" />
                Abrir no WhatsApp
              </a>
            </Button>
          )}

          {atual.whatsapp ? (
            <p className="text-xs text-center text-muted-foreground">
              Enviar para: <span className="font-medium">{atual.whatsapp}</span>
            </p>
          ) : (
            <p className="text-xs text-center text-muted-foreground">
              Nenhum WhatsApp cadastrado — copie e cole no grupo/conversa
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
