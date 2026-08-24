/**
 * DataJud (CNJ) — Mapa de tribunais e helpers de número CNJ.
 * Documentação: https://datajud-wiki.cnj.jus.br/api-publica/acesso
 */

export interface TribunalInfo {
  alias: string;
  nome: string;
  segmento: "estadual" | "federal" | "trabalho" | "superior" | "eleitoral" | "militar";
}

export const TRIBUNAIS: Record<string, TribunalInfo> = {
  // Superiores
  TST: { alias: "api_publica_tst", nome: "Tribunal Superior do Trabalho", segmento: "superior" },
  TSE: { alias: "api_publica_tse", nome: "Tribunal Superior Eleitoral", segmento: "eleitoral" },
  STJ: { alias: "api_publica_stj", nome: "Superior Tribunal de Justiça", segmento: "superior" },
  STM: { alias: "api_publica_stm", nome: "Superior Tribunal Militar", segmento: "militar" },

  // Justiça Federal
  TRF1: { alias: "api_publica_trf1", nome: "TRF 1ª Região", segmento: "federal" },
  TRF2: { alias: "api_publica_trf2", nome: "TRF 2ª Região", segmento: "federal" },
  TRF3: { alias: "api_publica_trf3", nome: "TRF 3ª Região", segmento: "federal" },
  TRF4: { alias: "api_publica_trf4", nome: "TRF 4ª Região", segmento: "federal" },
  TRF5: { alias: "api_publica_trf5", nome: "TRF 5ª Região", segmento: "federal" },
  TRF6: { alias: "api_publica_trf6", nome: "TRF 6ª Região", segmento: "federal" },

  // Justiça Estadual
  TJAC: { alias: "api_publica_tjac", nome: "TJAC — Acre", segmento: "estadual" },
  TJAL: { alias: "api_publica_tjal", nome: "TJAL — Alagoas", segmento: "estadual" },
  TJAM: { alias: "api_publica_tjam", nome: "TJAM — Amazonas", segmento: "estadual" },
  TJAP: { alias: "api_publica_tjap", nome: "TJAP — Amapá", segmento: "estadual" },
  TJBA: { alias: "api_publica_tjba", nome: "TJBA — Bahia", segmento: "estadual" },
  TJCE: { alias: "api_publica_tjce", nome: "TJCE — Ceará", segmento: "estadual" },
  TJDFT: { alias: "api_publica_tjdft", nome: "TJDFT — Distrito Federal", segmento: "estadual" },
  TJES: { alias: "api_publica_tjes", nome: "TJES — Espírito Santo", segmento: "estadual" },
  TJGO: { alias: "api_publica_tjgo", nome: "TJGO — Goiás", segmento: "estadual" },
  TJMA: { alias: "api_publica_tjma", nome: "TJMA — Maranhão", segmento: "estadual" },
  TJMG: { alias: "api_publica_tjmg", nome: "TJMG — Minas Gerais", segmento: "estadual" },
  TJMS: { alias: "api_publica_tjms", nome: "TJMS — Mato Grosso do Sul", segmento: "estadual" },
  TJMT: { alias: "api_publica_tjmt", nome: "TJMT — Mato Grosso", segmento: "estadual" },
  TJPA: { alias: "api_publica_tjpa", nome: "TJPA — Pará", segmento: "estadual" },
  TJPB: { alias: "api_publica_tjpb", nome: "TJPB — Paraíba", segmento: "estadual" },
  TJPE: { alias: "api_publica_tjpe", nome: "TJPE — Pernambuco", segmento: "estadual" },
  TJPI: { alias: "api_publica_tjpi", nome: "TJPI — Piauí", segmento: "estadual" },
  TJPR: { alias: "api_publica_tjpr", nome: "TJPR — Paraná", segmento: "estadual" },
  TJRJ: { alias: "api_publica_tjrj", nome: "TJRJ — Rio de Janeiro", segmento: "estadual" },
  TJRN: { alias: "api_publica_tjrn", nome: "TJRN — Rio Grande do Norte", segmento: "estadual" },
  TJRO: { alias: "api_publica_tjro", nome: "TJRO — Rondônia", segmento: "estadual" },
  TJRR: { alias: "api_publica_tjrr", nome: "TJRR — Roraima", segmento: "estadual" },
  TJRS: { alias: "api_publica_tjrs", nome: "TJRS — Rio Grande do Sul", segmento: "estadual" },
  TJSC: { alias: "api_publica_tjsc", nome: "TJSC — Santa Catarina", segmento: "estadual" },
  TJSE: { alias: "api_publica_tjse", nome: "TJSE — Sergipe", segmento: "estadual" },
  TJSP: { alias: "api_publica_tjsp", nome: "TJSP — São Paulo", segmento: "estadual" },
  TJTO: { alias: "api_publica_tjto", nome: "TJTO — Tocantins", segmento: "estadual" },

  // Justiça do Trabalho
  TRT1: { alias: "api_publica_trt1", nome: "TRT 1ª Região — RJ", segmento: "trabalho" },
  TRT2: { alias: "api_publica_trt2", nome: "TRT 2ª Região — SP", segmento: "trabalho" },
  TRT3: { alias: "api_publica_trt3", nome: "TRT 3ª Região — MG", segmento: "trabalho" },
  TRT4: { alias: "api_publica_trt4", nome: "TRT 4ª Região — RS", segmento: "trabalho" },
  TRT5: { alias: "api_publica_trt5", nome: "TRT 5ª Região — BA", segmento: "trabalho" },
  TRT6: { alias: "api_publica_trt6", nome: "TRT 6ª Região — PE", segmento: "trabalho" },
  TRT7: { alias: "api_publica_trt7", nome: "TRT 7ª Região — CE", segmento: "trabalho" },
  TRT8: { alias: "api_publica_trt8", nome: "TRT 8ª Região — PA/AP", segmento: "trabalho" },
  TRT9: { alias: "api_publica_trt9", nome: "TRT 9ª Região — PR", segmento: "trabalho" },
  TRT10: { alias: "api_publica_trt10", nome: "TRT 10ª Região — DF/TO", segmento: "trabalho" },
  TRT11: { alias: "api_publica_trt11", nome: "TRT 11ª Região — AM/RR", segmento: "trabalho" },
  TRT12: { alias: "api_publica_trt12", nome: "TRT 12ª Região — SC", segmento: "trabalho" },
  TRT13: { alias: "api_publica_trt13", nome: "TRT 13ª Região — PB", segmento: "trabalho" },
  TRT14: { alias: "api_publica_trt14", nome: "TRT 14ª Região — RO/AC", segmento: "trabalho" },
  TRT15: { alias: "api_publica_trt15", nome: "TRT 15ª Região — Campinas", segmento: "trabalho" },
  TRT16: { alias: "api_publica_trt16", nome: "TRT 16ª Região — MA", segmento: "trabalho" },
  TRT17: { alias: "api_publica_trt17", nome: "TRT 17ª Região — ES", segmento: "trabalho" },
  TRT18: { alias: "api_publica_trt18", nome: "TRT 18ª Região — GO", segmento: "trabalho" },
  TRT19: { alias: "api_publica_trt19", nome: "TRT 19ª Região — AL", segmento: "trabalho" },
  TRT20: { alias: "api_publica_trt20", nome: "TRT 20ª Região — SE", segmento: "trabalho" },
  TRT21: { alias: "api_publica_trt21", nome: "TRT 21ª Região — RN", segmento: "trabalho" },
  TRT22: { alias: "api_publica_trt22", nome: "TRT 22ª Região — PI", segmento: "trabalho" },
  TRT23: { alias: "api_publica_trt23", nome: "TRT 23ª Região — MT", segmento: "trabalho" },
  TRT24: { alias: "api_publica_trt24", nome: "TRT 24ª Região — MS", segmento: "trabalho" },
};

