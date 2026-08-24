// Cálculo puro de CNIS: tempo de contribuição, período de graça e benefícios possíveis.
// Sem dependências externas — testável e replicável no edge se necessário.

export type CategoriaCnis =
  | "empregado"
  | "domestico"
  | "ci"
  | "mei"
  | "especial"
  | "facultativo";

export interface VinculoCnis {
  empresa: string;
  cnpj?: string | null;
  categoria: CategoriaCnis;
  data_inicio: string; // YYYY-MM-DD
  data_fim: string | null; // null = ativo
  salario_medio?: number | null;
  competencias?: number;
  total_dias?: number;
  observacao?: string | null;
}

export interface OpcoesCalculo {
  desemprego_involuntario?: boolean;
}

export const CATEGORIAS_CNIS: { value: CategoriaCnis; label: string }[] = [
  { value: "empregado", label: "Empregado CLT" },
  { value: "domestico", label: "Empregado doméstico" },
  { value: "ci", label: "Contribuinte individual" },
  { value: "mei", label: "MEI" },
  { value: "especial", label: "Segurado especial" },
  { value: "facultativo", label: "Facultativo" },
];

const PERIODO_GRACA_BASE: Record<CategoriaCnis, number> = {
  empregado: 12,
  domestico: 12,
  ci: 12,
  mei: 12,
  especial: 12,
  facultativo: 6,
};

const CARENCIA = {
  auxilio_incapacidade: 12,
  aposentadoria_incapacidade: 12,
  aposentadoria_tempo: 180,
  salario_maternidade_ci: 10,
  salario_maternidade_mei: 0,
  salario_maternidade_empregado: 0,
  salario_maternidade_domestico: 0,
  salario_maternidade_especial: 10,
  salario_maternidade_facultativo: 10,
};

function parseDate(d: string | Date): Date {
  if (d instanceof Date) return d;
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, (m || 1) - 1, day || 1);
}

export function diasEntreDatas(inicio: string, fim: string | null): number {
  const d1 = parseDate(inicio);
  const d2 = fim ? parseDate(fim) : new Date();
  return Math.max(0, Math.floor((d2.getTime() - d1.getTime()) / 86400000) + 1);
}

export function diasParaTempoContribuicao(totalDias: number) {
  const anos = Math.floor(totalDias / 365);
  const restoDias = totalDias % 365;
  const meses = Math.floor(restoDias / 30);
  const dias = restoDias % 30;
  return { anos, meses, dias, total_dias: totalDias };
}

export function calcularCompetencias(dataInicio: string, dataFim: string | null): number {
  const inicio = parseDate(dataInicio);
  const fim = dataFim ? parseDate(dataFim) : new Date();
  if (fim < inicio) return 0;
  let competencias = 0;
  const atual = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
  const fimMes = new Date(fim.getFullYear(), fim.getMonth(), 1);
  while (atual <= fimMes) {
    competencias++;
    atual.setMonth(atual.getMonth() + 1);
  }
  return competencias;
}

export interface PeriodoGraca {
  qualidade_segurado_ativa: boolean;
  meses_graca: number | null;
  ultima_contribuicao: string | null;
  vence_em: string | null;
  motivo: string;
  dias_restantes: number;
  dias_perdeu: number;
  vinculo_ativo: boolean;
  ultima_categoria: CategoriaCnis | null;
}

