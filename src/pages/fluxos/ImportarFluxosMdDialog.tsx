import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Upload, FileText, CheckCircle2, AlertCircle, SkipForward } from "lucide-react";
import { toast } from "sonner";

type ResultadoItem = {
  nome: string;
  status: "criado" | "substituido" | "ignorado" | "erro" | "parcial";
  motivo?: string;
  erro?: string;
  etapas?: number;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImportado?: () => void;
}

export function ImportarFluxosMdDialog({ open, onOpenChange, onImportado }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [sobrescrever, setSobrescrever] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{
    total: number;
    criados: number;
    substituidos: number;
    ignorados: number;
    resultados: ResultadoItem[];
  } | null>(null);

  const reset = () => {
    setFile(null);
    setSobrescrever(false);
    setResultado(null);
  };

  const handleClose = (v: boolean) => {
    if (!enviando) {
      if (!v) reset();
      onOpenChange(v);
    }
  };

  const handleEnviar = async () => {
    if (!file) {
      toast.error("Selecione um arquivo .md");
      return;
    }
    setEnviando(true);
    setResultado(null);
    try {
      const markdown = await file.text();
      const { data, error } = await supabase.functions.invoke("fluxos-importar-md", {
        body: { markdown, sobrescrever },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResultado(data);
      toast.success(`Importação concluída · ${data.criados} criado(s), ${data.substituidos} substituído(s)`);
      onImportado?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao importar");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" /> Importar fluxos de Markdown
          </DialogTitle>
          <DialogDescription>
            Envie um arquivo .md descrevendo templates de fluxo. A IA vai extrair os templates e suas etapas
            automaticamente, criando os registros em Fluxos.
          </DialogDescription>
        </DialogHeader>

        {!resultado ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="md-file">Arquivo Markdown (.md)</Label>
              <div className="flex items-center gap-2">
                <input
                  id="md-file"
                  type="file"
                  accept=".md,.markdown,text/markdown,text/plain"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-secondary file:text-secondary-foreground file:cursor-pointer hover:file:bg-secondary/80"
                  disabled={enviando}
                />
              </div>
              {file && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <FileText className="w-3 h-3" /> {file.name} · {(file.size / 1024).toFixed(1)} KB
                </p>
              )}
            </div>

            <div className="flex items-start gap-2">
              <Checkbox
                id="sobrescrever"
                checked={sobrescrever}
                onCheckedChange={(v) => setSobrescrever(v === true)}
                disabled={enviando}
              />
              <div className="space-y-0.5">
                <Label htmlFor="sobrescrever" className="cursor-pointer">Sobrescrever templates existentes</Label>
                <p className="text-xs text-muted-foreground">
                  Se o nome+gatilho já existir, as etapas atuais serão substituídas. Caso contrário, será ignorado.
                </p>
              </div>
            </div>

            <Alert>
              <AlertCircle className="w-4 h-4" />
              <AlertTitle>Como funciona</AlertTitle>
              <AlertDescription className="text-xs">
                A IA (Gemini) lê o documento, identifica cada template descrito, extrai etapas (título, prazo,
                responsável, checklist, comunicação) e grava nas tabelas de Fluxos. Pode levar 30-60s.
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-2">
              <Card label="Total" valor={resultado.total} />
              <Card label="Criados" valor={resultado.criados} cor="text-success" />
              <Card label="Substituídos" valor={resultado.substituidos} cor="text-primary" />
              <Card label="Ignorados" valor={resultado.ignorados} cor="text-muted-foreground" />
            </div>

            <div className="border rounded-md max-h-72 overflow-y-auto divide-y">
              {resultado.resultados.map((r, i) => (
                <div key={i} className="px-3 py-2 flex items-start gap-2 text-sm">
                  <StatusIcon status={r.status} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{r.nome}</div>
                    {r.etapas !== undefined && (
                      <div className="text-xs text-muted-foreground">{r.etapas} etapa(s)</div>
                    )}
                    {(r.erro || r.motivo) && (
                      <div className="text-xs text-muted-foreground">{r.erro ?? r.motivo}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          {resultado ? (
            <>
              <Button variant="outline" onClick={reset} disabled={enviando}>Importar outro</Button>
              <Button onClick={() => handleClose(false)}>Fechar</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => handleClose(false)} disabled={enviando}>Cancelar</Button>
              <Button onClick={handleEnviar} disabled={!file || enviando}>
                {enviando ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processando…</> : <>Importar</>}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Card({ label, valor, cor }: { label: string; valor: number; cor?: string }) {
  return (
    <div className="border rounded-md p-2 text-center">
      <div className={`text-2xl font-semibold ${cor ?? ""}`}>{valor}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function StatusIcon({ status }: { status: ResultadoItem["status"] }) {
  if (status === "criado" || status === "substituido")
    return <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />;
  if (status === "ignorado")
    return <SkipForward className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />;
  return <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />;
}