/**
 * Deriva a sigla do tribunal a partir do número CNJ (20 dígitos).
 * Formato: NNNNNNN-DD.AAAA.J.TT.OOOO
 * J = segmento, TT = tribunal
 */
export function derivarTribunalDoCNJ(numeroCNJ: string): string | null {
  const limpo = numeroCNJ.replace(/\D/g, "");
  if (limpo.length !== 20) return null;

  const segmento = parseInt(limpo.charAt(13), 10);
  const tribunal = parseInt(limpo.substring(14, 16), 10);

  if (segmento === 8) {
    const mapa: Record<number, string> = {
      1: "TJAC", 2: "TJAL", 3: "TJAP", 4: "TJAM", 5: "TJBA", 6: "TJCE",
      7: "TJDFT", 8: "TJES", 9: "TJGO", 10: "TJMA", 11: "TJMT", 12: "TJMS",
      13: "TJMG", 14: "TJPA", 15: "TJPB", 16: "TJPE", 17: "TJPI", 18: "TJPR",
      19: "TJRJ", 20: "TJRN", 21: "TJRO", 22: "TJRR", 23: "TJRS", 24: "TJSC",
      25: "TJSE", 26: "TJSP", 27: "TJTO",
    };
    return mapa[tribunal] ?? null;
  }
  if (segmento === 4) {
    const mapa: Record<number, string> = {
      1: "TRF1", 2: "TRF2", 3: "TRF3", 4: "TRF4", 5: "TRF5", 6: "TRF6",
    };
    return mapa[tribunal] ?? null;
  }
  if (segmento === 5) return `TRT${tribunal}`;
  if (segmento === 3 && tribunal === 4) return "STJ";
  if (segmento === 3 && tribunal === 1) return "STM";
  if (segmento === 6) return "TSE";
  if (segmento === 2) return "TST";
  return null;
}

export function tribunalSuportado(sigla: string | null): boolean {
  return !!sigla && sigla in TRIBUNAIS;
}

/**
 * Valida se a string contém um número CNJ com 20 dígitos.
 * (Formatação opcional — pontuação é ignorada.)
 */
export function validarCNJ(numeroCNJ: string): boolean {
  return numeroCNJ.replace(/\D/g, "").length === 20;
}

/**
 * Validação completa: 20 dígitos + dígito verificador (módulo 97 base 10),
 * conforme Resolução CNJ nº 65/2008.
 * Retorna `true` quando o número é estruturalmente válido.
 */
export function validarCNJDigitoVerificador(numeroCNJ: string): boolean {
  const d = numeroCNJ.replace(/\D/g, "");
  if (d.length !== 20) return false;
  // NNNNNNN DD AAAA J TT OOOO  →  NNNNNNN AAAA J TT OOOO + DD (2 dígitos)
  const seq = d.slice(0, 7) + d.slice(9, 20) + d.slice(7, 9);
  // Cálculo: número mod 97 deve ser 1
  let resto = 0;
  for (const ch of seq) {
    resto = (resto * 10 + Number(ch)) % 97;
  }
  return resto === 1;
}

/**
 * Retorna o CNJ no formato canônico NNNNNNN-DD.AAAA.J.TT.OOOO
 * a partir de qualquer entrada (com ou sem pontuação).
 * Retorna `null` se não houver 20 dígitos.
 */
export function normalizarCNJ(numeroCNJ: string): string | null {
  const d = numeroCNJ.replace(/\D/g, "");
  if (d.length !== 20) return null;
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16, 20)}`;
}

