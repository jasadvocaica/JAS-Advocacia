import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { NotificacaoData } from "./types";
import { aplicarTimbradoPdf } from "@/lib/timbrado-pdf";

// Paleta JAS: navy #010423, dourado #BC943F
const NAVY: [number, number, number] = [1, 4, 35];
const GOLD: [number, number, number] = [188, 148, 63];

const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function drawHeader(doc: jsPDF, pageWidth: number): number {
  const px = pageWidth - 50;
  const py = 12;
  const size = 5;
  const gap = 1;

  doc.setFillColor(...NAVY);
  doc.rect(px, py, size * 2 + gap, size, "F");
  doc.setFillColor(...GOLD);
  doc.rect(px, py + size + gap, size * 2 + gap, size, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...NAVY);
  doc.text("JAS ADVOCACIA", pageWidth - 50, py + size * 2 + gap + 7, {
    align: "center",
    charSpace: 1,
  } as any);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text(
    "Dra. Juliana Araújo da Silva · OAB/MT 34.182",
    pageWidth - 50,
    py + size * 2 + gap + 12,
    { align: "center" } as any,
  );

  doc.setTextColor(20, 20, 20);
  return 42;
}

function addFooter(doc: jsPDF, pageWidth: number, pageHeight: number) {
  const pageCount = (doc.internal as any).getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.5);
    doc.line(20, pageHeight - 22, pageWidth - 20, pageHeight - 22);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    doc.text(
      "(66) 99262-4753 | advocaciajulianaaraujo@gmail.com",
      pageWidth / 2,
      pageHeight - 16,
      { align: "center" },
    );
    doc.text(
      "Rua São Cristóvão, 315, Poncho Verde II — Primavera do Leste/MT",
      pageWidth / 2,
      pageHeight - 11,
      { align: "center" },
    );

    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - 20, pageHeight - 11, {
      align: "right",
    });
  }
}

