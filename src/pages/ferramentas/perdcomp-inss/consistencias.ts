/**
 * Lógica pura de verificação de consistência da ferramenta PER/DCOMP INSS Retido.
 *
 * Esta função foi extraída do componente para permitir testes unitários sem React.
 * Não depende de hooks, setters de estado ou efeitos colaterais (toasts, navegação,
 * localStorage). As "ações rápidas" são representadas como identificadores
 * semânticos (`AcaoId`) que o componente mapeia para handlers reais.
 */

export type Severidade = "warn" | "error" | "info";

export type TipoEmpreitada = "total" | "parcial" | "indefinido";
export type ModoMaterial = "presuncao" | "discriminado";

export type AcaoId =
  | "set_aliquota_11"
  | "set_aliquota_3_5"
  | "voltar_dados"
  | "abrir_config_alertas"
  | "recarregar"
  | "modo_presuncao"
  | "modo_discriminado"
  | "tipo_total"
  | "resetar_materiais"
  | "zerar_dctf"
  | "limitar_dctf_ao_retido"
  | "ajustar_competencia_mes_anterior";

export type AcaoSemantica = {
  id: AcaoId;
  label: string;
  hint?: string;
};

export type Consistencia = {
  id: string;
  severidade: Severidade;
  titulo: string;
  descricao: string;
  /** Motivo do enquadramento — explica qual perfil/limite disparou o aviso. */
  motivo?: string;
  dica?: string;
  acoes?: AcaoSemantica[];
};

export type CalcInputs = {
  /** Valor bruto da NFS-e em reais. */
  vb: number;
  /** Alíquota efetiva (0–1, ex.: 0.11 para 11%). */
  alq: number;
  /** INSS retido pelo tomador (informado / exibido). */
  inssRetido: number;
  /** Dedução já feita na DCTFWeb. */
  dedDCTF: number;
  /** % de materiais aplicado na base (0–100). */
  matPct: number;
  /** Base de cálculo correta (após materiais). */
  bcCorreta: number;
  /** INSS correto (sobre a base correta). */
  inssCorreto: number;
  /** INSS indevido (excesso = retido − correto). */
  inssIndevido: number;
  /** Crédito original = max(0, retido − dedDCTF). */
  creditoOriginal: number;
  /**
   * Meses entre a competência informada e o mês corrente.
   * Negativo = competência futura.
   */
  mesesAtraso: number;
};

export type Thresholds = {
  vbMin: number;
  vbMax: number;
  matMin: number;
  matMax: number;
};

export type PerfilAtivo = {
  nome: string;
  base: string;
  matFaixaTipica: string;
};

export type ConsistenciasParams = {
  calc: CalcInputs;
  tipoEmpreitada: TipoEmpreitada;
  modoMaterial: ModoMaterial;
  /**
   * String crua digitada pelo usuário no campo de % de materiais
   * (apenas relevante em `modoMaterial === "discriminado"`).
   */
  materialPctRaw: string;
  thresholds: Thresholds;
  perfilAtivo: PerfilAtivo;
  /** Quais thresholds estão sobrescritos manualmente pelo usuário. */
  overrides: { vbMin?: boolean; vbMax?: boolean; matMin?: boolean; matMax?: boolean };
  /** Competência alvo para sugestão de "mês anterior". Default = hoje. */
  hojeRef?: Date;
};

const fmt = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtPct = (v: number) => `${Number(v || 0).toFixed(2).replace(".", ",")}%`;

