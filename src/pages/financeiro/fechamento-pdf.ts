import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatBRL } from "@/lib/format";
import { nomeMes } from "@/lib/simples-nacional";

interface FechamentoPdfData {
  mes: number;
  ano: number;
  status: "aberto" | "fechado" | "revisao";
  fechado_em?: string | null;
  escritorio_nome?: string;
  receitas: {
    fixo: number;
    exito: number;
    consultoria: number;
    outros: number;
    total: number;
  };
  simples: {
    rbt12: number;
    faixa: number;
    aliquotaNominal: number; // em %
    aliquotaEfetiva: number; // em %
    valorSimples: number;
    detalhamento: Record<string, number>;
  };
  marketing: {
    percentual: number;
    valor: number;
  };
  proLabore: number;
  repassesParceiros: number;
  outrasDespesas: number;
  resultadoLiquido: number;
  margem: number;
  observacoes?: string | null;
}

const COR_GOLD: [number, number, number] = [184, 134, 11];
const COR_TEXT: [number, number, number] = [30, 30, 30];
const COR_MUTED: [number, number, number] = [110, 110, 110];
const COR_LINHA: [number, number, number] = [220, 220, 220];

export function gerarPdfFechamento(data: FechamentoPdfData): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margemX = 15;
  let y = 18;

  // ==== Cabeçalho
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...COR_TEXT);
  doc.text(data.escritorio_nome ?? "Relatório Financeiro", margemX, y);

  y += 6;
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COR_MUTED);
  doc.text(
    `Fechamento mensal — ${nomeMes(data.mes)} / ${data.ano}`,
    margemX,
    y,
  );

  // status badge à direita
  const statusLabel =
    data.status === "fechado" ? "FECHADO" : data.status === "revisao" ? "EM REVISÃO" : "ABERTO";
  const statusCor: [number, number, number] =
    data.status === "fechado" ? [22, 130, 67] : data.status === "revisao" ? [184, 134, 11] : [110, 110, 110];
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...statusCor);
  doc.text(statusLabel, pageWidth - margemX, y, { align: "right" });

  if (data.fechado_em) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COR_MUTED);
    doc.text(
      `Fechado em ${new Date(data.fechado_em).toLocaleString("pt-BR")}`,
      pageWidth - margemX,
      y + 4,
      { align: "right" },
    );
  }

  y += 6;
  doc.setDrawColor(...COR_LINHA);
  doc.line(margemX, y, pageWidth - margemX, y);
  y += 6;

  // ==== Resumo executivo (4 KPIs)
  const kpiW = (pageWidth - margemX * 2 - 6) / 4;
  const kpis = [
    { label: "Receita total", value: formatBRL(data.receitas.total) },
    {
      label: `Simples (faixa ${data.simples.faixa})`,
      value: formatBRL(data.simples.valorSimples),
      sub: `${data.simples.aliquotaEfetiva.toFixed(2)}% efetiva`,
    },
    {
      label: "Repasses parceiros",
      value: formatBRL(data.repassesParceiros),
    },
    {
      label: "Resultado líquido",
      value: formatBRL(data.resultadoLiquido),
      sub: `${data.margem.toFixed(1)}% margem`,
      gold: true,
    },
  ];

  kpis.forEach((kpi, i) => {
    const x = margemX + i * (kpiW + 2);
    doc.setDrawColor(...COR_LINHA);
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(x, y, kpiW, 22, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...COR_MUTED);
    doc.text(kpi.label.toUpperCase(), x + 3, y + 5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...(kpi.gold ? COR_GOLD : COR_TEXT));
    doc.text(kpi.value, x + 3, y + 12);

    if (kpi.sub) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...COR_MUTED);
      doc.text(kpi.sub, x + 3, y + 17);
    }
  });
  y += 28;

  // ==== DRE
  autoTable(doc, {
    startY: y,
    head: [["DRE — Demonstrativo do Resultado", "Valor"]],
    body: [
      ["Honorários fixos / mensalidades", formatBRL(data.receitas.fixo)],
      ["Honorários de êxito", formatBRL(data.receitas.exito)],
      ["Consultoria", formatBRL(data.receitas.consultoria)],
      ["Outras receitas", formatBRL(data.receitas.outros)],
      [{ content: "(=) Receita total", styles: { fontStyle: "bold" } }, { content: formatBRL(data.receitas.total), styles: { fontStyle: "bold" } }],
      ["(−) Repasses a parceiros", `- ${formatBRL(data.repassesParceiros)}`],
      [
        `(−) Simples Nacional (${data.simples.aliquotaEfetiva.toFixed(2)}%)`,
        `- ${formatBRL(data.simples.valorSimples)}`,
      ],
      [
        `(−) Marketing (${data.marketing.percentual}%)`,
        `- ${formatBRL(data.marketing.valor)}`,
      ],
      ["(−) Pró-labore", `- ${formatBRL(data.proLabore)}`],
      ["(−) Outras despesas", `- ${formatBRL(data.outrasDespesas)}`],
      [
        { content: "(=) Resultado líquido", styles: { fontStyle: "bold", textColor: COR_GOLD } },
        {
          content: `${formatBRL(data.resultadoLiquido)}  (${data.margem.toFixed(1)}%)`,
          styles: { fontStyle: "bold", textColor: COR_GOLD },
        },
      ],
    ],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: COR_GOLD, textColor: 255, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right", cellWidth: 50 } },
    margin: { left: margemX, right: margemX },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // ==== Simples Nacional Anexo IV
  if (y > 230) { doc.addPage(); y = 18; }

  autoTable(doc, {
    startY: y,
    head: [["Simples Nacional — Anexo IV", ""]],
    body: [
      ["RBT12 (receita bruta últimos 12 meses)", formatBRL(data.simples.rbt12)],
      ["Receita do mês", formatBRL(data.receitas.total)],
      ["Faixa", `${data.simples.faixa}ª de 6`],
      ["Alíquota nominal", `${data.simples.aliquotaNominal.toFixed(2)}%`],
      ["Alíquota efetiva", `${data.simples.aliquotaEfetiva.toFixed(2)}%`],
      [
        { content: "DAS a recolher", styles: { fontStyle: "bold" } },
        { content: formatBRL(data.simples.valorSimples), styles: { fontStyle: "bold" } },
      ],
    ],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: COR_GOLD, textColor: 255, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right", cellWidth: 50 } },
    margin: { left: margemX, right: margemX },
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  // detalhamento por tributo
  const tributos = Object.entries(data.simples.detalhamento);
  if (tributos.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Distribuição por tributo", "Valor"]],
      body: tributos.map(([trib, val]) => [trib, formatBRL(val)]),
      theme: "striped",
      styles: { font: "helvetica", fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [240, 240, 240], textColor: COR_TEXT, fontStyle: "bold" },
      columnStyles: { 1: { halign: "right", cellWidth: 50 } },
      margin: { left: margemX, right: margemX },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ==== Marketing + Pró-labore
  if (y > 240) { doc.addPage(); y = 18; }

  autoTable(doc, {
    startY: y,
    head: [["Marketing & Pró-labore", "Valor"]],
    body: [
      [`Verba de marketing (${data.marketing.percentual}% s/ receita)`, formatBRL(data.marketing.valor)],
      [
        "% efetivo de marketing sobre receita",
        data.receitas.total > 0
          ? `${((data.marketing.valor / data.receitas.total) * 100).toFixed(1)}%`
          : "—",
      ],
      ["Pró-labore aos sócios", formatBRL(data.proLabore)],
      [
        "% de pró-labore sobre receita",
        data.receitas.total > 0
          ? `${((data.proLabore / data.receitas.total) * 100).toFixed(1)}%`
          : "—",
      ],
    ],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: COR_GOLD, textColor: 255, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right", cellWidth: 50 } },
    margin: { left: margemX, right: margemX },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // ==== Observações
  if (data.observacoes && data.observacoes.trim()) {
    if (y > 250) { doc.addPage(); y = 18; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...COR_TEXT);
    doc.text("Observações", margemX, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COR_MUTED);
    const linhas = doc.splitTextToSize(data.observacoes, pageWidth - margemX * 2);
    doc.text(linhas, margemX, y);
    y += linhas.length * 4;
  }

  // ==== Rodapé em todas as páginas
  const totalPaginas = (doc as any).getNumberOfPages();
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...COR_MUTED);
    doc.text(
      `Gerado em ${new Date().toLocaleString("pt-BR")}`,
      margemX,
      doc.internal.pageSize.getHeight() - 8,
    );
    doc.text(
      `Página ${i} de ${totalPaginas}`,
      pageWidth - margemX,
      doc.internal.pageSize.getHeight() - 8,
      { align: "right" },
    );
  }

  return doc;
}
