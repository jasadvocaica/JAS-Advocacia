// Helper compartilhado entre EditorJuridico (Modelo) e PecaEditor (Peça)
// para calcular as margens efetivas da folha A4. Garante que a impressão
// e o PDF tenham o MESMO comportamento nos dois editores.

import type { TimbradoConfig } from "@/hooks/useTimbrado";

export type MargensCm = { sup: number; inf: number; esq: number; dir: number };

// Padrão ABNT-like usado quando não há timbrado ativo. Os dois editores devem
// usar exatamente os mesmos valores para garantir impressão idêntica.
export const MARGENS_PADRAO_CM: MargensCm = { sup: 3, inf: 2, esq: 3, dir: 2 };

// Margens laterais padrão usadas quando o timbrado é aplicado em modo
// cabeçalho/rodapé (espelha `obterMargensTimbrado` em `src/lib/timbrado-pdf.ts`).
const MARGEM_LATERAL_PADRAO_MM = 25;
const FOLGA_CABECALHO_RODAPE_MM = 5;

export interface CalcularMargensOpts {
  timbrado: TimbradoConfig;
  timbradoVisivel: boolean;
  /**
   * Margens informadas pelo usuário (cm) — usadas quando NÃO há timbrado
   * em modo `imagem_fundo` nem `cabecalho_rodape` ativo.
   */
  margensUsuario?: MargensCm;
}

/**
 * Calcula as margens efetivas (em cm) da folha A4, replicando a lógica do
 * gerador de PDF para que o preview seja realmente WYSIWYG e idêntico entre
 * os editores de Modelo e Peça.
 */
export function calcularMargensEditor({
  timbrado,
  timbradoVisivel,
  margensUsuario = MARGENS_PADRAO_CM,
}: CalcularMargensOpts): MargensCm {
  const usandoFundoTimbrado =
    timbradoVisivel &&
    timbrado.ativo &&
    timbrado.modo === "imagem_fundo" &&
    !!timbrado.paginaInteiraUrl;

  const usandoCabecalhoRodape =
    timbradoVisivel && timbrado.ativo && timbrado.modo === "cabecalho_rodape";

  if (usandoFundoTimbrado) {
    return {
      sup: timbrado.paginaInteiraMargemTopoMm / 10,
      inf: timbrado.paginaInteiraMargemBaseMm / 10,
      esq: timbrado.paginaInteiraMargemEsqMm / 10,
      dir: timbrado.paginaInteiraMargemDirMm / 10,
    };
  }

  if (usandoCabecalhoRodape) {
    const topoMm = timbrado.cabecalhoUrl
      ? timbrado.cabecalhoAlturaMm + FOLGA_CABECALHO_RODAPE_MM
      : margensUsuario.sup * 10;
    const baseMm = timbrado.rodapeUrl
      ? timbrado.rodapeAlturaMm + FOLGA_CABECALHO_RODAPE_MM
      : margensUsuario.inf * 10;
    return {
      sup: topoMm / 10,
      inf: baseMm / 10,
      esq: MARGEM_LATERAL_PADRAO_MM / 10,
      dir: MARGEM_LATERAL_PADRAO_MM / 10,
    };
  }

  return margensUsuario;
}
