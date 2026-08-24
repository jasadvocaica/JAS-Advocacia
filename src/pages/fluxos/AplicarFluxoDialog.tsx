import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Workflow } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  processoId?: string | null;
  clienteId?: string | null;
  onSuccess?: () => void;
}

export function AplicarFluxoDialog({ open, onOpenChange, processoId, clienteId, onSuccess }: Props) {
  const [templates, setTemplates] = useState<{ id: string; nome: string; gatilho: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [templateId, setTemplateId] = useState<string>("");
  const [dataGatilho, setDataGatilho] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    (supabase as any)
      .from("fluxos_templates")
      .select("id, nome, gatilho")
      .eq("ativo", true)
      .order("nome")
      .then(({ data }: any) => {
        setTemplates(data ?? []);
        setLoading(false);
      });
  }, [open]);

  const aplicar = async () => {
    if (!templateId) return toast.error("Selecione um fluxo");
    setAplicando(true);
    const { data, error } = await (supabase as any).rpc("instanciar_fluxo", {
      _template_id: templateId,
      _data_gatilho: dataGatilho,
      _processo_id: processoId ?? null,
      _cliente_id: clienteId ?? null,
    });
    setAplicando(false);
    if (error) return toast.error("Erro ao aplicar fluxo: " + error.message);
    toast.success("Fluxo aplicado! Etapas criadas na controladoria.");
    onOpenChange(false);
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Workflow className="w-5 h-5" /> Aplicar fluxo</DialogTitle>
          <DialogDescription>
            Todas as etapas do fluxo serão criadas como itens da controladoria, com prazos calculados a partir da data de referência.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Fluxo *</Label>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>
            ) : (
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger><SelectValue placeholder="Selecione um fluxo ativo" /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          <div>
            <Label>Data do gatilho *</Label>
            <Input type="date" value={dataGatilho} onChange={(e) => setDataGatilho(e.target.value)} />
            <p className="text-xs text-muted-foreground mt-1">Os prazos serão calculados a partir desta data.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={aplicar} disabled={aplicando || !templateId}>
            {aplicando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Aplicar fluxo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
