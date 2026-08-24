import mammoth from "mammoth";

/**
 * Converte um .docx para HTML preservando alinhamento (justificado/centro/direita),
 * recuo de primeira linha, espaçamento entre parágrafos, fonte/tamanho padrão de
 * peça jurídica e tabelas com bordas — coisas que o `mammoth.convertToHtml`
 * descarta por padrão.
 *
 * Estratégia:
 *  1. `transforms.paragraph` visita cada parágrafo e, se ele tem propriedades
 *     visuais relevantes, renomeia o `styleName` para uma sentinela única
 *     (`__pstyle_N__`). O CSS correspondente é guardado num Map.
 *  2. styleMap genérico mapeia `p[style-name='__pstyle_N__'] => p.__pstyle_N__:fresh`
 *     para CADA sentinela criada (gerados dinamicamente em duas passadas).
 *  3. Pós-processa o HTML trocando `class="__pstyle_N__"` por `style="..."`
 *     e injetando bordas em tabelas + wrapper com fonte padrão de peça.
 *
 * Como o styleMap precisa ser conhecido ANTES da conversão (entries são
 * compiladas), fazemos 2 passes: primeira só identifica os sentinelas
 * (sem produzir HTML útil); segunda gera o HTML final com o styleMap
 * completo.
 */
export interface DocxConvertResult {
  html: string;
  warnings: string[];
}

interface ParagraphProps {
  alignment?: string | null;
  indent?: { start?: string | null; firstLine?: string | null; hanging?: string | null } | null;
  spacingBefore?: number | string | null;
  spacingAfter?: number | string | null;
}

/** dxa (1/20 pt) → px @ 96dpi. */
function dxaParaPx(valor: string | number | null | undefined): number | null {
  if (valor === undefined || valor === null || valor === "") return null;
  const num = typeof valor === "number" ? valor : parseFloat(String(valor));
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.round((num / 20) * 1.333);
}

function alinhamentoParaCss(a?: string | null): string | null {
  switch (a) {
    case "left": return "left";
    case "right": return "right";
    case "center": return "center";
    case "both":
    case "justify": return "justify";
    default: return null;
  }
}

function montarStyleParagrafo(p: ParagraphProps): string {
  const partes: string[] = [];
  const align = alinhamentoParaCss(p.alignment);
  if (align) partes.push(`text-align:${align}`);
  if (p.indent) {
    const left = dxaParaPx(p.indent.start);
    if (left) partes.push(`margin-left:${left}px`);
    const firstLine = dxaParaPx(p.indent.firstLine);
    if (firstLine) partes.push(`text-indent:${firstLine}px`);
    const hanging = dxaParaPx(p.indent.hanging);
    if (hanging) partes.push(`text-indent:-${hanging}px`);
  }
  const before = dxaParaPx(p.spacingBefore);
  if (before) partes.push(`margin-top:${before}px`);
  const after = dxaParaPx(p.spacingAfter);
  if (after) partes.push(`margin-bottom:${after}px`);
  return partes.join(";");
}

const ESTILO_PADRAO_PECA = [
  "font-family:'Times New Roman', Times, serif",
  "font-size:12pt",
  "text-align:justify",
  "line-height:1.5",
  "color:#111",
].join(";");

function refinarHtml(html: string): string {
  let out = html;
  out = out.replace(
    /<table(\b[^>]*)>/gi,
    (_m, attrs) =>
      `<table${attrs} style="border-collapse:collapse;width:100%;margin:8px 0;border:1px solid #555;">`,
  );
  out = out.replace(
    /<td(\b[^>]*)>/gi,
    (_m, attrs) => `<td${attrs} style="border:1px solid #555;padding:4px 8px;vertical-align:top;">`,
  );
  out = out.replace(
    /<th(\b[^>]*)>/gi,
    (_m, attrs) =>
      `<th${attrs} style="border:1px solid #555;padding:4px 8px;background:#f3f3f3;text-align:center;">`,
  );
  out = out.replace(/(<p[^>]*>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>\s*){2,}/gi, "<p>&nbsp;</p>");
  return out;
}

export async function converterDocxParaHtml(buffer: ArrayBuffer): Promise<DocxConvertResult> {
  const sentinelaParaCss = new Map<string, string>();
  let proximoId = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mam = mammoth as any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transformParagraph = mam.transforms.paragraph((paragraph: any) => {
    const css = montarStyleParagrafo({
      alignment: paragraph.alignment,
      indent: paragraph.indent,
      spacingBefore: paragraph.spacingBefore,
      spacingAfter: paragraph.spacingAfter,
    });
    if (!css) return paragraph;
    const sentinela = `__pstyle_${proximoId++}__`;
    sentinelaParaCss.set(sentinela, css);
    // Preserva styleId/styleName originais como fallback se não houver match.
    return {
      ...paragraph,
      styleId: sentinela,
      styleName: sentinela,
    };
  });

  // PASSE 1: descobre quais sentinelas serão criados (apenas para gerar
  // styleMap). Usa convertToHtml mas descarta o resultado.
  await mam.convertToHtml(
    { arrayBuffer: buffer },
    { transformDocument: transformParagraph, styleMap: [] },
  );

  // Gera styleMap com uma entry por sentinela criado, transformando cada
  // sentinela em <p class="__pstyle_N__">.
  const sentinelaEntries = Array.from(sentinelaParaCss.keys()).map(
    (s) => `p[style-name='${s}'] => p.${s}:fresh`,
  );

  // Reseta para a 2ª passe (transform será reexecutado e regerará os IDs
  // na mesma ordem, então o Map continua válido).
  sentinelaParaCss.clear();
  proximoId = 0;

  // PASSE 2: conversão real com styleMap completo.
  const result = await mam.convertToHtml(
    { arrayBuffer: buffer },
    {
      transformDocument: transformParagraph,
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
        "p[style-name='Heading 4'] => h4:fresh",
        "p[style-name='Quote'] => blockquote:fresh",
        "r[style-name='Strong'] => strong",
        "r[style-name='Emphasis'] => em",
        ...sentinelaEntries,
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      convertImage: mam.images.imgElement(async (image: any) => {
        const buffer64 = await image.read("base64");
        return { src: `data:${image.contentType};base64,${buffer64}` };
      }),
    },
  );

  let html: string = result.value || "<p></p>";

  // Substitui class="__pstyle_N__" pelo style inline correspondente.
  html = html.replace(/class="(__pstyle_\d+__)"/g, (_m, cls) => {
    const css = sentinelaParaCss.get(cls);
    return css ? `style="${css}"` : "";
  });

  html = refinarHtml(html);

  if (html.trim().length > 0) {
    html = `<div style="${ESTILO_PADRAO_PECA}">${html}</div>`;
  }

  const warnings = (result.messages ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .slice(0, 10).map((m: any) => m.message ?? String(m));

  return { html, warnings };
}