const competenciaMesAnterior = (hojeRef: Date) => {
  const d = new Date(hojeRef);
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

/**
 * Avalia todas as verificações de consistência e devolve a lista de avisos.
 * Retorna lista vazia quando o valor bruto é ≤ 0 (não há o que checar ainda).
 */
export function avaliarConsistencias(
  params: ConsistenciasParams,
): Consistencia[] {
  const {
    calc,
    tipoEmpreitada,
    modoMaterial,
    materialPctRaw,
    thresholds,
    perfilAtivo,
    overrides,
    hojeRef = new Date(),
  } = params;

  const lista: Consistencia[] = [];
  const {
    vb,
    alq,
    inssRetido,
    dedDCTF,
    matPct,
    bcCorreta,
    inssCorreto,
    inssIndevido,
    creditoOriginal,
    mesesAtraso,
  } = calc;

  if (vb <= 0) return lista;

  // 1. Alíquota fora do padrão
  const alqPct = alq * 100;
  if (alqPct !== 11) {
    lista.push({
      id: "aliquota_fora_padrao",
      severidade: alqPct < 3.5 || alqPct > 11 ? "error" : "warn",
      titulo: `Alíquota ${fmtPct(alqPct)} fora do padrão`,
      descricao:
        "A retenção previdenciária da Lei 9.711/98 é tipicamente 11% (3,5% para construção civil sob regime especial). Confirme se o tomador aplicou a alíquota correta — divergência aqui pode justificar ainda mais o pedido de restituição.",
      dica: "Se o contrato está sob regime especial (desoneração), use 3,5%. Caso contrário, 11% é o padrão.",
      acoes: [
        { id: "set_aliquota_11", label: "Aplicar 11% (padrão)" },
        { id: "set_aliquota_3_5", label: "Aplicar 3,5% (desoneração)" },
      ],
    });
  }

  // 2. Valor bruto fora da faixa do perfil
  const motivoPerfil = `Perfil "${perfilAtivo.nome}" (${perfilAtivo.base})`;
  if (vb < thresholds.vbMin) {
    lista.push({
      id: "vb_baixo",
      severidade: "warn",
      titulo: "Valor bruto abaixo do esperado",
      descricao: `O valor de ${fmt(vb)} está abaixo do limite mínimo configurado (${fmt(
        thresholds.vbMin,
      )}). Confira se digitou o valor correto.`,
      motivo: `${motivoPerfil} — limite mínimo: ${fmt(thresholds.vbMin)}${
        overrides.vbMin ? " (override manual)" : ""
      }.`,
      dica: 'Se este valor é normal no seu caso, ajuste o limite mínimo em "Configurar alertas" ou troque o perfil de regime.',
      acoes: [
        { id: "voltar_dados", label: "Voltar e corrigir valor bruto" },
        { id: "abrir_config_alertas", label: "Configurar alertas" },
      ],
    });
  }
  if (vb > thresholds.vbMax) {
    lista.push({
      id: "vb_alto",
      severidade: "warn",
      titulo: "Valor bruto acima do esperado",
      descricao: `${fmt(vb)} ultrapassa o limite máximo configurado (${fmt(
        thresholds.vbMax,
      )}). Confirme se a vírgula decimal está no lugar correto.`,
      motivo: `${motivoPerfil} — limite máximo: ${fmt(thresholds.vbMax)}${
        overrides.vbMax ? " (override manual)" : ""
      }.`,
      dica: 'Se valores altos são esperados (ex.: obra de grande porte), ajuste o limite em "Configurar alertas".',
      acoes: [
        { id: "voltar_dados", label: "Voltar e corrigir valor bruto" },
        { id: "abrir_config_alertas", label: "Configurar alertas" },
      ],
    });
  }

  // 3. Coerência aritmética do INSS retido
  const inssRetidoEsperado = vb * alq;
  if (Math.abs(inssRetido - inssRetidoEsperado) > 0.01) {
    lista.push({
      id: "inss_aritmetica",
      severidade: "error",
      titulo: "Inconsistência aritmética no INSS retido",
      descricao: `O cálculo (${fmt(vb)} × ${fmtPct(alqPct)} = ${fmt(
        inssRetidoEsperado,
      )}) não bate com o valor exibido (${fmt(inssRetido)}). Recarregue a página.`,
      dica: "Esse caso é raro — geralmente indica estado corrompido. Recarregue para zerar.",
      acoes: [{ id: "recarregar", label: "Recarregar página" }],
    });
  }

  // 3b. Conciliação base × materiais × INSS retido
  const parcelaMateriais = vb * (matPct / 100);
  const somaBaseMateriais = bcCorreta + parcelaMateriais;
  if (vb > 0 && Math.abs(somaBaseMateriais - vb) > 0.02) {
    lista.push({
      id: "base_materiais_nao_fecha",
      severidade: "error",
      titulo: "Base + materiais não fecha com o valor bruto",
      descricao: `Base de cálculo (${fmt(bcCorreta)}) + parcela de materiais (${fmt(
        parcelaMateriais,
      )}) = ${fmt(somaBaseMateriais)}, diferente do valor bruto da NFS-e (${fmt(
        vb,
      )}). Há inconsistência no % de materiais aplicado.`,
      dica: "A soma da mão de obra tributável + materiais deduzidos deve ser igual ao valor bruto da nota.",
      acoes: [{ id: "modo_presuncao", label: "Trocar para presunção legal" }],
    });
  }

  // 3c. Conciliação por modo de empreitada
  if (tipoEmpreitada === "indefinido") {
    lista.push({
      id: "tipo_empreitada_indefinido",
      severidade: "warn",
      titulo: "Tipo de empreitada não classificado",
      descricao:
        "Sem definir total ou parcial, a base usada no cálculo pode não refletir o cabimento jurídico. A conciliação só é confiável após a classificação.",
      dica: "Total = retenção 100% indevida (base zero). Parcial = base é a mão de obra (vb × (1 − %materiais)).",
    });
  }

  if (tipoEmpreitada === "total") {
    if (inssCorreto > 0.01) {
      lista.push({
        id: "total_base_nao_zero",
        severidade: "error",
        titulo: "Empreitada total com base de cálculo > 0",
        descricao: `Em empreitada total, a base esperada é R$ 0,00 (retenção 100% indevida), mas o cálculo apresenta base de ${fmt(
          bcCorreta,
        )} e INSS correto de ${fmt(
          inssCorreto,
        )}. Verifique a configuração do tipo/discriminação.`,
        dica: "Empreitada total ignora % de materiais — todo INSS retido vira crédito. Reset os campos de materiais.",
        acoes: [{ id: "resetar_materiais", label: "Resetar materiais (presunção)" }],
      });
    }
  }

  if (tipoEmpreitada === "parcial" && vb > 0) {
    const bcEsperada = vb * (1 - matPct / 100);
    const inssCorretoEsperado = bcEsperada * alq;
    if (Math.abs(bcCorreta - bcEsperada) > 0.02) {
      lista.push({
        id: "parcial_base_divergente",
        severidade: "error",
        titulo: "Base parcial divergente da fórmula legal",
        descricao: `Base esperada para empreitada parcial: ${fmt(vb)} × (1 − ${fmtPct(
          matPct,
        )}) = ${fmt(bcEsperada)}. O cálculo apresentou ${fmt(
          bcCorreta,
        )}. Diferença de ${fmt(Math.abs(bcCorreta - bcEsperada))}.`,
        dica: "Verifique se o tipo de obra (presunção) ou o % de materiais discriminado está correto.",
      });
    }
    if (Math.abs(inssCorreto - inssCorretoEsperado) > 0.02) {
      lista.push({
        id: "parcial_inss_correto_divergente",
        severidade: "error",
        titulo: "INSS correto não bate com base × alíquota",
        descricao: `INSS correto esperado: ${fmt(bcEsperada)} × ${fmtPct(
          alqPct,
        )} = ${fmt(inssCorretoEsperado)}. Calculado: ${fmt(inssCorreto)}.`,
        dica: "Indica problema de arredondamento. Recarregue a tela.",
        acoes: [{ id: "recarregar", label: "Recarregar página" }],
      });
    }
    const somaIndevidoCorreto = inssIndevido + inssCorreto;
    if (Math.abs(somaIndevidoCorreto - inssRetido) > 0.02) {
      lista.push({
        id: "parcial_indevido_correto_nao_fecha",
        severidade: "error",
        titulo: "INSS indevido + correto ≠ INSS retido",
        descricao: `${fmt(inssIndevido)} (indevido) + ${fmt(
          inssCorreto,
        )} (correto) = ${fmt(somaIndevidoCorreto)}, diferente de ${fmt(
          inssRetido,
        )} (retido). A conciliação da base falhou.`,
        dica: "Esse erro indica que a fórmula de cálculo não fechou. Reveja todos os campos da nota.",
      });
    }
  }

  // 4. Empreitada parcial sem materiais
  if (tipoEmpreitada === "parcial" && matPct === 0) {
    lista.push({
      id: "sem_materiais_parcial",
      severidade: "warn",
      titulo: "Empreitada parcial sem dedução de materiais",
      descricao:
        "Você marcou empreitada parcial mas o % de materiais é 0%. Isso significa que a base de cálculo é o valor bruto integral — não há crédito por excesso. Verifique se é mesmo o caso ou ajuste o tipo de obra / discriminação.",
      dica: "Se houve fornecimento de materiais, escolha um tipo de obra com presunção legal ou discrimine o %.",
      acoes: [
        { id: "modo_presuncao", label: "Usar presunção legal por tipo de obra" },
        { id: "modo_discriminado", label: "Discriminar % de materiais" },
        {
          id: "tipo_total",
          label: "Mudar para empreitada total",
          hint: "Se 100% foi materiais, retenção é totalmente indevida",
        },
      ],
    });
  }

  // 5. Materiais discriminados fora da faixa do perfil
  if (modoMaterial === "discriminado") {
    const n = parseFloat(materialPctRaw);
    if (!isNaN(n) && n > 0 && n < thresholds.matMin) {
      lista.push({
        id: "materiais_baixos",
        severidade: "warn",
        titulo: `Materiais discriminados abaixo da faixa esperada (${fmtPct(n)})`,
        descricao: `O percentual está abaixo do mínimo configurado (${fmtPct(
          thresholds.matMin,
        )}). Faixa típica do perfil: ${perfilAtivo.matFaixaTipica}.`,
        motivo: `${motivoPerfil} — limite mínimo de materiais: ${fmtPct(
          thresholds.matMin,
        )}${overrides.matMin ? " (override manual)" : ""}.`,
        dica: "Se você não tem certeza do %, prefira a presunção legal. Se o serviço é majoritariamente mão de obra (limpeza, vigilância), troque o perfil de regime.",
        acoes: [
          { id: "modo_presuncao", label: "Trocar para presunção legal" },
          { id: "abrir_config_alertas", label: "Configurar alertas" },
        ],
      });
    }
    if (!isNaN(n) && n > thresholds.matMax) {
      lista.push({
        id: "materiais_altos",
        severidade: "warn",
        titulo: `Materiais discriminados acima da faixa esperada (${fmtPct(n)})`,
        descricao: `O percentual ultrapassa o máximo configurado (${fmtPct(
          thresholds.matMax,
        )}). Faixa típica do perfil: ${perfilAtivo.matFaixaTipica}. Assegure-se de que há documentação fiscal (NFs de materiais) que comprove o percentual.`,
        motivo: `${motivoPerfil} — limite máximo de materiais: ${fmtPct(
          thresholds.matMax,
        )}${overrides.matMax ? " (override manual)" : ""}.`,
        dica: "Se >95% mesmo, considere reclassificar como empreitada total (retenção indevida). Se o seu regime aceita mais materiais, ajuste o limite.",
        acoes: [
          { id: "tipo_total", label: "Mudar para empreitada total" },
          { id: "modo_presuncao", label: "Trocar para presunção legal" },
          { id: "abrir_config_alertas", label: "Configurar alertas" },
        ],
      });
    }
  }

  // 6. Base zero ou negativa fora de "total"
  if (bcCorreta <= 0 && tipoEmpreitada !== "total") {
    lista.push({
      id: "bc_zero",
      severidade: "error",
      titulo: "Base de cálculo correta = R$ 0,00",
      descricao:
        "Com 100% de materiais, não há mão de obra tributável. Se for esse o caso, o cabimento é 'empreitada total' (retenção indevida), não 'parcial'. Reveja a classificação.",
      dica: "Empreitada total = retenção 100% indevida. Crédito = INSS retido integral.",
      acoes: [
        { id: "tipo_total", label: "Mudar para empreitada total" },
        { id: "modo_discriminado", label: "Revisar % de materiais" },
      ],
    });
  }

  // 7. Dedução DCTFWeb maior que o retido
  if (dedDCTF > inssRetido + 0.01) {
    lista.push({
      id: "deducao_excede",
      severidade: "error",
      titulo: "Dedução na DCTFWeb maior que o INSS retido",
      descricao: `A dedução informada (${fmt(dedDCTF)}) excede o INSS efetivamente retido (${fmt(inssRetido)}). Revise o valor — não é possível deduzir mais do que foi retido.`,
      dica: "Confira o relatório de retenções da DCTFWeb desta competência.",
      acoes: [
        { id: "zerar_dctf", label: "Zerar dedução DCTFWeb" },
        { id: "limitar_dctf_ao_retido", label: "Limitar ao INSS retido" },
      ],
    });
  }

  // 8. Crédito ≈ 0
  if (creditoOriginal <= 0.01 && inssRetido > 0) {
    lista.push({
      id: "credito_zero",
      severidade: "warn",
      titulo: "Crédito líquido próximo de zero",
      descricao:
        "Após deduções, não sobra crédito a pedir. Verifique se a dedução na DCTFWeb está correta — caso contrário, o PER/DCOMP não é necessário para esta competência.",
      dica: "Se a retenção já foi 100% deduzida na DCTFWeb, não há crédito a restituir.",
      acoes: [{ id: "zerar_dctf", label: "Zerar dedução DCTFWeb" }],
    });
  }

  // 9. Crédito > retido (impossível)
  if (creditoOriginal > inssRetido + 0.01) {
    lista.push({
      id: "credito_maior_retido",
      severidade: "error",
      titulo: "Crédito maior que o INSS retido",
      descricao:
        "O crédito a pedir não pode exceder o valor efetivamente retido. Há inconsistência nos dados.",
      dica: "Geralmente significa dedução negativa. Zere o campo de dedução para investigar.",
      acoes: [{ id: "zerar_dctf", label: "Zerar dedução DCTFWeb" }],
    });
  }

  // 10. Prescrição (5 anos)
  if (mesesAtraso > 60) {
    lista.push({
      id: "prescrito",
      severidade: "error",
      titulo: "Competência possivelmente PRESCRITA",
      descricao: `Já se passaram ${mesesAtraso} meses (${(mesesAtraso / 12).toFixed(1)} anos) desde a competência. O prazo do art. 168, I do CTN é de 5 anos. O PER/DCOMP pode ser indeferido por prescrição.`,
      dica: "Confira a competência. Se houve causa interruptiva (ação judicial, denúncia espontânea), documente nos autos.",
      acoes: [
        { id: "voltar_dados", label: "Corrigir competência" },
        {
          id: "ajustar_competencia_mes_anterior",
          label: `Usar ${competenciaMesAnterior(hojeRef)} (mês anterior)`,
        },
      ],
    });
  } else if (mesesAtraso > 54) {
    lista.push({
      id: "prescricao_proxima",
      severidade: "warn",
      titulo: "Prescrição se aproxima",
      descricao: `Faltam apenas ${60 - mesesAtraso} meses para a prescrição quinquenal. Priorize o protocolo deste PER/DCOMP.`,
      dica: "Recomendamos protocolar com folga de pelo menos 90 dias do prazo final.",
    });
  }

  // 11. Competência futura
  if (mesesAtraso < 0) {
    lista.push({
      id: "comp_futura",
      severidade: "error",
      titulo: "Competência no futuro",
      descricao:
        "Não é possível pedir restituição de retenção que ainda não ocorreu.",
      dica: "A última competência válida hoje é normalmente o mês imediatamente anterior.",
      acoes: [
        { id: "voltar_dados", label: "Corrigir competência" },
        {
          id: "ajustar_competencia_mes_anterior",
          label: `Usar ${competenciaMesAnterior(hojeRef)} (mês anterior)`,
        },
      ],
    });
  }

  return lista;
}
