import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const COR_GOLD: [number, number, number] = [184, 134, 11];
const COR_TEXT: [number, number, number] = [30, 30, 30];
const COR_MUTED: [number, number, number] = [110, 110, 110];

export interface DiaRelatorio {
  data: string;
  dow_label: string;
  entrada: string | null;
  saida: string | null;
  horas: number;
  previsto: boolean;
  observacao: string | null;
}

export interface StatsRelatorio {
  membro: string;
  competencia: string;
  horas_diarias_previstas: number;
  dias_jornada_previstos: number;
  dias_com_ponto: number;
  faltas_em_dias_de_jornada: number;
  horas_trabalhadas_total: number;
  horas_previstas_mes: number;
  saldo_horas: number;
}

export interface HoraComplementar {
  id?: string;
  data: string;
  descricao: string;
  horas: number;
}

export interface GerarRelatorioHorasParams {
  escritorio: string;
  cargo: string;
  stats: StatsRelatorio;
  dias: DiaRelatorio[];
  analise: string; // markdown vindo da IA
  horasComplementares?: HoraComplementar[];
}

/** Render markdown bem simples (negrito **x**, listas - / *, títulos #). */
function escreverMarkdown(doc: jsPDF, md: string, x: number, yInicial: number, maxW: number): number {
  let y = yInicial;
  const linhas = md.split("\n");
  for (const linhaBruta of linhas) {
    const linha = linhaBruta.trimEnd();
    if (!linha.trim()) { y += 6; continue; }

    // Page break
    if (y > doc.internal.pageSize.getHeight() - 60) {
      doc.addPage();
      y = 50;
    }

    let texto = linha;
    let fontSize = 10;
    let fontStyle: "normal" | "bold" = "normal";
    let indent = 0;

    if (texto.startsWith("### ")) { fontSize = 11; fontStyle = "bold"; texto = texto.slice(4); }
    else if (texto.startsWith("## ")) { fontSize = 12; fontStyle = "bold"; texto = texto.slice(3); }
    else if (texto.startsWith("# ")) { fontSize = 13; fontStyle = "bold"; texto = texto.slice(2); }
    else if (/^\s*[-*]\s+/.test(texto)) {
      texto = "• " + texto.replace(/^\s*[-*]\s+/, "");
      indent = 10;
    }

    // Remove markdown de negrito mas mantém o texto (renderizamos como bold quando começa com **)
    const isLinhaToda = /^\*\*(.+)\*\*:?\s*$/.test(texto);
    if (isLinhaToda) {
      fontStyle = "bold";
      texto = texto.replace(/\*\*/g, "");
    } else {
      texto = texto.replace(/\*\*(.+?)\*\*/g, "$1");
    }

    doc.setFont("helvetica", fontStyle);
    doc.setFontSize(fontSize);
    doc.setTextColor(...COR_TEXT);

    const wrap = doc.splitTextToSize(texto, maxW - indent);
    for (const w of wrap) {
      if (y > doc.internal.pageSize.getHeight() - 60) {
        doc.addPage();
        y = 50;
      }
      doc.text(w, x + indent, y);
      y += fontSize + 3;
    }
    y += 2;
  }
  return y;
}

