import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatBRL } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const COR_GOLD: [number, number, number] = [184, 134, 11];
const COR_TEXT: [number, number, number] = [30, 30, 30];
const COR_MUTED: [number, number, number] = [110, 110, 110];

interface GerarReciboParams {
  membroId: string;
  membroNome: string;
  membroCargo: string;
  mes: number;
  ano: number;
  /** Bolsa mensal cadastrada (valor_fixo). Será dividida por 30 = valor diário. */
  bolsaMensal: number;
  bonus?: number;
  desconto?: number;
}

interface DiaRegistro {
  data: string;        // YYYY-MM-DD
  dow: number;
  entrada: string | null;
  saida: string | null;
  horas: number;
  valor: number;
  status: string;
}

async function buscarDadosRecibo(p: GerarReciboParams): Promise<{
  escritorio: string;
  valorDiario: number;
  dias: DiaRegistro[];
  diasTrabalhados: number;
  totalDias: number;
  bonus: number;
  desconto: number;
  totalReceber: number;
}> {
  const inicio = new Date(p.ano, p.mes - 1, 1).toISOString().slice(0, 10);
  const fim = new Date(p.ano, p.mes, 0).toISOString().slice(0, 10);

  const [{ data: regs }, { data: cfg }, { data: membro }] = await Promise.all([
    supabase
      .from("gp_ponto_registros")
      .select("data, entrada, saida, horas_trabalhadas, status")
      .eq("membro_id", p.membroId)
      .gte("data", inicio)
      .lte("data", fim)
      .order("data", { ascending: true }),
    supabase
      .from("configuracoes_sistema")
      .select("valor")
      .eq("chave", "escritorio_nome")
      .maybeSingle(),
    supabase
      .from("equipe_membros")
      .select("data_admissao")
      .eq("id", p.membroId)
      .maybeSingle(),
  ]);

  const escritorio = (cfg?.valor as string) || "Escritório";
  const valorDiario = Number(((p.bolsaMensal || 0) / 30).toFixed(2));

  const regsPorData = new Map<string, any>();
  for (const r of (regs ?? []) as any[]) {
    regsPorData.set(r.data, r);
  }

  // Dia inicial: se admissão cai neste mês/ano, começa nela; senão dia 1.
  // O fim é sempre o último dia do mês (permite fechamento antecipado).
  const ultimoDia = new Date(p.ano, p.mes, 0).getDate();
  let diaInicial = 1;
  if (membro?.data_admissao) {
    const adm = new Date((membro.data_admissao as string) + "T00:00:00");
    const admMes = adm.getFullYear() * 12 + adm.getMonth();
    const refMes = p.ano * 12 + (p.mes - 1);
    if (admMes === refMes) diaInicial = adm.getDate();
    else if (admMes > refMes) diaInicial = ultimoDia + 1; // sem dias a pagar
  }

  const dias: DiaRegistro[] = [];
  for (let d = diaInicial; d <= ultimoDia; d++) {
    const dt = new Date(p.ano, p.mes - 1, d);
    const dataStr = `${p.ano}-${String(p.mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const r = regsPorData.get(dataStr);
    dias.push({
      data: dataStr,
      dow: dt.getDay(),
      entrada: r?.entrada ? (r.entrada as string).slice(0, 5) : null,
      saida: r?.saida ? (r.saida as string).slice(0, 5) : null,
      horas: Number(r?.horas_trabalhadas || 0),
      valor: valorDiario,
      status: r?.status ?? "",
    });
  }

  const diasTrabalhados = dias.length; // todos os dias do mês
  const totalDias = +(diasTrabalhados * valorDiario).toFixed(2);
  const bonus = Number(p.bonus || 0);
  const desconto = Number(p.desconto || 0);
  const totalReceber = +(totalDias + bonus - desconto).toFixed(2);

  return { escritorio, valorDiario, dias, diasTrabalhados, totalDias, bonus, desconto, totalReceber };
}

function desenharReciboNoDoc(
  doc: jsPDF,
  p: GerarReciboParams,
  dados: Awaited<ReturnType<typeof buscarDadosRecibo>>,
) {
  const pageW = doc.internal.pageSize.getWidth();
  let y = 40;

  // Cabeçalho
  doc.setTextColor(...COR_GOLD);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Recibo de Bolsa-Auxílio", pageW / 2, y, { align: "center" });
  y += 18;
  doc.setFontSize(11);
  doc.setTextColor(...COR_MUTED);
  doc.text(dados.escritorio, pageW / 2, y, { align: "center" });
  y += 14;
  doc.setTextColor(...COR_TEXT);
  doc.text(`Competência: ${MESES[p.mes - 1]} / ${p.ano}`, pageW / 2, y, { align: "center" });
  y += 22;

  // Dados da estagiária
  doc.setDrawColor(...COR_GOLD);
  doc.setLineWidth(0.6);
  doc.line(40, y, pageW - 40, y);
  y += 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(p.membroNome, 40, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...COR_MUTED);
  doc.text(p.membroCargo, 40, y + 14);
  doc.text(`Bolsa mensal cadastrada: ${formatBRL(p.bolsaMensal)}`, pageW - 40, y, { align: "right" });
  doc.text(`Valor diário (bolsa ÷ 30): ${formatBRL(dados.valorDiario)}`, pageW - 40, y + 14, { align: "right" });
  y += 30;
  doc.setTextColor(...COR_TEXT);

  // Tabela detalhada dia a dia
  if (dados.dias.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(...COR_MUTED);
    doc.text(
      "Nenhum dia com registro de ponto encontrado para esta competência.",
      40,
      y,
    );
    y += 20;
    doc.setTextColor(...COR_TEXT);
  } else {
    autoTable(doc, {
      startY: y,
      head: [["Data", "Dia", "Entrada", "Saída", "Horas", "Valor do dia"]],
      body: dados.dias.map((d) => {
        const dt = new Date(d.data + "T00:00:00");
        const dataFmt = `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
        return [
          dataFmt,
          DOW[d.dow],
          d.entrada ?? "—",
          d.saida ?? "—",
          d.horas ? d.horas.toFixed(2).replace(".", ",") + "h" : "—",
          formatBRL(d.valor),
        ];
      }),
      styles: { fontSize: 9, cellPadding: 4, textColor: COR_TEXT },
      headStyles: { fillColor: COR_GOLD, textColor: [255, 255, 255], fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 40 },
        2: { cellWidth: 60, halign: "center" },
        3: { cellWidth: 60, halign: "center" },
        4: { cellWidth: 60, halign: "right" },
        5: { halign: "right" },
      },
      foot: [[
        { content: `${dados.diasTrabalhados} dia(s) no mês`, colSpan: 5, styles: { fontStyle: "bold", halign: "right" } },
        { content: formatBRL(dados.totalDias), styles: { fontStyle: "bold", halign: "right" } },
      ]],
      footStyles: { fillColor: [245, 240, 225], textColor: COR_TEXT },
      margin: { left: 40, right: 40 },
    });
    y = (doc as any).lastAutoTable.finalY + 18;
  }

  // Resumo financeiro
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Resumo", 40, y);
  y += 6;
  doc.setLineWidth(0.4);
  doc.setDrawColor(200, 200, 200);
  doc.line(40, y, pageW - 40, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  const linhas: Array<[string, string]> = [
    [`${dados.diasTrabalhados} dias × valor diário (${formatBRL(dados.valorDiario)})`, formatBRL(dados.totalDias)],
  ];
  if (dados.bonus > 0) linhas.push(["Bônus / acréscimo", `+ ${formatBRL(dados.bonus)}`]);
  if (dados.desconto > 0) linhas.push(["Desconto", `− ${formatBRL(dados.desconto)}`]);

  for (const [label, valor] of linhas) {
    doc.text(label, 40, y);
    doc.text(valor, pageW - 40, y, { align: "right" });
    y += 14;
  }
  y += 6;
  doc.setDrawColor(...COR_GOLD);
  doc.setLineWidth(0.6);
  doc.line(40, y, pageW - 40, y);
  y += 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...COR_GOLD);
  doc.text("Total a receber", 40, y);
  doc.text(formatBRL(dados.totalReceber), pageW - 40, y, { align: "right" });
  y += 36;

  // Declaração + assinatura
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...COR_TEXT);
  const declar =
    `Declaro ter recebido de ${dados.escritorio} a importância de ${formatBRL(dados.totalReceber)} ` +
    `(${valorPorExtensoSimples(dados.totalReceber)}) referente à bolsa-auxílio de estágio do mês ` +
    `de ${MESES[p.mes - 1]} de ${p.ano}, conforme detalhamento acima.`;
  const wrap = doc.splitTextToSize(declar, pageW - 80);
  doc.text(wrap, 40, y);
  y += wrap.length * 13 + 50;

  doc.setLineWidth(0.4);
  doc.setDrawColor(...COR_TEXT);
  doc.line(80, y, pageW - 80, y);
  y += 14;
  doc.setFontSize(10);
  doc.setTextColor(...COR_MUTED);
  doc.text(p.membroNome, pageW / 2, y, { align: "center" });
  doc.text("Assinatura da estagiária", pageW / 2, y + 14, { align: "center" });
}

