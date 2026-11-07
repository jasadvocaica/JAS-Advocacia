import type { LinhaAds } from "./resultados";
import type { Item } from "./model";

// Ausência de um dia/valor permanece null; não representa gasto zero.
export function serieGastos(
  linhas: LinhaAds[],
  moeda: string,
  de: string,
  ate: string,
) {
  const inicio = Date.parse(`${de}T00:00:00Z`),
    fim = Date.parse(`${ate}T00:00:00Z`);
  if (
    !Number.isFinite(inicio) ||
    !Number.isFinite(fim) ||
    fim < inicio ||
    fim - inicio > 365 * 86400000
  )
    return [];
  const dias = new Map<string, (number | null)[]>();
  for (const l of linhas.filter(
    (l) => l.nivel === "conta" && l.moeda === moeda,
  ))
    dias.set(l.data, [...(dias.get(l.data) ?? []), l.gasto]);
  return Array.from({ length: (fim - inicio) / 86400000 + 1 }, (_, i) => {
    const data = new Date(inicio + i * 86400000).toISOString().slice(0, 10),
      valores = dias.get(data);
    return {
      data,
      rotulo: `${data.slice(8, 10)}/${data.slice(5, 7)}`,
      gasto:
        !valores?.length || valores.some((v) => v == null)
          ? null
          : valores.reduce<number>((n, v) => n + Number(v), 0),
    };
  });
}
const encerrados = new Set([
  "publicado",
  "concluido",
  "rejeitado",
  "convertida",
  "encerrada",
  "arquivado",
  "cancelado",
]);
export const itensAbertos = (itens: Item[]) =>
  itens.filter((i) => !i.arquivado_em && !encerrados.has(i.status));
export function resumoEditorial(itens: Item[], agora = Date.now()) {
  const abertos = itensAbertos(itens);
  return {
    abertos,
    vencidos: abertos.filter((i) => i.prazo && Date.parse(i.prazo) < agora)
      .length,
    aprovacoes: abertos.filter((i) => i.status === "aguardando_aprovacao")
      .length,
    producao: abertos.filter((i) =>
      ["producao", "edicao", "gravado", "aguardando_gravacao"].includes(
        i.status,
      ),
    ).length,
    planejamento: abertos.filter((i) =>
      ["ideia", "pauta", "planejamento"].includes(i.tipo),
    ).length,
    ajustes: abertos.filter((i) => i.status === "ajustes").length,
  };
}
export function periodoDashboard(tipo: string, hoje: string) {
  if (tipo === "mes") return { de: `${hoje.slice(0, 7)}-01`, ate: hoje };
  const dias = tipo === "7" ? 7 : 30;
  const fim = Date.parse(`${hoje}T00:00:00Z`);
  return {
    de: new Date(fim - (dias - 1) * 86400000).toISOString().slice(0, 10),
    ate: hoje,
  };
}