export function calcularPeriodoGraca(
  vinculos: VinculoCnis[],
  dataReferencia: string,
  opcoes: OpcoesCalculo = {},
): PeriodoGraca {
  if (!vinculos.length) {
    return {
      qualidade_segurado_ativa: false,
      meses_graca: 0,
      ultima_contribuicao: null,
      vence_em: null,
      motivo: "Sem vínculos encontrados",
      dias_restantes: 0,
      dias_perdeu: 0,
      vinculo_ativo: false,
      ultima_categoria: null,
    };
  }

  const ordenados = [...vinculos].sort((a, b) => {
    const fa = a.data_fim ? parseDate(a.data_fim).getTime() : Date.now();
    const fb = b.data_fim ? parseDate(b.data_fim).getTime() : Date.now();
    return fb - fa;
  });

  const ultimo = ordenados[0];
  const vinculoAtivo = !ultimo.data_fim;

  if (vinculoAtivo) {
    return {
      qualidade_segurado_ativa: true,
      meses_graca: null,
      ultima_contribuicao: null,
      vence_em: null,
      motivo: "Possui vínculo ativo — qualidade de segurado mantida",
      dias_restantes: 0,
      dias_perdeu: 0,
      vinculo_ativo: true,
      ultima_categoria: ultimo.categoria,
    };
  }

  const totalContribuicoes = vinculos.reduce(
    (a, v) => a + (v.competencias ?? calcularCompetencias(v.data_inicio, v.data_fim)),
    0,
  );

  let mesesGraca = PERIODO_GRACA_BASE[ultimo.categoria] ?? 12;
  if (ultimo.categoria !== "facultativo" && totalContribuicoes >= 120) {
    mesesGraca += 12; // dobra para 24 (exceto facultativo)
  }
  if (opcoes.desemprego_involuntario) {
    mesesGraca += 12;
  }

  const ultimaContrib = parseDate(ultimo.data_fim!);
  const venceEm = new Date(ultimaContrib);
  venceEm.setMonth(venceEm.getMonth() + mesesGraca);
  // 15 do mês seguinte ao fim da graça (regra do INSS - simplificada)

  const dataRef = parseDate(dataReferencia);
  const ativa = dataRef <= venceEm;
  const diff = Math.floor((venceEm.getTime() - dataRef.getTime()) / 86400000);

  return {
    qualidade_segurado_ativa: ativa,
    meses_graca: mesesGraca,
    ultima_contribuicao: ultimo.data_fim,
    vence_em: venceEm.toISOString().slice(0, 10),
    motivo: ativa
      ? `Qualidade de segurado ativa até ${venceEm.toLocaleDateString("pt-BR")}`
      : `Qualidade de segurado perdida em ${venceEm.toLocaleDateString("pt-BR")}`,
    dias_restantes: ativa ? diff : 0,
    dias_perdeu: !ativa ? -diff : 0,
    vinculo_ativo: false,
    ultima_categoria: ultimo.categoria,
  };
}

export interface BeneficioPossivel {
  beneficio: string;
  possivel: boolean | null;
  carencia_atingida: boolean | null;
  qualidade_ativa: boolean | null;
  observacao: string;
  faltam_tempo?: { anos: number; meses: number; dias: number; total_dias: number };
}

