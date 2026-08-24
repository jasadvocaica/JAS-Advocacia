import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  HeadingLevel,
  PageOrientation,
} from "docx";
import { saveAs } from "file-saver";

interface ExportarDocxOpcoes {
  titulo: string;
  htmlConteudo: string;
  fonte?: string;
  tamanhoFonte?: number; // pt
  margemSuperior?: number; // twips
  margemInferior?: number;
  margemEsquerda?: number;
  margemDireita?: number;
  espacamento?: number; // line spacing multiplier
}

/**
 * Converte HTML do TipTap em parágrafos docx.
 * Implementação simples: extrai blocos (p, h1-3, li) e mantém negrito/itálico/sublinhado/alinhamento.
 */
function htmlParaParagrafos(
  html: string,
  fonte: string,
  tamanhoFonte: number,
  espacamento: number
): Paragraph[] {
  const container = document.createElement("div");
  container.innerHTML = html || "<p></p>";

  const paragrafos: Paragraph[] = [];
  const halfPoints = tamanhoFonte * 2;

  const extrairRuns = (node: Element): TextRun[] => {
    const runs: TextRun[] = [];
    const walk = (n: Node, ctx: { bold?: boolean; italic?: boolean; underline?: boolean }) => {
      if (n.nodeType === Node.TEXT_NODE) {
        const text = n.textContent ?? "";
        if (text) {
          runs.push(
            new TextRun({
              text,
              bold: ctx.bold,
              italics: ctx.italic,
              underline: ctx.underline ? {} : undefined,
              font: fonte,
              size: halfPoints,
            })
          );
        }
        return;
      }
      if (n.nodeType !== Node.ELEMENT_NODE) return;
      const el = n as HTMLElement;
      const tag = el.tagName.toLowerCase();
      const novoCtx = { ...ctx };
      if (tag === "strong" || tag === "b") novoCtx.bold = true;
      if (tag === "em" || tag === "i") novoCtx.italic = true;
      if (tag === "u") novoCtx.underline = true;
      if (tag === "br") {
        runs.push(new TextRun({ text: "", break: 1, font: fonte, size: halfPoints }));
        return;
      }
      el.childNodes.forEach((c) => walk(c, novoCtx));
    };
    node.childNodes.forEach((c) => walk(c, {}));
    return runs;
  };

  const alinhamentoDe = (el: HTMLElement) => {
    const ta = el.style.textAlign || el.getAttribute("data-text-align");
    switch (ta) {
      case "center":
        return AlignmentType.CENTER;
      case "right":
        return AlignmentType.RIGHT;
      case "justify":
        return AlignmentType.JUSTIFIED;
      default:
        return AlignmentType.LEFT;
    }
  };

  const processar = (el: Element) => {
    const tag = el.tagName.toLowerCase();
    if (["p", "div"].includes(tag)) {
      const runs = extrairRuns(el);
      paragrafos.push(
        new Paragraph({
          children: runs.length ? runs : [new TextRun({ text: "", font: fonte, size: halfPoints })],
          alignment: alinhamentoDe(el as HTMLElement),
          spacing: { line: Math.round(espacamento * 240) },
        })
      );
    } else if (tag === "h1" || tag === "h2" || tag === "h3") {
      const level = tag === "h1" ? HeadingLevel.HEADING_1 : tag === "h2" ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
      paragrafos.push(
        new Paragraph({
          heading: level,
          children: extrairRuns(el),
          alignment: alinhamentoDe(el as HTMLElement),
          spacing: { line: Math.round(espacamento * 240) },
        })
      );
    } else if (tag === "ul" || tag === "ol") {
      el.querySelectorAll(":scope > li").forEach((li) => {
        paragrafos.push(
          new Paragraph({
            children: extrairRuns(li),
            bullet: tag === "ul" ? { level: 0 } : undefined,
            numbering: tag === "ol" ? { reference: "lista-num", level: 0 } : undefined,
            alignment: alinhamentoDe(li as HTMLElement),
            spacing: { line: Math.round(espacamento * 240) },
          })
        );
      });
    } else {
      const runs = extrairRuns(el);
      if (runs.length) {
        paragrafos.push(
          new Paragraph({
            children: runs,
            alignment: alinhamentoDe(el as HTMLElement),
            spacing: { line: Math.round(espacamento * 240) },
          })
        );
      }
    }
  };

  Array.from(container.children).forEach(processar);
  if (!paragrafos.length) {
    paragrafos.push(new Paragraph({ children: [new TextRun({ text: "", font: fonte, size: halfPoints })] }));
  }
  return paragrafos;
}