export function gerarRelatorioHorasPdf(p: GerarRelatorioHorasParams): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  let y = 40;

  // Cabeçalho
  doc.setTextColor(...COR_GOLD);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Relatório de Horas de Estágio", pageW / 2, y, { align: "center" });
  y += 18;
  doc.setFontSize(11);
  doc.setTextColor(...COR_MUTED);
  doc.text(p.escritorio, pageW / 2, y, { align: "center" });
  y += 14;
  doc.setTextColor(...COR_TEXT);
  doc.text(`Competência: ${p.stats.competencia}`, pageW / 2, y, { align: "center" });
  y += 22;

  // Dados da estagiária
  doc.setDrawColor(...COR_GOLD);
  doc.setLineWidth(0.6);
  doc.line(40, y, pageW - 40, y);
  y += 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(p.stats.membro, 40, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...COR_MUTED);
  doc.text(p.cargo, 40, y + 14);
  y += 30;
  doc.setTextColor(...COR_TEXT);

  // Indicadores
  const totalComplementares = (p.horasComplementares ?? []).reduce((s, h) => s + Number(h.horas || 0), 0);
  const totalConsolidado = p.stats.horas_trabalhadas_total + totalComplementares;
  const saldoConsolidado = totalConsolidado - p.stats.horas_previstas_mes;

  autoTable(doc, {
    startY: y,
    head: [["Indicador", "Valor"]],
    body: [
      ["Horas registradas no ponto", `${p.stats.horas_trabalhadas_total.toFixed(2).replace(".", ",")} h`],
      ["Horas complementares", `${totalComplementares.toFixed(2).replace(".", ",")} h`],
      ["Total consolidado", `${totalConsolidado.toFixed(2).replace(".", ",")} h`],
      ["Horas previstas no mês", `${p.stats.horas_previstas_mes.toFixed(2).replace(".", ",")} h`],
      ["Saldo (consolidado − previsto)", `${saldoConsolidado >= 0 ? "+" : ""}${saldoConsolidado.toFixed(2).replace(".", ",")} h`],
      ["Dias previstos de jornada", String(p.stats.dias_jornada_previstos)],
      ["Dias com ponto registrado", String(p.stats.dias_com_ponto)],
      ["Faltas (dias previstos sem registro)", String(p.stats.faltas_em_dias_de_jornada)],
      ["Carga diária prevista", `${p.stats.horas_diarias_previstas} h`],
    ],
    styles: { fontSize: 9, cellPadding: 5, textColor: COR_TEXT },
    headStyles: { fillColor: COR_GOLD, textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: { 1: { halign: "right", cellWidth: 120 } },
    margin: { left: 40, right: 40 },
  });
  y = (doc as any).lastAutoTable.finalY + 18;

  // Tabela de horas complementares
  if ((p.horasComplementares ?? []).length > 0) {
    if (y > doc.internal.pageSize.getHeight() - 150) { doc.addPage(); y = 50; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...COR_TEXT);
    doc.text("Horas complementares", 40, y);
    y += 8;
    autoTable(doc, {
      startY: y,
      head: [["Data", "Atividade", "Horas"]],
      body: p.horasComplementares!.map((h) => {
        const dt = new Date(h.data + "T00:00:00");
        const dataFmt = `${String(dt.getDate()).padStart(2,"0")}/${String(dt.getMonth()+1).padStart(2,"0")}/${dt.getFullYear()}`;
        return [dataFmt, h.descricao, `${Number(h.horas).toFixed(2).replace(".", ",")} h`];
      }),
      styles: { fontSize: 9, cellPadding: 4, textColor: COR_TEXT },
      headStyles: { fillColor: COR_GOLD, textColor: [255, 255, 255], fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: 80 }, 2: { halign: "right", cellWidth: 70 } },
      margin: { left: 40, right: 40 },
    });
    y = (doc as any).lastAutoTable.finalY + 18;
  }

  // Detalhamento dia a dia
  if (y > doc.internal.pageSize.getHeight() - 200) { doc.addPage(); y = 50; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Detalhamento dia a dia", 40, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [["Data", "Dia", "Entrada", "Saída", "Horas", "Obs."]],
    body: p.dias.map((d) => {
      const dt = new Date(d.data + "T00:00:00");
      const dataFmt = `${String(dt.getDate()).padStart(2,"0")}/${String(dt.getMonth()+1).padStart(2,"0")}`;
      const obs = d.previsto && !d.entrada && !d.saida && d.horas === 0 ? "Sem registro" : (d.observacao ?? "");
      return [
        dataFmt,
        d.dow_label,
        d.entrada ?? "—",
        d.saida ?? "—",
        d.horas ? d.horas.toFixed(2).replace(".", ",") + "h" : "—",
        obs,
      ];
    }),
    styles: { fontSize: 8.5, cellPadding: 3, textColor: COR_TEXT },
    headStyles: { fillColor: COR_GOLD, textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 40 },
      2: { cellWidth: 55, halign: "center" },
      3: { cellWidth: 55, halign: "center" },
      4: { cellWidth: 55, halign: "right" },
    },
    margin: { left: 40, right: 40 },
  });
  y = (doc as any).lastAutoTable.finalY + 22;

  // Análise IA
  if (p.analise?.trim()) {
    if (y > doc.internal.pageSize.getHeight() - 200) { doc.addPage(); y = 50; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...COR_GOLD);
    doc.text("Análise", 40, y);
    y += 6;
    doc.setDrawColor(...COR_GOLD);
    doc.setLineWidth(0.5);
    doc.line(40, y, pageW - 40, y);
    y += 14;
    y = escreverMarkdown(doc, p.analise, 40, y, pageW - 80);
  }

  // Rodapé com data de emissão
  const totalPaginas = doc.getNumberOfPages();
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COR_MUTED);
    const emitido = `Emitido em ${new Date().toLocaleDateString("pt-BR")}`;
    doc.text(emitido, 40, doc.internal.pageSize.getHeight() - 25);
    doc.text(`Página ${i} de ${totalPaginas}`, pageW - 40, doc.internal.pageSize.getHeight() - 25, { align: "right" });
  }

  return doc;
}
