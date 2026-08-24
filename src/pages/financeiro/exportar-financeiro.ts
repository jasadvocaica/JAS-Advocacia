// Helpers para exportar listas financeiras em CSV e PDF.
import { formatBRL } from "@/lib/format";

type Cell = string | number | null | undefined;

function escapeCsv(v: Cell): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[";\n,]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportarCsv(
  filename: string,
  headers: string[],
  rows: Cell[][],
) {
  const linhas = [headers.map(escapeCsv).join(";")];
  for (const r of rows) linhas.push(r.map(escapeCsv).join(";"));
  // BOM para Excel reconhecer UTF-8 com acentos
  const blob = new Blob(["\uFEFF" + linhas.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportarPdf(opts: {
  titulo: string;
  subtitulo?: string;
  headers: string[];
  rows: Cell[][];
  filename: string;
  totalLabel?: string;
  totalValor?: number;
  resumo?: Array<{ label: string; valor: string }>;
}) {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(opts.titulo, 14, 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  if (opts.subtitulo) doc.text(opts.subtitulo, 14, 22);
  doc.text(
    `Gerado em ${new Date().toLocaleString("pt-BR")}`,
    14,
    opts.subtitulo ? 27 : 22,
  );
  doc.setTextColor(0);

  let cursorY = (opts.subtitulo ? 32 : 27);

  if (opts.resumo && opts.resumo.length) {
    doc.setFontSize(9);
    const linha = opts.resumo
      .map((r) => `${r.label}: ${r.valor}`)
      .join("    ");
    doc.text(linha, 14, cursorY);
    cursorY += 5;
  }

  autoTable(doc, {
    startY: cursorY + 2,
    head: [opts.headers],
    body: opts.rows.map((r) => r.map((c) => (c == null ? "" : String(c)))),
    headStyles: { fillColor: [1, 4, 35], textColor: 255 },
    styles: { font: "helvetica", fontSize: 8, cellPadding: 2 },
    alternateRowStyles: { fillColor: [248, 248, 250] },
  });

  if (opts.totalLabel && opts.totalValor != null) {
    const finalY = (doc as any).lastAutoTable?.finalY ?? cursorY + 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(
      `${opts.totalLabel}: ${formatBRL(opts.totalValor)}`,
      14,
      finalY + 8,
    );
  }

  doc.save(
    opts.filename.endsWith(".pdf") ? opts.filename : `${opts.filename}.pdf`,
  );
}