export function generateNotificationPDF(data: NotificacaoData): jsPDF {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;

  let y = drawHeader(doc, pageWidth);

  y += 5;
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text("NOTIFICAÇÃO EXTRAJUDICIAL", 20, y);
  y += 3;
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.8);
  doc.line(20, y, pageWidth - 20, y);
  y += 8;

  const desenhaSecao = (titulo: string, blocos: [string, string][]) => {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...GOLD);
    doc.text(titulo, 20, y);
    y += 5;
    doc.setTextColor(20, 20, 20);
    doc.setFont("helvetica", "normal");
    blocos.forEach(([label, valor]) => {
      doc.setFont("helvetica", "bold");
      doc.text(`${label}: `, 20, y);
      const labelWidth = doc.getTextWidth(`${label}: `);
      doc.setFont("helvetica", "normal");
      const linhas = doc.splitTextToSize(valor || "", pageWidth - 40 - labelWidth);
      doc.text(linhas, 20 + labelWidth, y);
      y += 5 * Math.max(linhas.length, 1);
    });
    y += 3;
  };

  desenhaSecao("NOTIFICANTE (CREDOR)", [
    ["Nome/Razão Social", data.notificante_nome],
    ["CNPJ/CPF", data.notificante_cnpj],
    ["Endereço", data.notificante_endereco],
  ]);

  desenhaSecao("NOTIFICADO (DEVEDOR)", [
    ["Nome", data.notificado_nome],
    ["CPF", data.notificado_cpf],
    ["RG", data.notificado_rg],
    ["Endereço", data.notificado_endereco],
  ]);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text(`Ref.: ${data.referencia || ""}`, 20, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(20, 20, 20);
  if (data.texto_notificacao) {
    const linhas = doc.splitTextToSize(data.texto_notificacao, pageWidth - 40);
    linhas.forEach((linha: string) => {
      if (y > pageHeight - 40) {
        doc.addPage();
        y = drawHeader(doc, pageWidth) + 10;
      }
      doc.text(linha, 20, y);
      y += 5;
    });
  }
  y += 5;

  if (y > pageHeight - 80) {
    doc.addPage();
    y = drawHeader(doc, pageWidth) + 10;
  }

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GOLD);
  doc.setFontSize(9);
  doc.text("DEMONSTRATIVO DO DÉBITO", 20, y);
  y += 3;

  const totalOriginal = data.parcelas.reduce((a, p) => a + (p.valorOriginal || 0), 0);
  const totalAtualizado = data.parcelas.reduce((a, p) => a + (p.valorAtualizado || 0), 0);
  const totalJuros = data.parcelas.reduce((a, p) => a + (p.juros || 0), 0);
  const totalParcelas = data.parcelas.reduce((a, p) => a + (p.total || 0), 0);

  autoTable(doc, {
    startY: y,
    head: [["Descrição", "Vencimento", "Valor Original", "Atualizado", "Juros/Mora", "Total"]],
    body: [
      ...data.parcelas.map((p) => [
        p.descricao,
        p.vencimento,
        formatBRL(p.valorOriginal || 0),
        formatBRL(p.valorAtualizado || 0),
        formatBRL(p.juros || 0),
        formatBRL(p.total || 0),
      ]),
      [
        { content: "SUBTOTAL", colSpan: 2, styles: { fontStyle: "bold", fillColor: [240, 240, 240] } },
        { content: formatBRL(totalOriginal), styles: { fontStyle: "bold", fillColor: [240, 240, 240] } },
        { content: formatBRL(totalAtualizado), styles: { fontStyle: "bold", fillColor: [240, 240, 240] } },
        { content: formatBRL(totalJuros), styles: { fontStyle: "bold", fillColor: [240, 240, 240] } },
        { content: formatBRL(totalParcelas), styles: { fontStyle: "bold", fillColor: [240, 240, 240] } },
      ],
    ] as any,
    foot: [
      [
        { content: `Multa (${data.multa_percentual}%)`, colSpan: 5, styles: { fontStyle: "bold" } },
        formatBRL(data.multa_valor),
      ],
      [
        { content: `Honorários (${data.honorarios_percentual}%)`, colSpan: 5, styles: { fontStyle: "bold" } },
        formatBRL(data.honorarios_valor),
      ],
      [
        { content: "TOTAL GERAL", colSpan: 5, styles: { fontStyle: "bold", fillColor: NAVY, textColor: GOLD } },
        { content: formatBRL(data.total_geral), styles: { fontStyle: "bold", fillColor: NAVY, textColor: GOLD } },
      ],
    ] as any,
    theme: "grid",
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontSize: 8 },
    footStyles: { fillColor: [245, 245, 245], fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    columnStyles: { 0: { cellWidth: 45 }, 1: { cellWidth: 22 } },
    margin: { left: 20, right: 20 },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  if (y > pageHeight - 60) {
    doc.addPage();
    y = drawHeader(doc, pageWidth) + 10;
  }

  desenhaSecao("DADOS PARA PAGAMENTO", [
    ["Banco", data.banco_codigo ? `${data.banco_nome} (${data.banco_codigo})` : data.banco_nome],
    ["Agência / Conta", `${data.banco_agencia || "—"} / ${data.banco_conta || "—"}`],
    ["Favorecido", data.banco_favorecido],
    ["PIX", data.banco_pix],
  ]);
  y += 5;

  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(80, 80, 80);
  const aviso =
    "O não pagamento no prazo implicará as medidas judiciais cabíveis, incluindo protesto e ação de cobrança, com acréscimo de custas processuais.";
  const avisoLinhas = doc.splitTextToSize(aviso, pageWidth - 40);
  avisoLinhas.forEach((l: string) => {
    if (y > pageHeight - 40) {
      doc.addPage();
      y = drawHeader(doc, pageWidth) + 10;
    }
    doc.text(l, 20, y);
    y += 4;
  });
  y += 10;

  if (y > pageHeight - 40) {
    doc.addPage();
    y = drawHeader(doc, pageWidth) + 10;
  }
  const cidade = "Primavera do Leste/MT";
  const dataHoje = new Date().toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(20, 20, 20);
  doc.text(`${cidade}, ${dataHoje}.`, pageWidth / 2, y, { align: "center" });
  y += 15;

  doc.line(pageWidth / 2 - 40, y, pageWidth / 2 + 40, y);
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.text("Juliana Araújo da Silva", pageWidth / 2, y, { align: "center" });
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("OAB/MT 34.182", pageWidth / 2, y, { align: "center" });

  addFooter(doc, pageWidth, pageHeight);
  return doc;
}

export async function generateNotificationPDFBlob(data: NotificacaoData): Promise<Blob> {
  const doc = generateNotificationPDF(data);
  await aplicarTimbradoPdf(doc);
  return doc.output("blob");
}

export function generateReceiptPDF(data: NotificacaoData): Blob {
  const doc = new jsPDF({ orientation: "landscape", format: [148, 105] });
  const pageWidth = doc.internal.pageSize.width;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text("JAS ADVOCACIA", 10, 12);

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 120, 120);
  doc.text("OAB/MT 34.182 | (66) 99262-4753", 10, 17);

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.5);
  doc.line(10, 20, pageWidth - 10, 20);

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text("RECIBO DE ENTREGA DE NOTIFICAÇÃO", pageWidth / 2, 28, {
    align: "center",
  });

  let y = 36;
  doc.setFontSize(8);
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "normal");

  const info: [string, string][] = [
    ["Notificante:", data.notificante_nome || ""],
    ["Notificado:", data.notificado_nome || ""],
    ["CPF:", data.notificado_cpf || ""],
    ["Referência:", data.referencia || ""],
    ["Valor Total:", formatBRL(data.total_geral || 0)],
    ["Data de entrega:", new Date().toLocaleDateString("pt-BR")],
  ];

  info.forEach(([label, valor]) => {
    doc.setFont("helvetica", "bold");
    doc.text(label, 10, y);
    doc.setFont("helvetica", "normal");
    doc.text(valor, 45, y);
    y += 6;
  });

  y += 4;
  doc.line(10, y, pageWidth / 2 - 5, y);
  doc.line(pageWidth / 2 + 5, y, pageWidth - 10, y);
  y += 4;
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text("Assinatura do Notificado", 10, y);
  doc.text("Assinatura da Advogada", pageWidth / 2 + 5, y);

  return doc.output("blob");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadNotificationPDF(data: NotificacaoData) {
  const blob = await generateNotificationPDFBlob(data);
  const safe = (data.notificado_nome || "Devedor").replace(/\s+/g, "_");
  downloadBlob(blob, `Notificacao_${safe}_${new Date().toISOString().split("T")[0]}.pdf`);
}

export function downloadReceiptPDF(data: NotificacaoData) {
  const blob = generateReceiptPDF(data);
  const safe = (data.notificado_nome || "Devedor").replace(/\s+/g, "_");
  downloadBlob(blob, `Recibo_Entrega_${safe}.pdf`);
}

export async function downloadBothPDFs(data: NotificacaoData) {
  await downloadNotificationPDF(data);
  setTimeout(() => downloadReceiptPDF(data), 400);
}
