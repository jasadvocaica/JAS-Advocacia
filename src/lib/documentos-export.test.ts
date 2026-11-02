import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { exportarDocx, imprimirParaPDF } from "./documentos-export";
import { sanitizarHtmlDocumento } from "./documentos-html-sanitize";

const mocks = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("file-saver", () => ({
  saveAs: (...args: unknown[]) => mocks.save(...args),
}));
vi.mock("./timbrado-pdf", () => ({ obterMargensTimbrado: async () => null }));

describe("documentos — modelos e exportação", () => {
  it("limpa tags do Word sem tratar namespaces como seletores CSS", () => {
    expect(
      sanitizarHtmlDocumento(
        '<p class="MsoNormal">Texto <b>importado</b><o:p>lixo</o:p></p><script>alert(1)</script>',
      ),
    ).toBe("<p>Texto <b>importado</b></p>");
  });
  it("preserva fonte, tamanho, cor e ênfase de trechos no Word", async () => {
    await exportarDocx({
      titulo: "Minuta de teste",
      fonte: "Georgia",
      htmlConteudo:
        '<p><span style="font-family: Arial; font-size: 16pt; color: rgb(255, 0, 0)"><strong>Trecho formatado</strong></span></p>',
    });
    const blob = mocks.save.mock.calls[0][0] as Blob;
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(blob);
    });
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain('w:ascii="Arial"');
    expect(xml).toContain('w:val="32"');
    expect(xml).toContain('w:val="ff0000"');
    expect(xml).toContain('w:firstLine="709"');
    expect(xml).toContain("Trecho formatado");
  });
  it("avisa quando o navegador bloqueia a janela de PDF", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    await expect(
      imprimirParaPDF({ titulo: "Minuta", htmlConteudo: "<p>Texto</p>" }),
    ).rejects.toThrow("janela de impressão");
  });
});
