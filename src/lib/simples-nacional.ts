/**
 * Cálculo do Simples Nacional — Anexo IV (Advocacia)
 * Tabela vigente conforme LC 123/2006 + atualizações.
 */

export interface FaixaAnexoIV {
  faixa: number;
  faixaMin: number;
  faixaMax: number;
  aliquota: number; // ex: 0.045 = 4,5%
  deducao: number;
}

export const ANEXO_IV: FaixaAnexoIV[] = [
  { faixa: 1, faixaMin: 0,           faixaMax: 180_000,    aliquota: 0.045, deducao: 0 },
  { faixa: 2, faixaMin: 180_000.01,  faixaMax: 360_000,    aliquota: 0.09,  deducao: 8_100 },
  { faixa: 3, faixaMin: 360_000.01,  faixaMax: 720_000,    aliquota: 0.102, deducao: 12_420 },
  { faixa: 4, faixaMin: 720_000.01,  faixaMax: 1_800_000,  aliquota: 0.14,  deducao: 39_780 },
  { faixa: 5, faixaMin: 1_800_000.01,faixaMax: 3_600_000,  aliquota: 0.22,  deducao: 183_780 },
  { faixa: 6, faixaMin: 3_600_000.01,faixaMax: 4_800_000,  aliquota: 0.33,  deducao: 828_000 },
];

/** Distribuição dos tributos dentro do Anexo IV (advocacia). */
export const DISTRIBUICAO_ANEXO_IV: Record<string, number> = {
  IRPJ:   0.1880,
  CSLL:   0.1520,
  COFINS: 0.1290,
  PIS:    0.0280,
  ISS:    0.4380,
  CPP:    0.0650,
};

export interface SimplesResultado {
  faixa: number;
  rbt12: number;
  aliquotaNominal: number;   // %
  aliquotaEfetiva: number;   // %
  valorSimples: number;
  detalhamento: Record<string, number>;
}

export function calcularSimplesNacional(receitaMes: number, rbt12: number): SimplesResultado {
  if (receitaMes <= 0) {
    return {
      faixa: 1,
      rbt12,
      aliquotaNominal: 0,
      aliquotaEfetiva: 0,
      valorSimples: 0,
      detalhamento: {},
    };
  }

  const faixa =
    ANEXO_IV.find((f) => rbt12 >= f.faixaMin && rbt12 <= f.faixaMax) ??
    ANEXO_IV[ANEXO_IV.length - 1];

  const aliquotaEfetiva =
    rbt12 > 0
      ? Math.max(((rbt12 * faixa.aliquota) - faixa.deducao) / rbt12, 0)
      : faixa.aliquota;

  const valorSimples = receitaMes * aliquotaEfetiva;

  const detalhamento: Record<string, number> = {};
  for (const [tributo, pct] of Object.entries(DISTRIBUICAO_ANEXO_IV)) {
    detalhamento[tributo] = +(valorSimples * pct).toFixed(2);
  }

  return {
    faixa: faixa.faixa,
    rbt12,
    aliquotaNominal: +(faixa.aliquota * 100).toFixed(2),
    aliquotaEfetiva: +(aliquotaEfetiva * 100).toFixed(4),
    valorSimples: +valorSimples.toFixed(2),
    detalhamento,
  };
}

export function calcularMarketing(receitaMes: number, percentual: number): number {
  if (receitaMes <= 0 || percentual <= 0) return 0;
  return +(receitaMes * (percentual / 100)).toFixed(2);
}

export interface ResultadoLiquidoArgs {
  receitaTotal: number;
  repassesParceiros: number;
  valorSimples: number;
  valorMarketing: number;
  valorProLabore: number;
  outrasDespesas: number;
}

export function calcularResultadoLiquido(a: ResultadoLiquidoArgs): number {
  return +(
    a.receitaTotal -
    a.repassesParceiros -
    a.valorSimples -
    a.valorMarketing -
    a.valorProLabore -
    a.outrasDespesas
  ).toFixed(2);
}

export const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function nomeMes(mes: number): string {
  return MESES_PT[mes - 1] ?? String(mes);
}
