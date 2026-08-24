import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { converterDocxParaHtml } from "./docx-converter";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Alert, AlertDescription, AlertTitle,
} from "@/components/ui/alert";
import {
  Upload, Loader2, FileText, AlertTriangle, CheckCircle2, FileWarning,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sanitizarHtmlDocumento } from "@/lib/documentos-html-sanitize";
import { useAuth } from "@/contexts/AuthContext";
import {
  AREAS_LABEL, CATEGORIAS_LABEL, DocAreaDireito, DocCategoria,
} from "@/pages/documentos/types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

type Etapa = "upload" | "convertendo" | "revisar" | "salvando";

/** Detecta variáveis no formato {{nome_da_variavel}} dentro do HTML/texto. */
function detectarVariaveis(html: string): string[] {
  const set = new Set<string>();
  const re = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    set.add(m[1].toLowerCase());
  }
  return Array.from(set).sort();
}

/** Tenta inferir categoria pelo nome do arquivo. */
function inferirCategoria(nome: string): DocCategoria {
  const n = nome.toLowerCase();
  if (n.includes("recurso") || n.includes("apelaç") || n.includes("agravo")) return "recurso";
  if (n.includes("contrato") || n.includes("honor")) return "contrato";
  if (n.includes("procuraç")) return "procuracao";
  if (n.includes("manifest") || n.includes("réplica") || n.includes("replica")) return "manifestacao";
  if (n.includes("inss") || n.includes("administrativo") || n.includes("requerimento")) return "administrativo_inss";
  if (n.includes("quesito")) return "quesitos";
  if (n.includes("notific")) return "notificacao";
  if (n.includes("inicial") || n.includes("petiç")) return "peticao_inicial";
  return "outro";
}

function inferirArea(nome: string): DocAreaDireito {
  const n = nome.toLowerCase();
  if (n.includes("previd") || n.includes("inss") || n.includes("aposent") || n.includes("auxilio") || n.includes("auxílio")) return "previdenciario";
  if (n.includes("famil") || n.includes("famíl") || n.includes("divorcio") || n.includes("divórcio") || n.includes("alimentos")) return "familia";
  if (n.includes("trabalh")) return "trabalhista";
  if (n.includes("tribut")) return "tributario";
  if (n.includes("consumid") || n.includes("cdc")) return "consumidor";
  if (n.includes("civil")) return "civil";
  return "geral";
}

/**
 * Importa arquivos .docx como modelos de petição.
 * Fluxo: upload → mammoth converte para HTML → detecta {{variaveis}} → usuário ajusta metadados → salva em doc_modelos.
 */
