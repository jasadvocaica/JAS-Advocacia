import * as pdfjsLib from "pdfjs-dist";
// O worker é carregado via CDN (mais simples que configurar bundler).
// pdfjs-dist 4.x usa .mjs.
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

/**
 * Renderiza a primeira página de um PDF como PNG (proporção A4).
 * @param file PDF carregado pelo usuário.
 * @param escala DPI ~ escala * 72. Default 2.5 (~180 dpi) para boa qualidade
 *   sem estourar o tamanho do PNG.
 * @returns Blob PNG da primeira página.
 */
export async function renderizarPrimeiraPaginaPdfComoPng(
  file: File,
  escala = 2.5,
): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  try {
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: escala });

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não foi possível obter contexto 2D do canvas");

    // Fundo branco (caso o PDF tenha transparência).
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: ctx,
      viewport,
      canvas,
    } as any).promise;

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob retornou null"))),
        "image/png",
        0.95,
      );
    });
    return blob;
  } finally {
    pdf.destroy();
  }
}
