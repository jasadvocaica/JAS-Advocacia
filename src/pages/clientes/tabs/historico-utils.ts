export interface InteracaoLike {
  id: string;
  tipo: string;
  descricao: string;
  data: string;
  [k: string]: unknown;
}

export interface InteracoesParticionadas<T extends InteracaoLike> {
  automaticas: T[];
  manuais: T[];
}

/**
 * Separa interações do cliente em duas listas, mantendo a ordem original:
 *  - automaticas: registros gerados pelo sistema (tipo === "sistema")
 *  - manuais: demais canais (whatsapp, telefone, email, presencial, outro, etc.)
 */
export function particionarInteracoes<T extends InteracaoLike>(
  itens: T[] | null | undefined,
): InteracoesParticionadas<T> {
  const lista = Array.isArray(itens) ? itens : [];
  const automaticas: T[] = [];
  const manuais: T[] = [];
  for (const it of lista) {
    if (it && it.tipo === "sistema") automaticas.push(it);
    else if (it) manuais.push(it);
  }
  return { automaticas, manuais };
}
