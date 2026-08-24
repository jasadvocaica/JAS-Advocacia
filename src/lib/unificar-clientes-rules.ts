// Espelha em TypeScript as regras de resolução de `ativo` e `status` aplicadas
// pela função PL/pgSQL `public.unificar_clientes`. Mantém este arquivo e a
// função SQL em sincronia — qualquer mudança em uma exige mudança na outra.

export interface ClienteAtivacao {
  ativo: boolean | null;
  status: string | null;
}

export interface ResolucaoUnificacao {
  ativo: boolean;
  status: string;
}

/**
 * Resolve os campos `ativo` e `status` ao mesclar dois clientes.
 * Regra: se qualquer um dos dois estava ativo, o resultado é ativo.
 * Status 'ativo' tem precedência; depois evita-se 'inativo' se houver alternativa.
 */
export function resolverAtivoStatusUnificacao(
  mantido: ClienteAtivacao,
  removido: ClienteAtivacao,
): ResolucaoUnificacao {
  const ativoM = mantido.ativo === true;
  const ativoR = removido.ativo === true;
  const ativo = ativoM || ativoR;

  const sM = mantido.status ?? null;
  const sR = removido.status ?? null;

  let status: string;
  if (sM === "ativo" || sR === "ativo") {
    status = "ativo";
  } else if (ativo) {
    const naoInativoM = sM && sM !== "inativo" ? sM : null;
    const naoInativoR = sR && sR !== "inativo" ? sR : null;
    status = naoInativoM ?? naoInativoR ?? "ativo";
  } else {
    status = sM ?? sR ?? "inativo";
  }

  return { ativo, status };
}
