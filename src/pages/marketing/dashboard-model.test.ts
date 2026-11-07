import { describe, expect, it } from "vitest";
import {
  periodoDashboard,
  resumoEditorial,
  serieGastos,
} from "./dashboard-model";
import type { LinhaAds } from "./resultados";
import type { Item } from "./model";
const linha = (patch: Partial<LinhaAds> = {}): LinhaAds => ({
  nivel: "conta",
  referencia: "a1",
  data: "2026-11-01",
  moeda: "BRL",
  gasto: 10,
  impressoes: null,
  cliques: null,
  conversoes: null,
  ...patch,
});
describe("Dashboard: integridade da apresentação", () => {
  it("mantém lacunas, zero confirmado e moedas/níveis separados no gráfico", () => {
    const r = serieGastos(
      [
        linha(),
        linha({ referencia: "a2", gasto: 3 }),
        linha({ nivel: "anuncio", gasto: 999 }),
        linha({ moeda: "USD", gasto: 70 }),
        linha({ data: "2026-11-02", gasto: 0 }),
        linha({ data: "2026-11-04", gasto: null }),
      ],
      "BRL",
      "2026-11-01",
      "2026-11-04",
    );
    expect(r.map((x) => x.gasto)).toEqual([13, 0, null, null]);
    expect(r[2].rotulo).toBe("03/11");
  });
  it("não apresenta soma parcial como gasto completo", () => {
    expect(
      serieGastos(
        [linha(), linha({ gasto: null })],
        "BRL",
        "2026-11-01",
        "2026-11-01",
      )[0].gasto,
    ).toBeNull();
  });
  it("limita períodos inválidos e mantém a data civil ao atravessar o mês", () => {
    expect(serieGastos([], "BRL", "2026-11-03", "2026-11-01")).toEqual([]);
    expect(serieGastos([], "BRL", "2024-01-01", "2026-11-01")).toEqual([]);
    expect(periodoDashboard("7", "2026-11-01")).toEqual({
      de: "2026-10-26",
      ate: "2026-11-01",
    });
    expect(periodoDashboard("mes", "2026-11-07")).toEqual({
      de: "2026-11-01",
      ate: "2026-11-07",
    });
  });
  it("exclui encerrados e arquivados das prioridades e atrasos", () => {
    const base = {
      tipo: "conteudo",
      status: "producao",
      prazo: "2026-11-01T12:00:00Z",
      arquivado_em: null,
    } as Item;
    const r = resumoEditorial(
      [
        base,
        { ...base, status: "concluido" },
        { ...base, status: "cancelado" },
        { ...base, arquivado_em: "2026-11-02" },
        { ...base, status: "aguardando_aprovacao", prazo: null },
      ],
      Date.parse("2026-11-07T12:00:00Z"),
    );
    expect(r.abertos).toHaveLength(2);
    expect(r.vencidos).toBe(1);
    expect(r.producao).toBe(1);
    expect(r.aprovacoes).toBe(1);
  });
});