export async function exportarDocx(opcoes: ExportarDocxOpcoes): Promise<void> {
  const fonte = opcoes.fonte || "Bookman Old Style";
  const tamanhoFonte = opcoes.tamanhoFonte || 12;
  const espacamento = opcoes.espacamento || 1.5;

  const doc = new Document({
    creator: "Juliana Araujo Advocacia",
    title: opcoes.titulo,
    styles: {
      default: {
        document: { run: { font: fonte, size: tamanhoFonte * 2 } },
      },
    },
    numbering: {
      config: [
        {
          reference: "lista-num",
          levels: [
            {
              level: 0,
              format: "decimal" as any,
              text: "%1.",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 11906,
              height: 16838,
              orientation: PageOrientation.PORTRAIT,
            },
            margin: {
              top: opcoes.margemSuperior ?? 1440,
              bottom: opcoes.margemInferior ?? 1440,
              left: opcoes.margemEsquerda ?? 1800,
              right: opcoes.margemDireita ?? 1080,
            },
          },
        },
        children: htmlParaParagrafos(opcoes.htmlConteudo, fonte, tamanhoFonte, espacamento),
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const nomeArquivo = `${opcoes.titulo.replace(/[^a-z0-9\s_-]/gi, "").trim().replace(/\s+/g, "_") || "documento"}.docx`;
  saveAs(blob, nomeArquivo);
}

/**
 * Imprime o conteúdo HTML em uma janela nova com formatação A4 — usuário pode salvar como PDF.
 * Aplica automaticamente o papel timbrado configurado em
 * Configurações → Escritório, se estiver ativo.
 */
export async function imprimirParaPDF(opcoes: {
  titulo: string;
  htmlConteudo: string;
  fonte?: string;
  tamanhoFonte?: number;
  margemSuperior?: number;
  margemInferior?: number;
  margemEsquerda?: number;
  margemDireita?: number;
  espacamento?: number;
}): Promise<void> {
  const fonte = opcoes.fonte || "Bookman Old Style";
  const tamanhoFonte = opcoes.tamanhoFonte || 12;
  const espacamento = opcoes.espacamento || 1.5;
  // twips → cm (1cm = 567 twips)
  const cm = (twips: number) => `${(twips / 567).toFixed(2)}cm`;

  // Carrega timbrado dinamicamente para evitar dependência circular em testes.
  const { obterMargensTimbrado } = await import("./timbrado-pdf");
  const timbrado = await obterMargensTimbrado();

  // Margens base do documento (vindas do editor).
  let margemTopoCm = opcoes.margemSuperior ?? 1440;
  let margemBaseCm = opcoes.margemInferior ?? 1440;
  let cabecalhoHtml = "";
  let rodapeHtml = "";

  if (timbrado) {
    const { cfg, topo, base } = timbrado;
    // Garante que o conteúdo não invada cabeçalho/rodapé do timbrado.
    const topoTwips = Math.round((topo / 2.54) * 1440);
    const baseTwips = Math.round((base / 2.54) * 1440);
    margemTopoCm = Math.max(margemTopoCm, topoTwips);
    margemBaseCm = Math.max(margemBaseCm, baseTwips);

    if (cfg.cabecalhoUrl) {
      cabecalhoHtml = `<img class="timbrado-cabecalho" src="${cfg.cabecalhoUrl}" alt="" style="height:${cfg.cabecalhoAlturaMm}mm" />`;
    }
    if (cfg.rodapeUrl) {
      rodapeHtml = `<img class="timbrado-rodape" src="${cfg.rodapeUrl}" alt="" style="height:${cfg.rodapeAlturaMm}mm" />`;
    }
  }

  const w = window.open("", "_blank", "width=900,height=900");
  if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${opcoes.titulo}</title>
    <style>
      @page { size: A4; margin: ${cm(margemTopoCm)} ${cm(opcoes.margemDireita ?? 1080)} ${cm(margemBaseCm)} ${cm(opcoes.margemEsquerda ?? 1800)}; }
      body { font-family: ${fonte}, serif; font-size: ${tamanhoFonte}pt; line-height: ${espacamento}; color: #000; margin: 0; }
      h1, h2, h3 { font-family: ${fonte}, serif; }
      mark[data-variavel] { background:#FFF3CD; color:#856404; padding:0 4px; border-radius:3px; }
      p { margin: 0 0 0.5em; }
      ul, ol { padding-left: 2em; }
      .timbrado-cabecalho, .timbrado-rodape {
        position: fixed;
        left: 0;
        right: 0;
        width: 100%;
        object-fit: contain;
        background: #fff;
      }
      .timbrado-cabecalho { top: 0; }
      .timbrado-rodape { bottom: 0; }
      @media print {
        .timbrado-cabecalho, .timbrado-rodape { display: block; }
      }
    </style>
  </head><body>${cabecalhoHtml}${rodapeHtml}<main>${opcoes.htmlConteudo}</main></body></html>`);
  w.document.close();
  // Aguarda imagens do timbrado carregarem antes de chamar print.
  setTimeout(() => {
    w.focus();
    w.print();
  }, 600);
}
