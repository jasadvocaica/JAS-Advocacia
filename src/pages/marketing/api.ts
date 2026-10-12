import { supabase } from "@/integrations/supabase/client";
import type { Contexto, Item } from "./model";
const db = supabase as any;
export async function operar(operacao: string, payload: Record<string, any>) {
  const { data, error } = await db.rpc("mkt_operar", { operacao, payload });
  if (error) throw new Error(error.message);
  return data;
}
export async function contexto(): Promise<Contexto> {
  const { data, error } = await db.rpc("mkt_contexto");
  if (error) throw new Error(error.message);
  return data;
}
export async function carregarItens(): Promise<Item[]> {
  return (await tabela("mkt_itens")) as Item[];
}
export async function tabela(nome: string, coluna?: string, id?: string) {
  const resultado: any[] = [];
  for (let offset = 0; ; offset += 1000) {
    let q = db.from(nome).select("*");
    if (coluna && id) q = q.eq(coluna, id);
    if (
      ![
        "mkt_gravacao_itens",
        "comercial_demanda_teses",
        "juridico_tese_servicos",
      ].includes(nome)
    )
      q = q.order("id");
    const { data, error } = await q.range(offset, offset + 999);
    if (error) throw new Error(error.message);
    resultado.push(...(data ?? []));
    if (!data || data.length < 1000) return resultado;
  }
}
export async function demanda() {
  const { data, error } = await db.rpc("mkt_demanda");
  if (error) throw new Error(error.message);
  return data;
}
export async function exportarPDF(
  titulo: string,
  colunas: string[],
  linhas: (string | number)[][],
) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const pdf = new jsPDF({ orientation: "landscape" });
  pdf.setFontSize(16);
  pdf.text("Juliana Araújo Advocacia — Marketing", 14, 15);
  pdf.setFontSize(11);
  pdf.text(titulo, 14, 24);
  autoTable(pdf, {
    startY: 30,
    head: [colunas],
    body: linhas,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [28, 44, 62] },
  });
  pdf.save("marketing-relatorio.pdf");
}

export async function historicoDemanda(id_demanda: string) {
  const { data, error } = await db.rpc("mkt_demanda_historico", { id_demanda });
  if (error) throw new Error(error.message);
  return data as any[];
}
