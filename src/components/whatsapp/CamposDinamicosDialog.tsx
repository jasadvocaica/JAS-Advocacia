import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export interface TipoCampos {
  name: string;
  label: string;
  type: "text" | "textarea" | "date" | "number" | "select";
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  titulo: string;
  campos: TipoCampos[];
  initialValues?: Record<string, any>;
  onConfirmar: (valores: Record<string, any>) => void;
}

export function CamposDinamicosDialog({ open, onOpenChange, titulo, campos, initialValues, onConfirmar }: Props) {
  const [valores, setValores] = useState<Record<string, any>>(initialValues || {});

  useEffect(() => {
    if (open) setValores(initialValues || {});
  }, [open]);

  const setVal = (name: string, value: any) => setValores((prev) => ({ ...prev, [name]: value }));

  const confirmar = () => {
    for (const c of campos) {
      if (c.required && (valores[c.name] === undefined || valores[c.name] === "" || valores[c.name] === null)) {
        toast.error(`Preencha: ${c.label}`);
        return;
      }
    }
    onConfirmar(valores);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {campos.map((c) => (
            <div key={c.name} className="space-y-1.5">
              <Label htmlFor={c.name} className="text-xs">
                {c.label}{c.required && <span className="text-destructive ml-0.5">*</span>}
              </Label>
              {c.type === "textarea" && (
                <Textarea
                  id={c.name} rows={3} value={valores[c.name] ?? ""}
                  onChange={(e) => setVal(c.name, e.target.value)}
                  placeholder={c.placeholder}
                />
              )}
              {c.type === "select" && (
                <Select value={valores[c.name] ?? ""} onValueChange={(v) => setVal(c.name, v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {c.options?.map((o) => (
                      <SelectItem key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {(c.type === "text" || c.type === "date" || c.type === "number") && (
                <Input
                  id={c.name} type={c.type} value={valores[c.name] ?? ""}
                  onChange={(e) => setVal(c.name, e.target.value)}
                  placeholder={c.placeholder}
                  step={c.type === "number" ? "0.01" : undefined}
                />
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={confirmar} style={{ background: "#25D366", color: "white" }}>Gerar mensagem</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