/**
 * Gera o recibo detalhado de uma estagiária, com o detalhamento dia-a-dia
 * do mês. Valor diário = bolsa mensal / 30 (regra do escritório).
 */
export async function gerarReciboEstagiariaPdf(p: GerarReciboParams): Promise<jsPDF> {
  const dados = await buscarDadosRecibo(p);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  desenharReciboNoDoc(doc, p, dados);
  return doc;
}

/**
 * Gera um único PDF consolidado com os recibos de várias estagiárias.
 * Cada recibo ocupa uma página separada.
 */
export async function gerarReciboConsolidadoPdf(
  itens: GerarReciboParams[],
): Promise<jsPDF> {
  if (itens.length === 0) {
    throw new Error("Nenhuma estagiária para gerar recibo.");
  }

  const doc = new jsPDF({ unit: "pt", format: "a4" });

  for (let i = 0; i < itens.length; i++) {
    if (i > 0) doc.addPage();
    const dados = await buscarDadosRecibo(itens[i]);
    desenharReciboNoDoc(doc, itens[i], dados);
  }

  return doc;
}

/** Geração simples de extenso aproximado em BRL para uso em recibos. */
function valorPorExtensoSimples(valor: number): string {
  const reais = Math.floor(valor);
  const cent = Math.round((valor - reais) * 100);
  const parteReais = `${reais.toLocaleString("pt-BR")} ${reais === 1 ? "real" : "reais"}`;
  if (cent === 0) return parteReais;
  return `${parteReais} e ${cent} ${cent === 1 ? "centavo" : "centavos"}`;
}