export function ImportarDocxDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [etapa, setEtapa] = useState<Etapa>("upload");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState<DocCategoria>("outro");
  const [area, setArea] = useState<DocAreaDireito>("geral");
  const [html, setHtml] = useState<string>("");
  const [variaveis, setVariaveis] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Reset ao abrir
  useEffect(() => {
    if (!open) return;
    setEtapa("upload");
    setArquivo(null);
    setTitulo("");
    setDescricao("");
    setCategoria("outro");
    setArea("geral");
    setHtml("");
    setVariaveis([]);
    setWarnings([]);
  }, [open]);

  async function handleArquivo(file: File) {
    if (!file.name.toLowerCase().endsWith(".docx")) {
      toast.error("Somente arquivos .docx são suportados", {
        description: "Para .doc antigos, abra no Word e salve como .docx.",
      });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande", { description: "Limite de 10 MB." });
      return;
    }

    setArquivo(file);
    setEtapa("convertendo");

    try {
      const buffer = await file.arrayBuffer();
      const { html: htmlBruto, warnings } = await converterDocxParaHtml(buffer);
      const htmlGerado = sanitizarHtmlDocumento(htmlBruto);
      const vars = detectarVariaveis(htmlGerado);

      setHtml(htmlGerado);
      setVariaveis(vars);
      setWarnings(warnings.slice(0, 5));

      // Pré-preenche metadados a partir do nome
      const nomeBase = file.name.replace(/\.docx$/i, "");
      setTitulo(nomeBase);
      setCategoria(inferirCategoria(nomeBase));
      setArea(inferirArea(nomeBase));

      setEtapa("revisar");
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível ler o arquivo", {
        description: e instanceof Error ? e.message : "Erro desconhecido",
      });
      setEtapa("upload");
      setArquivo(null);
    }
  }

  async function salvar() {
    if (!titulo.trim()) {
      toast.error("Informe o título do modelo");
      return;
    }
    setEtapa("salvando");
    const { data, error } = await supabase
      .from("doc_modelos")
      .insert({
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        categoria,
        area_direito: area,
        conteudo_html: html,
        variaveis_usadas: variaveis,
        criado_por: user?.id ?? null,
        ativo: true,
      })
      .select("id")
      .single();

    if (error) {
      toast.error("Falha ao salvar o modelo", { description: error.message });
      setEtapa("revisar");
      return;
    }

    toast.success("Modelo importado com sucesso", {
      description: variaveis.length
        ? `${variaveis.length} variável(is) detectada(s)`
        : "Você pode adicionar variáveis no editor",
    });
    onOpenChange(false);
    if (data?.id) navigate(`/documentos/modelos/${data.id}`);
  }

  const previewHtml = useMemo(() => html, [html]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Importar modelo .docx</DialogTitle>
          <DialogDescription>
            Carregue uma petição antiga e ela será convertida em modelo editável.
            Use <code className="text-xs bg-muted px-1 rounded">{"{{nome_da_variavel}}"}</code> no documento
            para criar campos preenchíveis (ex: <code className="text-xs bg-muted px-1 rounded">{"{{nome_cliente}}"}</code>).
          </DialogDescription>
        </DialogHeader>

        {/* ETAPA: UPLOAD */}
        {etapa === "upload" && (
          <div
            className="flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-10 cursor-pointer hover:border-gold/50 transition-colors min-h-[280px]"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) handleArquivo(f);
            }}
          >
            <Upload className="w-10 h-10 text-muted-foreground/60 mb-3" />
            <p className="text-sm font-medium">Clique para escolher ou arraste o arquivo aqui</p>
            <p className="text-xs text-muted-foreground mt-1">.docx até 10 MB</p>
            <input
              ref={inputRef}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleArquivo(f);
              }}
            />
          </div>
        )}

        {/* ETAPA: CONVERTENDO */}
        {etapa === "convertendo" && (
          <div className="flex-1 flex flex-col items-center justify-center min-h-[280px] gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-gold" />
            <p className="text-sm text-muted-foreground">Convertendo {arquivo?.name}…</p>
          </div>
        )}

        {/* ETAPA: REVISAR */}
        {(etapa === "revisar" || etapa === "salvando") && (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* Sucesso */}
            <Alert className="border-success/30 bg-success/5">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <AlertTitle className="text-success">Conversão concluída</AlertTitle>
              <AlertDescription className="text-xs">
                <span className="inline-flex items-center gap-1.5">
                  <FileText className="w-3 h-3" /> {arquivo?.name}
                </span>
                {variaveis.length > 0 ? (
                  <span className="ml-3">· {variaveis.length} variável(is) detectada(s)</span>
                ) : (
                  <span className="ml-3">· Nenhuma variável detectada</span>
                )}
              </AlertDescription>
            </Alert>

            {/* Avisos do mammoth (formatação não suportada etc) */}
            {warnings.length > 0 && (
              <Alert className="border-warning/30 bg-warning/5">
                <FileWarning className="h-4 w-4 text-warning" />
                <AlertTitle className="text-warning">Avisos da conversão</AlertTitle>
                <AlertDescription className="text-xs space-y-0.5 mt-1">
                  {warnings.map((w, i) => <div key={i}>· {w}</div>)}
                </AlertDescription>
              </Alert>
            )}

            {/* Variáveis */}
            <div className="space-y-1.5">
              <Label>Variáveis detectadas</Label>
              {variaveis.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {variaveis.map((v) => (
                    <Badge key={v} variant="secondary" className="font-mono text-[11px]">
                      {`{{${v}}}`}
                    </Badge>
                  ))}
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>
                    Nenhuma variável <code className="bg-muted px-1 rounded">{"{{...}}"}</code> encontrada.
                    Você pode adicioná-las depois no editor.
                  </span>
                </div>
              )}
            </div>

            {/* Metadados */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="m-titulo">Título *</Label>
                <Input
                  id="m-titulo"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ex: Petição inicial — Aposentadoria por idade"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={categoria} onValueChange={(v) => setCategoria(v as DocCategoria)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORIAS_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Área do direito</Label>
                <Select value={area} onValueChange={(v) => setArea(v as DocAreaDireito)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(AREAS_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="m-desc">Descrição (opcional)</Label>
                <Textarea
                  id="m-desc"
                  rows={2}
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Quando usar este modelo…"
                />
              </div>
            </div>

            {/* Preview */}
            <div className="space-y-1.5">
              <Label>Pré-visualização</Label>
              <ScrollArea className="h-56 rounded-md border bg-muted/20 p-3">
                <div
                  className="prose prose-sm max-w-none dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </ScrollArea>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={etapa === "salvando"}>
            Cancelar
          </Button>
          {etapa === "revisar" && (
            <Button variant="gold" onClick={salvar}>
              Importar como modelo
            </Button>
          )}
          {etapa === "salvando" && (
            <Button variant="gold" disabled>
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Salvando…
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