export function identificarBeneficios(
  vinculos: VinculoCnis[],
  pg: PeriodoGraca,
  totalContribuicoes: number,
  tempoTotal: ReturnType<typeof diasParaTempoContribuicao>,
): BeneficioPossivel[] {
  const beneficios: BeneficioPossivel[] = [];
  const qualidadeAtiva = pg.qualidade_segurado_ativa;
  const totalDias = tempoTotal.total_dias;

  // Auxílio por incapacidade
  beneficios.push({
    beneficio: "Auxílio por incapacidade temporária",
    possivel: qualidadeAtiva && totalContribuicoes >= CARENCIA.auxilio_incapacidade,
    carencia_atingida: totalContribuicoes >= CARENCIA.auxilio_incapacidade,
    qualidade_ativa: qualidadeAtiva,
    observacao: !qualidadeAtiva
      ? "Qualidade de segurado perdida — avaliar tese de manutenção"
      : totalContribuicoes < CARENCIA.auxilio_incapacidade
        ? `Faltam ${CARENCIA.auxilio_incapacidade - totalContribuicoes} contribuições`
        : "Requisitos atendidos",
  });

  // Aposentadoria por incapacidade permanente
  beneficios.push({
    beneficio: "Aposentadoria por incapacidade permanente",
    possivel: qualidadeAtiva && totalContribuicoes >= CARENCIA.aposentadoria_incapacidade,
    carencia_atingida: totalContribuicoes >= CARENCIA.aposentadoria_incapacidade,
    qualidade_ativa: qualidadeAtiva,
    observacao: "Exige comprovação de incapacidade total e permanente",
  });

  // Aposentadoria por tempo / pontos
  const faltamDias = Math.max(0, 180 * 30 - totalDias);
  const faltamTempo = diasParaTempoContribuicao(faltamDias);
  beneficios.push({
    beneficio: "Aposentadoria por tempo de contribuição",
    possivel: totalContribuicoes >= 180,
    carencia_atingida: totalContribuicoes >= 180,
    qualidade_ativa: true,
    faltam_tempo: faltamTempo,
    observacao:
      totalContribuicoes < 180
        ? `Faltam ${faltamTempo.anos}a ${faltamTempo.meses}m ${faltamTempo.dias}d para a carência mínima`
        : "Carência mínima atingida (verifique idade/pontos da EC 103)",
  });

  // Salário-maternidade (depende da última categoria)
  const ultimaCat = pg.ultima_categoria || vinculos[vinculos.length - 1]?.categoria;
  const carenciaMat =
    (ultimaCat && (CARENCIA as Record<string, number>)[`salario_maternidade_${ultimaCat}`]) ?? 10;
  beneficios.push({
    beneficio: "Salário-maternidade",
    possivel: qualidadeAtiva && totalContribuicoes >= carenciaMat,
    carencia_atingida: totalContribuicoes >= carenciaMat,
    qualidade_ativa: qualidadeAtiva,
    observacao:
      carenciaMat === 0
        ? "Sem carência para esta categoria"
        : `Carência: ${carenciaMat} contribuições`,
  });

  // Pensão por morte
  beneficios.push({
    beneficio: "Pensão por morte (dependentes)",
    possivel: qualidadeAtiva,
    carencia_atingida: true,
    qualidade_ativa: qualidadeAtiva,
    observacao: "Sem carência, mas exige qualidade de segurado",
  });

  // BPC/LOAS
  beneficios.push({
    beneficio: "BPC/LOAS (assistencial)",
    possivel: null,
    carencia_atingida: null,
    qualidade_ativa: null,
    observacao: "Não depende de contribuições — verificar renda per capita e deficiência/idade",
  });

  return beneficios;
}

export interface ResultadoCnis {
  vinculos: VinculoCnis[];
  total_contribuicoes: number;
  tempo_total: ReturnType<typeof diasParaTempoContribuicao>;
  periodo_graca: PeriodoGraca;
  beneficios_possiveis: BeneficioPossivel[];
  data_referencia: string;
  ultimo_vinculo: { categoria: CategoriaCnis; data_fim: string | null; empresa: string } | null;
}

export function calcularCNIS(
  vinculos: VinculoCnis[],
  dataReferencia: string,
  opcoes: OpcoesCalculo = {},
): ResultadoCnis {
  const enriquecidos = vinculos
    .filter((v) => v.data_inicio)
    .map((v) => ({
      ...v,
      competencias: calcularCompetencias(v.data_inicio, v.data_fim),
      total_dias: diasEntreDatas(v.data_inicio, v.data_fim),
    }));

  const totalContribuicoes = enriquecidos.reduce((a, v) => a + (v.competencias ?? 0), 0);
  const totalDias = enriquecidos.reduce((a, v) => a + (v.total_dias ?? 0), 0);
  const tempoTotal = diasParaTempoContribuicao(totalDias);
  const pg = calcularPeriodoGraca(enriquecidos, dataReferencia, opcoes);
  const beneficios = identificarBeneficios(enriquecidos, pg, totalContribuicoes, tempoTotal);

  const ultimo = [...enriquecidos].sort((a, b) => {
    const fa = a.data_fim ? parseDate(a.data_fim).getTime() : Date.now();
    const fb = b.data_fim ? parseDate(b.data_fim).getTime() : Date.now();
    return fb - fa;
  })[0];

  return {
    vinculos: enriquecidos,
    total_contribuicoes: totalContribuicoes,
    tempo_total: tempoTotal,
    periodo_graca: pg,
    beneficios_possiveis: beneficios,
    data_referencia: dataReferencia,
    ultimo_vinculo: ultimo
      ? { categoria: ultimo.categoria, data_fim: ultimo.data_fim, empresa: ultimo.empresa }
      : null,
  };
}
