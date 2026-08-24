import type jsPDF from "jspdf";
import { carregarTimbradoConfig, type TimbradoConfig } from "@/hooks/useTimbrado";

/**
 * Cache local de imagens baixadas (data URL) para evitar refetch a cada PDF.
 */
const imgCache = new Map<string, string>();

async function urlParaDataUrl(url: string): Promise<string | null> {
  if (imgCache.has(url)) return imgCache.get(url)!;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    imgCache.set(url, dataUrl);
    return dataUrl;
  } catch (err) {
    console.warn("[timbrado-pdf] falha ao carregar imagem:", url, err);
    return null;
  }
}

function detectarFormato(dataUrl: string): "PNG" | "JPEG" {
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg"))
    return "JPEG";
  return "PNG";
}

export interface AplicarTimbradoOpts {
  /** Margem horizontal (mm) que a imagem respeitará. Default: 0 (ocupa toda largura). */
  margemHorizontalMm?: number;
}

/**
 * Aplica o papel timbrado em TODAS as páginas existentes de um documento jsPDF.
 * Deve ser chamado **depois** de todo o conteúdo ter sido escrito.
 *
 * Retorna `true` se aplicou, `false` se o timbrado está inativo ou indisponível.
 */
export async function aplicarTimbradoPdf(
  doc: jsPDF,
  opts: AplicarTimbradoOpts = {},
): Promise<boolean> {
  const cfg = await carregarTimbradoConfig();
  if (!cfg.ativo) return false;

  // Modo "página inteira": a imagem A4 já contém cabeçalho, rodapé e marca-d'água.
  if (cfg.modo === "imagem_fundo") {
    if (!cfg.paginaInteiraUrl) return false;
    const fundoData = await urlParaDataUrl(cfg.paginaInteiraUrl);
    if (!fundoData) return false;

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const total = (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();

    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.addImage(
        fundoData,
        detectarFormato(fundoData),
        0,
        0,
        pageWidth,
        pageHeight,
        undefined,
        "FAST",
      );
    }
    return true;
  }

  // Modo "cabecalho_rodape" (legado): cabeçalho + rodapé + marca-d'água separados.
  if (!cfg.cabecalhoUrl && !cfg.rodapeUrl && !cfg.marcaDaguaUrl) return false;

  const cabecalhoData = cfg.cabecalhoUrl ? await urlParaDataUrl(cfg.cabecalhoUrl) : null;
  const rodapeData = cfg.rodapeUrl ? await urlParaDataUrl(cfg.rodapeUrl) : null;
  const marcaDaguaData = cfg.marcaDaguaUrl ? await urlParaDataUrl(cfg.marcaDaguaUrl) : null;
  if (!cabecalhoData && !rodapeData && !marcaDaguaData) return false;

  // Para descobrir a proporção da marca-d'água e centralizá-la verticalmente.
  let marcaProporcao = 1;
  if (marcaDaguaData) {
    marcaProporcao = await obterProporcaoImagem(marcaDaguaData).catch(() => 1);
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margem = opts.margemHorizontalMm ?? 0;
  const larguraImg = pageWidth - margem * 2;

  const total = (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);

    if (marcaDaguaData) {
      const larguraMarca = Math.min(cfg.marcaDaguaLarguraMm, pageWidth - 10);
      const alturaMarca = larguraMarca / marcaProporcao;
      const x = (pageWidth - larguraMarca) / 2;
      const y = (pageHeight - alturaMarca) / 2;
      const opacidade = cfg.marcaDaguaOpacidade;
      const docAny = doc as unknown as {
        GState: new (opts: { opacity: number }) => unknown;
        setGState: (gs: unknown) => void;
      };
      try {
        const gsTransp = new docAny.GState({ opacity: opacidade });
        const gsCheio = new docAny.GState({ opacity: 1 });
        docAny.setGState(gsTransp);
        doc.addImage(
          marcaDaguaData,
          detectarFormato(marcaDaguaData),
          x,
          y,
          larguraMarca,
          alturaMarca,
          undefined,
          "SLOW",
        );
        docAny.setGState(gsCheio);
      } catch (err) {
        console.warn("[timbrado-pdf] sem GState, desenhando marca opaca:", err);
        doc.addImage(
          marcaDaguaData,
          detectarFormato(marcaDaguaData),
          x,
          y,
          larguraMarca,
          alturaMarca,
          undefined,
          "SLOW",
        );
      }
    }

    if (cabecalhoData) {
      doc.addImage(
        cabecalhoData,
        detectarFormato(cabecalhoData),
        margem,
        0,
        larguraImg,
        cfg.cabecalhoAlturaMm,
        undefined,
        "FAST",
      );
    }
    if (rodapeData) {
      doc.addImage(
        rodapeData,
        detectarFormato(rodapeData),
        margem,
        pageHeight - cfg.rodapeAlturaMm,
        larguraImg,
        cfg.rodapeAlturaMm,
        undefined,
        "FAST",
      );
    }
  }
  return true;
}

async function obterProporcaoImagem(dataUrl: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth / Math.max(1, img.naturalHeight));
    img.onerror = () => reject(new Error("imagem inválida"));
    img.src = dataUrl;
  });
}

/**
 * Devolve as margens efetivas (em mm) que o conteúdo deve respeitar para
 * não invadir cabeçalho/rodapé do timbrado. Se o timbrado estiver inativo,
 * retorna `null`.
 */
export async function obterMargensTimbrado(): Promise<{
  topo: number;
  base: number;
  esquerda?: number;
  direita?: number;
  cfg: TimbradoConfig;
} | null> {
  const cfg = await carregarTimbradoConfig();
  if (!cfg.ativo) return null;

  if (cfg.modo === "imagem_fundo" && cfg.paginaInteiraUrl) {
    return {
      topo: cfg.paginaInteiraMargemTopoMm,
      base: cfg.paginaInteiraMargemBaseMm,
      esquerda: cfg.paginaInteiraMargemEsqMm,
      direita: cfg.paginaInteiraMargemDirMm,
      cfg,
    };
  }

  return {
    topo: cfg.cabecalhoUrl ? cfg.cabecalhoAlturaMm + 5 : 0,
    base: cfg.rodapeUrl ? cfg.rodapeAlturaMm + 5 : 0,
    cfg,
  };
}
