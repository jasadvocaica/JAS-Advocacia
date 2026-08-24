import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Upload, Trash2, Loader2, FileImage, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { renderizarPrimeiraPaginaPdfComoPng } from "@/lib/pdf-para-imagem";

interface TimbradoUploaderProps {
  ativo: boolean;
  modo: string;
  cabecalhoUrl: string;
  cabecalhoAlturaMm: string;
  rodapeUrl: string;
  rodapeAlturaMm: string;
  marcaDaguaUrl: string;
  marcaDaguaLarguraMm: string;
  marcaDaguaOpacidade: string;
  paginaInteiraUrl: string;
  paginaInteiraMargemTopoMm: string;
  paginaInteiraMargemBaseMm: string;
  paginaInteiraMargemEsqMm: string;
  paginaInteiraMargemDirMm: string;
  onChange: (chave: string, valor: string) => void;
}

/**
 * Configuração do papel timbrado: liga/desliga + escolha de modo.
 *
 * Dois modos:
 *  - `cabecalho_rodape` (legado): imagens separadas para topo, base e marca-d'água.
 *  - `imagem_fundo`: o usuário sobe um PDF do timbrado (exportado do Word) e a
 *    primeira página vira a imagem de fundo A4 aplicada em todas as páginas.
 */
export function TimbradoUploader({
  ativo,
  modo,
  cabecalhoUrl,
  cabecalhoAlturaMm,
  rodapeUrl,
  rodapeAlturaMm,
  marcaDaguaUrl,
  marcaDaguaLarguraMm,
  marcaDaguaOpacidade,
  paginaInteiraUrl,
  paginaInteiraMargemTopoMm,
  paginaInteiraMargemBaseMm,
  paginaInteiraMargemEsqMm,
  paginaInteiraMargemDirMm,
  onChange,
}: TimbradoUploaderProps) {
  const modoAtivo = modo === "imagem_fundo" ? "imagem_fundo" : "cabecalho_rodape";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileImage className="w-5 h-5 text-gold" />
          Papel timbrado dos PDFs
        </CardTitle>
        <CardDescription>
          Aplica um papel timbrado em todos os PDFs gerados pela plataforma:
          peças jurídicas, notificações extrajudiciais e propostas de honorários.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">Aplicar timbrado nos PDFs</Label>
            <p className="text-xs text-muted-foreground">
              Quando desativado, os PDFs saem sem timbrado personalizado.
            </p>
          </div>
          <Switch
            checked={ativo}
            onCheckedChange={(v) => onChange("timbrado_ativo", v ? "true" : "false")}
          />
        </div>

        <Tabs
          value={modoAtivo}
          onValueChange={(v) => onChange("timbrado_modo", v)}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="imagem_fundo" className="gap-2">
              <FileText className="w-4 h-4" />
              PDF do Word (página inteira)
            </TabsTrigger>
            <TabsTrigger value="cabecalho_rodape" className="gap-2">
              <FileImage className="w-4 h-4" />
              Cabeçalho + Rodapé separados
            </TabsTrigger>
          </TabsList>

          <TabsContent value="imagem_fundo" className="space-y-4 pt-4">
            <BlocoPaginaInteira
              url={paginaInteiraUrl}
              margemTopo={paginaInteiraMargemTopoMm}
              margemBase={paginaInteiraMargemBaseMm}
              margemEsq={paginaInteiraMargemEsqMm}
              margemDir={paginaInteiraMargemDirMm}
              onChange={onChange}
            />
            {paginaInteiraUrl && (
              <PreviewA4PaginaInteira
                url={paginaInteiraUrl}
                margemTopo={Number(paginaInteiraMargemTopoMm) || 40}
                margemBase={Number(paginaInteiraMargemBaseMm) || 30}
                margemEsq={Number(paginaInteiraMargemEsqMm) || 25}
                margemDir={Number(paginaInteiraMargemDirMm) || 25}
                ativo={ativo}
              />
            )}
          </TabsContent>

          <TabsContent value="cabecalho_rodape" className="space-y-6 pt-4">
            <BlocoUploader
              titulo="Cabeçalho (topo da página)"
              descricao="Aparece no topo de cada folha. Sugerido: PNG 1654×236 px (A4 a 200 DPI)."
              url={cabecalhoUrl}
              alturaMm={cabecalhoAlturaMm}
              alturaDefault="30"
              onUrlChange={(v) => onChange("timbrado_cabecalho_url", v)}
              onAlturaChange={(v) => onChange("timbrado_cabecalho_altura_mm", v)}
              posicao="cabecalho"
            />

            <BlocoUploader
              titulo="Rodapé (base da página)"
              descricao="Aparece no final de cada folha. Sugerido: PNG 1654×157 px (A4 a 200 DPI)."
              url={rodapeUrl}
              alturaMm={rodapeAlturaMm}
              alturaDefault="20"
              onUrlChange={(v) => onChange("timbrado_rodape_url", v)}
              onAlturaChange={(v) => onChange("timbrado_rodape_altura_mm", v)}
              posicao="rodape"
            />

            <BlocoMarcaDagua
              url={marcaDaguaUrl}
              larguraMm={marcaDaguaLarguraMm}
              opacidade={marcaDaguaOpacidade}
              onChange={onChange}
            />

            {(cabecalhoUrl || rodapeUrl || marcaDaguaUrl) && (
              <PreviewA4
                cabecalhoUrl={cabecalhoUrl}
                cabecalhoAltura={Number(cabecalhoAlturaMm) || 30}
                rodapeUrl={rodapeUrl}
                rodapeAltura={Number(rodapeAlturaMm) || 20}
                marcaDaguaUrl={marcaDaguaUrl}
                marcaDaguaLargura={Number(marcaDaguaLarguraMm) || 120}
                marcaDaguaOpacidade={Number(marcaDaguaOpacidade) || 0.12}
                ativo={ativo}
              />
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

/* ────────────────────────────────────────────────────────────
 * Modo "imagem_fundo": upload de PDF do timbrado completo.
 * O PDF é convertido em PNG A4 no navegador via pdfjs-dist.
 * ──────────────────────────────────────────────────────────── */

interface BlocoPaginaInteiraProps {
  url: string;
  margemTopo: string;
  margemBase: string;
  margemEsq: string;
  margemDir: string;
  onChange: (chave: string, valor: string) => void;
}

function BlocoPaginaInteira({
  url,
  margemTopo,
  margemBase,
  margemEsq,
  margemDir,
  onChange,
}: BlocoPaginaInteiraProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleArquivo(file: File) {
    const ehPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const ehImagem = file.type.startsWith("image/");
    if (!ehPdf && !ehImagem) {
      toast.error("Envie um PDF do Word (recomendado) ou uma imagem PNG/JPG");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx. 12 MB)");
      return;
    }

    setEnviando(true);
    try {
      let blobParaUpload: Blob = file;
      let extFinal = file.name.split(".").pop()?.toLowerCase() || "png";
      let contentType = file.type || "image/png";

      if (ehPdf) {
        toast.info("Convertendo PDF em imagem A4…");
        blobParaUpload = await renderizarPrimeiraPaginaPdfComoPng(file, 2.5);
        extFinal = "png";
        contentType = "image/png";
      }

      const path = `timbrado-pagina-inteira-${Date.now()}.${extFinal}`;
      const { error: upErr } = await supabase.storage
        .from("branding")
        .upload(path, blobParaUpload, {
          upsert: true,
          contentType,
          cacheControl: "3600",
        });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("branding").getPublicUrl(path);
      onChange("timbrado_pagina_inteira_url", data.publicUrl);
      toast.success(
        ehPdf ? "PDF convertido e timbrado salvo" : "Imagem do timbrado salva",
      );
    } catch (err) {
      console.error("[BlocoPaginaInteira] erro:", err);
      toast.error("Falha ao processar o arquivo", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-primary/5 p-3">
        <p className="text-xs text-foreground/80 leading-relaxed">
          <strong>Como funciona:</strong> envie o PDF do seu papel timbrado (no Word: <em>Arquivo → Exportar → PDF</em>).
          A primeira página será convertida em imagem A4 e aplicada como fundo de todas as folhas dos
          PDFs gerados, mantendo logo, marca-d'água central e rodapé no mesmo lugar do seu modelo.
        </p>
      </div>

      <div className="flex flex-col md:flex-row items-start gap-4">
        <div className="shrink-0 w-full md:w-56 rounded-md bg-white border border-border flex items-center justify-center overflow-hidden" style={{ aspectRatio: "210 / 297" }}>
          {url ? (
            <img
              src={url}
              alt="Pré-visualização do timbrado"
              className="max-h-full max-w-full object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.opacity = "0.3";
              }}
            />
          ) : (
            <div className="text-center px-4">
              <FileText className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
              <span className="text-xs text-muted-foreground">Nenhum timbrado enviado</span>
            </div>
          )}
        </div>

        <div className="flex-1 w-full space-y-3">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleArquivo(f);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={enviando}
            >
              {enviando ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              {enviando ? "Processando…" : "Enviar PDF do timbrado"}
            </Button>
            {url && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange("timbrado_pagina_inteira_url", "")}
                disabled={enviando}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Remover
              </Button>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Aceita: PDF (.pdf) ou imagem (PNG/JPG) já em proporção A4.
          </p>

          <div className="space-y-2">
            <Label className="text-xs font-medium">Margens da área útil (onde o texto da peça vai ficar)</Label>
            <p className="text-[11px] text-muted-foreground">
              Ajuste para que o conteúdo não invada o logo do topo nem o rodapé do timbrado.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <CampoMargem
                label="Topo (mm)"
                valor={margemTopo}
                defaultV="40"
                onChange={(v) => onChange("timbrado_pagina_inteira_margem_topo_mm", v)}
              />
              <CampoMargem
                label="Base (mm)"
                valor={margemBase}
                defaultV="30"
                onChange={(v) => onChange("timbrado_pagina_inteira_margem_base_mm", v)}
              />
              <CampoMargem
                label="Esquerda (mm)"
                valor={margemEsq}
                defaultV="25"
                onChange={(v) => onChange("timbrado_pagina_inteira_margem_esq_mm", v)}
              />
              <CampoMargem
                label="Direita (mm)"
                valor={margemDir}
                defaultV="25"
                onChange={(v) => onChange("timbrado_pagina_inteira_margem_dir_mm", v)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CampoMargem({
  label,
  valor,
  defaultV,
  onChange,
}: {
  label: string;
  valor: string;
  defaultV: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <Input
        type="number"
        min={0}
        max={100}
        step={1}
        value={valor || defaultV}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs h-8"
      />
    </div>
  );
}

interface PreviewA4PaginaInteiraProps {
  url: string;
  margemTopo: number;
  margemBase: number;
  margemEsq: number;
  margemDir: number;
  ativo: boolean;
}

/** Mostra a página A4 com o timbrado de fundo e a área útil delimitada. */
function PreviewA4PaginaInteira({
  url,
  margemTopo,
  margemBase,
  margemEsq,
  margemDir,
  ativo,
}: PreviewA4PaginaInteiraProps) {
  const escala = 1.2;
  const A4_LARGURA = 210;
  const A4_ALTURA = 297;
  const larguraConteudo = A4_LARGURA - margemEsq - margemDir;
  const alturaConteudo = A4_ALTURA - margemTopo - margemBase;

  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          Pré-visualização A4 (210 × 297 mm) com o timbrado aplicado
          {!ativo && <span className="ml-2 text-destructive">(timbrado desativado)</span>}
        </p>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="inline-block w-3 h-2 bg-primary/10 border border-dashed border-primary/50 rounded-sm" />
          Área de conteúdo
        </span>
      </div>

      <div className="flex justify-center">
        <div
          className="relative bg-white border border-border shadow-sm overflow-hidden"
          style={{ width: A4_LARGURA * escala, height: A4_ALTURA * escala }}
        >
          <img
            src={url}
            alt="Timbrado de fundo"
            className="absolute inset-0 w-full h-full object-cover"
            style={{ opacity: ativo ? 1 : 0.4 }}
          />
          <div
            className="absolute border border-dashed border-primary/60 bg-primary/5"
            style={{
              top: margemTopo * escala,
              left: margemEsq * escala,
              width: larguraConteudo * escala,
              height: alturaConteudo * escala,
            }}
          >
            <div className="absolute inset-x-2 top-2 space-y-1.5">
              <div className="h-1 bg-foreground/20 rounded w-full" />
              <div className="h-1 bg-foreground/20 rounded w-11/12" />
              <div className="h-1 bg-foreground/20 rounded w-10/12" />
              <div className="h-1 bg-foreground/20 rounded w-full" />
              <div className="h-1 bg-foreground/20 rounded w-9/12" />
            </div>
            <div className="absolute bottom-1 right-1 text-[8px] font-mono text-primary bg-background/80 px-1 rounded">
              {larguraConteudo.toFixed(0)} × {alturaConteudo.toFixed(0)} mm
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
 * Modo "cabecalho_rodape" (legado): imagens separadas.
 * Mantido como antes.
 * ──────────────────────────────────────────────────────────── */

interface BlocoUploaderProps {
  titulo: string;
  descricao: string;
  url: string;
  alturaMm: string;
  alturaDefault: string;
  onUrlChange: (v: string) => void;
  onAlturaChange: (v: string) => void;
  posicao: "cabecalho" | "rodape";
}

function BlocoUploader({
  titulo,
  descricao,
  url,
  alturaMm,
  alturaDefault,
  onUrlChange,
  onAlturaChange,
  posicao,
}: BlocoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleArquivo(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem (PNG, JPG)");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx. 4 MB)");
      return;
    }
    setEnviando(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `timbrado-${posicao}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("branding")
        .upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("branding").getPublicUrl(path);
      onUrlChange(data.publicUrl);
      toast.success("Imagem enviada com sucesso");
    } catch (err) {
      console.error("[TimbradoUploader] erro:", err);
      toast.error("Falha ao enviar a imagem", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-sm font-medium">{titulo}</Label>
        <p className="text-xs text-muted-foreground">{descricao}</p>
      </div>

      <div className="flex flex-col md:flex-row items-start gap-4">
        <div className="shrink-0 w-full md:w-72 h-24 rounded-md bg-white border border-border flex items-center justify-center overflow-hidden">
          {url ? (
            <img
              src={url}
              alt={`Pré-visualização do ${posicao}`}
              className="max-h-full max-w-full object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.opacity = "0.3";
              }}
            />
          ) : (
            <span className="text-xs text-muted-foreground">Nenhuma imagem</span>
          )}
        </div>

        <div className="flex-1 w-full space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
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
            {url && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onUrlChange("")}
                disabled={enviando}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Remover
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">URL externa</Label>
              <Input
                value={url}
                onChange={(e) => onUrlChange(e.target.value)}
                placeholder="https://…"
                className="text-xs h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Altura na página (mm)</Label>
              <Input
                type="number"
                min={5}
                max={80}
                value={alturaMm || alturaDefault}
                onChange={(e) => onAlturaChange(e.target.value)}
                className="text-xs h-8"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface PreviewA4Props {
  cabecalhoUrl: string;
  cabecalhoAltura: number;
  rodapeUrl: string;
  rodapeAltura: number;
  marcaDaguaUrl: string;
  marcaDaguaLargura: number;
  marcaDaguaOpacidade: number;
  ativo: boolean;
}

function PreviewA4({
  cabecalhoUrl,
  cabecalhoAltura,
  rodapeUrl,
  rodapeAltura,
  marcaDaguaUrl,
  marcaDaguaLargura,
  marcaDaguaOpacidade,
  ativo,
}: PreviewA4Props) {
  const escala = 1.2;
  const A4_LARGURA = 210;
  const A4_ALTURA = 297;
  const FOLGA = 5;

  const margemTopo = cabecalhoUrl ? cabecalhoAltura + FOLGA : 0;
  const margemBase = rodapeUrl ? rodapeAltura + FOLGA : 0;
  const alturaConteudo = A4_ALTURA - margemTopo - margemBase;
  const larguraConteudo = A4_LARGURA;

  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          Pré-visualização da página A4 (210 × 297 mm)
          {!ativo && <span className="ml-2 text-destructive">(timbrado desativado)</span>}
        </p>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-2 bg-gold/30 border border-gold/60 rounded-sm" />
            Timbrado
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-2 bg-primary/10 border border-dashed border-primary/50 rounded-sm" />
            Área de conteúdo
          </span>
        </div>
      </div>

      <div className="flex justify-center">
        <div className="relative" style={{ paddingLeft: 28, paddingTop: 18, paddingRight: 56, paddingBottom: 18 }}>
          <div
            className="absolute left-0 flex flex-col justify-between items-end pr-1 text-[9px] text-muted-foreground/70 font-mono"
            style={{ top: 18, height: A4_ALTURA * escala, width: 26 }}
          >
            <span>0</span>
            <span>{A4_ALTURA}mm</span>
          </div>

          <div
            className="absolute top-0 flex justify-between items-end pb-1 text-[9px] text-muted-foreground/70 font-mono"
            style={{ left: 28, width: A4_LARGURA * escala, height: 16 }}
          >
            <span>0</span>
            <span>{A4_LARGURA}mm</span>
          </div>

          <div
            className="relative bg-white border border-border shadow-sm overflow-hidden"
            style={{ width: A4_LARGURA * escala, height: A4_ALTURA * escala }}
          >
            {cabecalhoUrl && (
              <>
                <div
                  className="absolute left-0 right-0 top-0 bg-gold/10 border-b border-gold/40 pointer-events-none"
                  style={{ height: cabecalhoAltura * escala, opacity: ativo ? 1 : 0.4 }}
                />
                <img
                  src={cabecalhoUrl}
                  alt="cabeçalho"
                  className="absolute top-0 left-0 w-full object-contain"
                  style={{ height: cabecalhoAltura * escala, opacity: ativo ? 1 : 0.4 }}
                />
              </>
            )}

            {marcaDaguaUrl && (
              <img
                src={marcaDaguaUrl}
                alt="marca-d'água"
                className="absolute left-1/2 top-1/2 pointer-events-none object-contain"
                style={{
                  width: marcaDaguaLargura * escala,
                  transform: "translate(-50%, -50%)",
                  opacity: ativo ? marcaDaguaOpacidade : marcaDaguaOpacidade * 0.4,
                }}
              />
            )}

            <div
              className="absolute left-0 right-0 border border-dashed border-primary/50"
              style={{
                top: margemTopo * escala,
                height: alturaConteudo * escala,
              }}
            >
              <div className="absolute inset-x-4 top-3 space-y-1.5">
                <div className="h-1 bg-muted-foreground/20 rounded w-full" />
                <div className="h-1 bg-muted-foreground/20 rounded w-11/12" />
                <div className="h-1 bg-muted-foreground/20 rounded w-10/12" />
                <div className="h-1 bg-muted-foreground/20 rounded w-full" />
                <div className="h-1 bg-muted-foreground/20 rounded w-9/12" />
                <div className="h-1 bg-muted-foreground/20 rounded w-11/12" />
              </div>

              <div className="absolute bottom-1 right-1 text-[8px] font-mono text-primary/70 bg-background/80 px-1 rounded">
                {larguraConteudo} × {alturaConteudo.toFixed(0)} mm
              </div>
            </div>

            {rodapeUrl && (
              <>
                <div
                  className="absolute left-0 right-0 bottom-0 bg-gold/10 border-t border-gold/40 pointer-events-none"
                  style={{ height: rodapeAltura * escala, opacity: ativo ? 1 : 0.4 }}
                />
                <img
                  src={rodapeUrl}
                  alt="rodapé"
                  className="absolute bottom-0 left-0 w-full object-contain"
                  style={{ height: rodapeAltura * escala, opacity: ativo ? 1 : 0.4 }}
                />
              </>
            )}
          </div>

          <div
            className="absolute pointer-events-none"
            style={{ top: 18, left: 28 + A4_LARGURA * escala, height: A4_ALTURA * escala, width: 56 }}
          >
            {cabecalhoUrl && (
              <div
                className="absolute left-0 right-2 flex items-center"
                style={{ top: 0, height: cabecalhoAltura * escala }}
              >
                <div className="border-l-2 border-gold/60 h-full mr-1" />
                <span className="text-[9px] font-mono text-foreground/80 leading-tight">
                  Cabeçalho
                  <br />
                  <span className="text-muted-foreground">{cabecalhoAltura} mm</span>
                </span>
              </div>
            )}

            <div
              className="absolute left-0 right-2 flex items-center"
              style={{
                top: margemTopo * escala,
                height: alturaConteudo * escala,
              }}
            >
              <div className="border-l-2 border-dashed border-primary/60 h-full mr-1" />
              <span className="text-[9px] font-mono text-foreground/80 leading-tight">
                Conteúdo
                <br />
                <span className="text-muted-foreground">{alturaConteudo.toFixed(0)} mm</span>
              </span>
            </div>

            {rodapeUrl && (
              <div
                className="absolute left-0 right-2 flex items-center"
                style={{ bottom: 0, height: rodapeAltura * escala }}
              >
                <div className="border-l-2 border-gold/60 h-full mr-1" />
                <span className="text-[9px] font-mono text-foreground/80 leading-tight">
                  Rodapé
                  <br />
                  <span className="text-muted-foreground">{rodapeAltura} mm</span>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
        <ResumoMargem rotulo="Margem topo" valor={margemTopo} />
        <ResumoMargem rotulo="Margem base" valor={margemBase} />
        <ResumoMargem rotulo="Largura útil" valor={larguraConteudo} />
        <ResumoMargem rotulo="Altura útil" valor={alturaConteudo} />
      </div>
      {(cabecalhoUrl || rodapeUrl) && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          As margens incluem uma folga de segurança de {FOLGA} mm para que o conteúdo não encoste no timbrado.
        </p>
      )}
    </div>
  );
}

function ResumoMargem({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="rounded border bg-background px-2 py-1.5">
      <p className="text-muted-foreground text-[10px] uppercase tracking-wide">{rotulo}</p>
      <p className="font-mono font-medium">{valor.toFixed(0)} mm</p>
    </div>
  );
}

interface BlocoMarcaDaguaProps {
  url: string;
  larguraMm: string;
  opacidade: string;
  onChange: (chave: string, valor: string) => void;
}

function BlocoMarcaDagua({ url, larguraMm, opacidade, onChange }: BlocoMarcaDaguaProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleArquivo(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem (PNG, JPG)");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx. 4 MB)");
      return;
    }
    setEnviando(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `timbrado-marca-dagua-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("branding")
        .upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("branding").getPublicUrl(path);
      onChange("timbrado_marca_dagua_url", data.publicUrl);
      toast.success("Marca-d'água enviada");
    } catch (err) {
      console.error("[BlocoMarcaDagua] erro:", err);
      toast.error("Falha ao enviar a imagem", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const opacidadeNum = Math.min(1, Math.max(0.05, Number(opacidade) || 0.12));

  return (
    <div className="space-y-3 pt-2 border-t">
      <div>
        <Label className="text-sm font-medium">Marca-d'água central (fundo da página)</Label>
        <p className="text-xs text-muted-foreground">
          Aparece atrás do conteúdo, centralizada na folha. Use PNG com fundo transparente.
          Recomendado: opacidade entre 0,08 e 0,15 para não atrapalhar a leitura.
        </p>
      </div>

      <div className="flex flex-col md:flex-row items-start gap-4">
        <div className="shrink-0 w-full md:w-72 h-32 rounded-md bg-white border border-border flex items-center justify-center overflow-hidden">
          {url ? (
            <img
              src={url}
              alt="Pré-visualização da marca-d'água"
              className="max-h-full max-w-full object-contain"
              style={{ opacity: opacidadeNum }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.opacity = "0.3";
              }}
            />
          ) : (
            <span className="text-xs text-muted-foreground">Nenhuma imagem</span>
          )}
        </div>

        <div className="flex-1 w-full space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
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
              {enviando ? "Enviando…" : "Enviar marca-d'água"}
            </Button>
            {url && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange("timbrado_marca_dagua_url", "")}
                disabled={enviando}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Remover
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="space-y-1 sm:col-span-3">
              <Label className="text-xs text-muted-foreground">URL externa</Label>
              <Input
                value={url}
                onChange={(e) => onChange("timbrado_marca_dagua_url", e.target.value)}
                placeholder="https://…"
                className="text-xs h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Largura (mm)</Label>
              <Input
                type="number"
                min={30}
                max={200}
                step={5}
                value={larguraMm || "120"}
                onChange={(e) => onChange("timbrado_marca_dagua_largura_mm", e.target.value)}
                className="text-xs h-8"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs text-muted-foreground">
                Opacidade ({opacidadeNum.toFixed(2)})
              </Label>
              <Input
                type="range"
                min={0.05}
                max={1}
                step={0.01}
                value={opacidadeNum}
                onChange={(e) => onChange("timbrado_marca_dagua_opacidade", e.target.value)}
                className="h-8 cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
